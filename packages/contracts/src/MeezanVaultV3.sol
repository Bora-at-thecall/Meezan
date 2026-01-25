// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";

/**
 * @title MeezanVaultV3
 * @notice Multi-asset portfolio vault with automatic rebalancing and USDC conversion
 * @dev Extends V2 with instant atomic conversion and background conversion fallback
 *
 * Key additions from V2:
 * - convertAndWithdraw(): Instant atomic conversion to USDC + withdrawal
 * - Background conversion: requestConversion() + executeConversion() for fallback
 * - Conversion executor: Separate from rebalance executor, set at construction
 *
 * Invariants:
 * - INV-W1: withdrawAll() ALWAYS succeeds, regardless of conversion state
 * - INV-W2: withdrawAll() never performs swaps
 * - INV-W3: withdrawAll() auto-cancels pending conversion
 * - INV-C1: convertAndWithdraw() is atomic - full success or full revert
 * - INV-C2: No partial conversion state is possible
 * - INV-C3: Only one pending conversion at a time
 *
 * @dev IMPORTANT: This contract does NOT support fee-on-transfer or rebasing tokens.
 */
contract MeezanVaultV3 is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint8 public constant MAX_ASSETS = 10;
    uint8 public constant MIN_ASSETS = 2;
    uint16 public constant MIN_WEIGHT_BPS = 100;      // 1% minimum per asset
    uint16 public constant MIN_DRIFT_BPS = 200;       // 2% minimum threshold
    uint16 public constant MAX_DRIFT_BPS = 2000;      // 20% maximum threshold
    uint32 public constant COOLDOWN_SECONDS = 43200;  // 12 hours
    uint32 public constant MAX_PRICE_STALENESS = 3600;        // 1 hour for volatile assets
    uint32 public constant MAX_PRICE_STALENESS_STABLE = 90000; // 25 hours for stablecoins
    uint256 public constant MIN_SWAP_USD = 1e18;      // $1 minimum swap
    uint256 private constant USD_PRECISION = 1e18;
    uint256 private constant BPS_DENOMINATOR = 10000;
    uint16 public constant MIN_SLIPPAGE_BPS = 10;     // 0.1%
    uint16 public constant MAX_SLIPPAGE_BPS = 500;    // 5%
    uint16 public constant DEFAULT_SLIPPAGE_BPS = 100; // 1%
    uint8 public constant MAX_SWAPS_PER_REBALANCE = 18; // Max swaps: 9 sells + 9 buys

    // ============ Errors ============

    error OnlyOwner();
    error OnlyOwnerOrExecutor();
    error OnlyConversionExecutor();
    error ZeroAmount();
    error ZeroAddress();
    error DuplicateAsset();
    error TooFewAssets();
    error TooManyAssets();
    error InvalidAllocation();
    error WeightTooSmall();
    error StablecoinNotInAssets();
    error InvalidDriftThreshold();
    error InvalidPoolFee();
    error InvalidTokenDecimals();
    error InvalidFeedDecimals();
    error InvalidSlippageBps();
    error InsufficientBalance();
    error DriftBelowThreshold();
    error CooldownNotElapsed();
    error EmptyVault();
    error InvalidPrice();
    error StalePrice();
    error IncompleteRound();
    error NotPendingOwner();
    error CannotRescueVaultToken();
    error InvalidAssetIndex();
    error SlippageExceeded();
    error InsufficientBalanceForSwap();
    // V3 conversion errors
    error ConversionAlreadyPending();
    error NoConversionPending();
    error BackgroundConversionDisabled();
    error NoConversionExecutor();
    error ConversionPendingMustCancel();
    error InvalidMinAmountsLength();
    error ZeroMinAmountOut();

    // ============ Events ============

    event Deposit(address indexed owner, address indexed token, uint256 amount);
    event Withdraw(address indexed owner, address indexed token, uint256 amount);
    event ExecutorSet(address indexed previousExecutor, address indexed newExecutor);
    event AutoRebalanceToggled(bool enabled);
    event SlippageUpdated(uint16 oldSlippage, uint16 newSlippage);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TokenRescued(address indexed token, uint256 amount);

    event RebalanceIntent(
        address indexed caller,
        uint16 portfolioDriftBps,
        int256[] deltas,
        uint64 timestamp
    );

    event Rebalanced(
        address indexed caller,
        uint16 preDriftBps,
        uint8 swapsExecuted,
        uint64 timestamp
    );

    event SwapExecuted(
        uint8 indexed assetIndex,
        bool isSell,
        uint256 assetAmount,
        uint256 usdcAmount
    );

    // V3 conversion events
    event ConvertedAndWithdrawn(
        address indexed owner,
        uint256 totalUSDC,
        uint256 cbBTCConverted,
        uint256 wethConverted
    );

    event ConversionRequested(
        address indexed owner,
        uint256 timestamp
    );

    event ConversionExecuted(
        address indexed executor,
        uint256 totalUSDC,
        uint256 cbBTCConverted,
        uint256 wethConverted
    );

    event ConversionCancelled(
        address indexed owner
    );

    event BackgroundConversionDisabledEvent(
        address indexed owner
    );

    event BackgroundConversionEnabled(
        address indexed owner
    );

    // ============ Structs ============

    struct AssetConfig {
        address token;
        address priceFeed;
        uint24 poolFee;
        uint16 targetWeightBps;
    }

    // ============ Immutable State ============

    uint8 public immutable assetCount;
    uint8 public immutable stablecoinIndex;
    uint16 public immutable driftThresholdBps;
    ISwapRouter public immutable swapRouter;

    /// @notice Conversion executor address (set at construction, cannot be changed)
    /// @dev Separate from rebalance executor for security isolation
    address public immutable conversionExecutor;

    // Fixed-size arrays (padded to MAX_ASSETS)
    address[MAX_ASSETS] internal _assets;
    address[MAX_ASSETS] internal _priceFeeds;
    uint24[MAX_ASSETS] internal _poolFees;
    uint16[MAX_ASSETS] internal _targetWeightsBps;
    uint8[MAX_ASSETS] internal _tokenDecimals;
    uint8[MAX_ASSETS] internal _feedDecimals;

    // ============ Mutable State ============

    address public owner;
    address public pendingOwner;
    uint64 public lastRebalanceAt;
    bool public autoRebalanceEnabled;
    address public executor;  // Rebalance executor
    uint16 public slippageBps;

    // V3 conversion state
    /// @notice Whether a background conversion is pending
    bool public conversionRequested;

    /// @notice Whether background conversion is disabled by owner
    bool public backgroundConversionDisabled;

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyOwnerOrExecutor() {
        bool isOwner = msg.sender == owner;
        bool isAuthorizedExecutor = autoRebalanceEnabled
            && executor != address(0)
            && msg.sender == executor;
        if (!isOwner && !isAuthorizedExecutor) revert OnlyOwnerOrExecutor();
        _;
    }

    modifier onlyConversionExecutor() {
        if (backgroundConversionDisabled) revert BackgroundConversionDisabled();
        if (msg.sender != conversionExecutor) revert OnlyConversionExecutor();
        _;
    }

    // ============ Constructor ============

    /**
     * @notice Deploy a new V3 multi-asset vault with conversion support
     * @param assets Array of asset configurations (2-10 assets)
     * @param _swapRouter Uniswap V3 SwapRouter address
     * @param _stablecoin Address of stablecoin (must be in assets array)
     * @param _driftThresholdBps Drift threshold in basis points (200-2000)
     * @param _owner Address of vault owner
     * @param _conversionExecutor Address authorized to execute background conversions
     */
    constructor(
        AssetConfig[] memory assets,
        address _swapRouter,
        address _stablecoin,
        uint16 _driftThresholdBps,
        address _owner,
        address _conversionExecutor
    ) {
        // Validate asset count
        if (assets.length < MIN_ASSETS) revert TooFewAssets();
        if (assets.length > MAX_ASSETS) revert TooManyAssets();

        // Validate addresses
        if (_swapRouter == address(0)) revert ZeroAddress();
        if (_owner == address(0)) revert ZeroAddress();
        // Note: _conversionExecutor can be address(0) to disable background conversion

        // Validate drift threshold
        if (_driftThresholdBps < MIN_DRIFT_BPS || _driftThresholdBps > MAX_DRIFT_BPS) {
            revert InvalidDriftThreshold();
        }

        // Validate weights and find stablecoin
        uint256 totalWeight = 0;
        bool stablecoinFound = false;
        uint8 stableIdx = 0;

        for (uint8 i = 0; i < assets.length; i++) {
            AssetConfig memory asset = assets[i];

            if (asset.token == address(0)) revert ZeroAddress();
            if (asset.priceFeed == address(0)) revert ZeroAddress();

            // Check duplicates
            for (uint8 j = 0; j < i; j++) {
                if (asset.token == assets[j].token) revert DuplicateAsset();
            }

            if (asset.targetWeightBps < MIN_WEIGHT_BPS) revert WeightTooSmall();

            if (asset.poolFee != 100 && asset.poolFee != 500 && asset.poolFee != 3000 && asset.poolFee != 10000) {
                revert InvalidPoolFee();
            }

            uint8 tokenDec = IERC20Metadata(asset.token).decimals();
            uint8 feedDec = AggregatorV3Interface(asset.priceFeed).decimals();
            if (tokenDec > 18) revert InvalidTokenDecimals();
            if (feedDec > 18) revert InvalidFeedDecimals();

            _assets[i] = asset.token;
            _priceFeeds[i] = asset.priceFeed;
            _poolFees[i] = asset.poolFee;
            _targetWeightsBps[i] = asset.targetWeightBps;
            _tokenDecimals[i] = tokenDec;
            _feedDecimals[i] = feedDec;

            totalWeight += asset.targetWeightBps;

            if (asset.token == _stablecoin) {
                stablecoinFound = true;
                stableIdx = i;
            }
        }

        if (totalWeight != BPS_DENOMINATOR) revert InvalidAllocation();
        if (!stablecoinFound) revert StablecoinNotInAssets();

        // Set immutables
        assetCount = uint8(assets.length);
        stablecoinIndex = stableIdx;
        driftThresholdBps = _driftThresholdBps;
        swapRouter = ISwapRouter(_swapRouter);
        conversionExecutor = _conversionExecutor;

        // Set initial mutable state
        owner = _owner;
        slippageBps = DEFAULT_SLIPPAGE_BPS;

        emit OwnershipTransferred(address(0), _owner);
    }

    // ============ View Functions: Asset Configuration ============

    function assets(uint8 index) external view returns (address) {
        if (index >= assetCount) revert InvalidAssetIndex();
        return _assets[index];
    }

    function allAssets() external view returns (address[] memory) {
        address[] memory result = new address[](assetCount);
        for (uint8 i = 0; i < assetCount; i++) {
            result[i] = _assets[i];
        }
        return result;
    }

    function targetWeightBps(uint8 index) external view returns (uint16) {
        if (index >= assetCount) revert InvalidAssetIndex();
        return _targetWeightsBps[index];
    }

    function allTargetWeights() external view returns (uint16[] memory) {
        uint16[] memory result = new uint16[](assetCount);
        for (uint8 i = 0; i < assetCount; i++) {
            result[i] = _targetWeightsBps[i];
        }
        return result;
    }

    function priceFeed(uint8 index) external view returns (address) {
        if (index >= assetCount) revert InvalidAssetIndex();
        return _priceFeeds[index];
    }

    function poolFee(uint8 index) external view returns (uint24) {
        if (index >= assetCount) revert InvalidAssetIndex();
        return _poolFees[index];
    }

    // ============ View Functions: Portfolio State ============

    function holdings() external view returns (uint256[] memory balances) {
        balances = new uint256[](assetCount);
        for (uint8 i = 0; i < assetCount; i++) {
            balances[i] = IERC20(_assets[i]).balanceOf(address(this));
        }
    }

    function getUsdValues() external view returns (uint256[] memory values) {
        values = new uint256[](assetCount);
        for (uint8 i = 0; i < assetCount; i++) {
            values[i] = _assetUsdValue(i);
        }
    }

    function totalUsdValue() external view returns (uint256) {
        return _totalUsdValue();
    }

    function currentWeightBps(uint8 index) external view returns (uint16) {
        if (index >= assetCount) revert InvalidAssetIndex();
        return _currentWeightBps(index);
    }

    function allCurrentWeights() external view returns (uint16[] memory weights) {
        weights = new uint16[](assetCount);
        uint256 total = _totalUsdValue();

        if (total == 0) {
            return weights;
        }

        uint256 sum = 0;
        for (uint8 i = 0; i < assetCount - 1; i++) {
            weights[i] = uint16((_assetUsdValue(i) * BPS_DENOMINATOR) / total);
            sum += weights[i];
        }
        weights[assetCount - 1] = uint16(BPS_DENOMINATOR - sum);
    }

    function assetDriftBps(uint8 index) external view returns (uint16) {
        if (index >= assetCount) revert InvalidAssetIndex();
        return _assetDriftBps(index);
    }

    function portfolioDriftBps() public view returns (uint16) {
        uint16 maxDrift = 0;
        for (uint8 i = 0; i < assetCount; i++) {
            uint16 drift = _assetDriftBps(i);
            if (drift > maxDrift) {
                maxDrift = drift;
            }
        }
        return maxDrift;
    }

    function needsRebalance() external view returns (bool) {
        return portfolioDriftBps() >= driftThresholdBps;
    }

    /// @notice Get count of non-stablecoin assets (for minAmountsOut array sizing)
    function nonStablecoinAssetCount() external view returns (uint8) {
        return assetCount - 1;
    }

    /**
     * @notice Get the asset order for minAmountsOut array in conversion functions
     * @return tokens Array of token addresses in the order expected by minAmountsOut
     * @return indices Array of asset indices corresponding to each token
     * @dev minAmountsOut[i] corresponds to tokens[i] (asset at indices[i])
     *      Stablecoin is excluded from this array
     */
    function getConversionAssetOrder() external view returns (address[] memory tokens, uint8[] memory indices) {
        uint8 nonStableCount = assetCount - 1;
        tokens = new address[](nonStableCount);
        indices = new uint8[](nonStableCount);

        uint8 idx = 0;
        for (uint8 i = 0; i < assetCount; i++) {
            if (i == stablecoinIndex) continue;
            tokens[idx] = _assets[i];
            indices[idx] = i;
            idx++;
        }
    }

    // ============ Internal View Functions ============

    function _totalUsdValue() internal view returns (uint256 total) {
        for (uint8 i = 0; i < assetCount; i++) {
            total += _assetUsdValue(i);
        }
    }

    function _assetUsdValue(uint8 index) internal view returns (uint256) {
        uint256 balance = IERC20(_assets[index]).balanceOf(address(this));
        if (balance == 0) return 0;

        uint32 staleness = _getStalenessForAsset(index);
        uint256 price = _getPrice(_priceFeeds[index], staleness);

        uint256 value = Math.mulDiv(balance, price, 10 ** _tokenDecimals[index]);
        return Math.mulDiv(value, USD_PRECISION, 10 ** _feedDecimals[index]);
    }

    function _currentWeightBps(uint8 index) internal view returns (uint16) {
        uint256 total = _totalUsdValue();
        if (total == 0) return 0;

        uint256 assetValue = _assetUsdValue(index);
        return uint16((assetValue * BPS_DENOMINATOR) / total);
    }

    function _assetDriftBps(uint8 index) internal view returns (uint16) {
        uint16 current = _currentWeightBps(index);
        uint16 target = _targetWeightsBps[index];

        if (current >= target) {
            return current - target;
        } else {
            return target - current;
        }
    }

    function _getStalenessForAsset(uint8 index) internal view returns (uint32) {
        if (index == stablecoinIndex) {
            return MAX_PRICE_STALENESS_STABLE;
        }
        return MAX_PRICE_STALENESS;
    }

    function _getPrice(address feed, uint32 maxStaleness) internal view returns (uint256) {
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = AggregatorV3Interface(feed).latestRoundData();

        if (answer <= 0) revert InvalidPrice();
        if (updatedAt == 0) revert StalePrice();
        if (block.timestamp - updatedAt > maxStaleness) revert StalePrice();
        if (answeredInRound < roundId) revert IncompleteRound();

        return uint256(answer);
    }

    // ============ Owner Functions: Deposits ============

    function deposit(uint8 assetIndex, uint256 amount) external onlyOwner whenNotPaused {
        // Auto-cancel pending conversion on deposit (user is adding funds, not withdrawing)
        if (conversionRequested) {
            conversionRequested = false;
            emit ConversionCancelled(msg.sender);
        }
        _deposit(assetIndex, amount);
    }

    function depositAndRebalance(uint8 assetIndex, uint256 amount) external onlyOwner nonReentrant whenNotPaused {
        // Auto-cancel pending conversion on deposit (user is adding funds, not withdrawing)
        if (conversionRequested) {
            conversionRequested = false;
            emit ConversionCancelled(msg.sender);
        }

        _deposit(assetIndex, amount);

        uint256 totalUsd = _totalUsdValue();
        if (totalUsd == 0) return;

        int256[] memory deltas = new int256[](assetCount);
        for (uint8 i = 0; i < assetCount; i++) {
            uint256 currentUsd = _assetUsdValue(i);
            uint256 targetUsd = Math.mulDiv(totalUsd, _targetWeightsBps[i], BPS_DENOMINATOR);
            deltas[i] = int256(currentUsd) - int256(targetUsd);
        }

        uint8 swapsExecuted = _executeRebalanceSwaps(deltas);
        lastRebalanceAt = uint64(block.timestamp);

        emit Rebalanced(msg.sender, portfolioDriftBps(), swapsExecuted, uint64(block.timestamp));
    }

    function _deposit(uint8 assetIndex, uint256 amount) internal {
        if (assetIndex >= assetCount) revert InvalidAssetIndex();
        if (amount == 0) revert ZeroAmount();

        IERC20(_assets[assetIndex]).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, _assets[assetIndex], amount);
    }

    // ============ Owner Functions: Withdrawals ============

    function withdraw(uint8 assetIndex, uint256 amount) external onlyOwner {
        if (assetIndex >= assetCount) revert InvalidAssetIndex();
        if (amount == 0) revert ZeroAmount();

        uint256 balance = IERC20(_assets[assetIndex]).balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance();

        IERC20(_assets[assetIndex]).safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, _assets[assetIndex], amount);
    }

    /// @notice Withdraw all assets
    /// @dev No whenNotPaused - withdrawals always work (INV-14)
    /// @dev Auto-cancels pending conversion if any
    function withdrawAll() external onlyOwner returns (uint256[] memory amounts) {
        // Auto-cancel pending conversion (no external calls, just state change)
        if (conversionRequested) {
            conversionRequested = false;
            emit ConversionCancelled(msg.sender);
        }

        amounts = new uint256[](assetCount);

        for (uint8 i = 0; i < assetCount; i++) {
            amounts[i] = IERC20(_assets[i]).balanceOf(address(this));
            if (amounts[i] > 0) {
                IERC20(_assets[i]).safeTransfer(msg.sender, amounts[i]);
                emit Withdraw(msg.sender, _assets[i], amounts[i]);
            }
        }
    }

    // ============ V3: Instant Atomic Conversion (Path B) ============

    /**
     * @notice Convert all assets to USDC and withdraw in a single atomic transaction
     * @param minAmountsOut Minimum USDC expected from each non-stablecoin asset swap
     *        Array length must equal (assetCount - 1), ordered by asset index excluding stablecoin
     * @dev INV-C1: Full success or full revert - no partial conversion state
     * @dev Cannot be called while conversion is pending
     */
    function convertAndWithdraw(uint256[] calldata minAmountsOut) external onlyOwner nonReentrant {
        // Block if conversion pending - user must cancel first
        if (conversionRequested) revert ConversionPendingMustCancel();

        // Validate minAmountsOut length
        if (minAmountsOut.length != assetCount - 1) revert InvalidMinAmountsLength();

        // Execute swaps and withdraw
        (uint256 totalUSDC, uint256 cbBTCConverted, uint256 wethConverted) = _convertAllToUsdc(minAmountsOut);

        // Transfer all USDC to owner
        uint256 usdcBalance = IERC20(_assets[stablecoinIndex]).balanceOf(address(this));
        if (usdcBalance > 0) {
            IERC20(_assets[stablecoinIndex]).safeTransfer(msg.sender, usdcBalance);
        }

        emit ConvertedAndWithdrawn(msg.sender, totalUSDC, cbBTCConverted, wethConverted);
    }

    // ============ V3: Background Conversion (Path C) ============

    /**
     * @notice Request background conversion (user opts into executor path)
     * @dev INV-C3: Only one pending conversion at a time
     */
    function requestConversion() external onlyOwner {
        if (conversionExecutor == address(0)) revert NoConversionExecutor();
        if (backgroundConversionDisabled) revert BackgroundConversionDisabled();
        if (conversionRequested) revert ConversionAlreadyPending();

        conversionRequested = true;
        emit ConversionRequested(msg.sender, block.timestamp);
    }

    /**
     * @notice Execute pending background conversion
     * @param minAmountsOut Minimum USDC expected from each non-stablecoin asset swap
     * @dev Only callable by authorized conversion executor
     * @dev On success: swaps complete, USDC remains in vault (user calls withdrawAll)
     * @dev On revert: state unchanged, executor retries later
     */
    function executeConversion(uint256[] calldata minAmountsOut) external onlyConversionExecutor nonReentrant {
        if (!conversionRequested) revert NoConversionPending();
        if (minAmountsOut.length != assetCount - 1) revert InvalidMinAmountsLength();

        // Execute swaps
        (uint256 totalUSDC, uint256 cbBTCConverted, uint256 wethConverted) = _convertAllToUsdc(minAmountsOut);

        // Clear conversion state
        conversionRequested = false;

        emit ConversionExecuted(msg.sender, totalUSDC, cbBTCConverted, wethConverted);
    }

    /**
     * @notice Cancel pending background conversion
     * @dev Assets remain in vault unchanged
     */
    function cancelConversion() external onlyOwner {
        if (!conversionRequested) revert NoConversionPending();

        conversionRequested = false;
        emit ConversionCancelled(msg.sender);
    }

    // ============ V3: Background Conversion Control ============

    /**
     * @notice Disable background conversion
     * @dev If conversion pending, auto-cancels it
     */
    function disableBackgroundConversion() external onlyOwner {
        if (conversionRequested) {
            conversionRequested = false;
            emit ConversionCancelled(msg.sender);
        }

        backgroundConversionDisabled = true;
        emit BackgroundConversionDisabledEvent(msg.sender);
    }

    /**
     * @notice Enable background conversion
     */
    function enableBackgroundConversion() external onlyOwner {
        if (conversionExecutor == address(0)) revert NoConversionExecutor();

        backgroundConversionDisabled = false;
        emit BackgroundConversionEnabled(msg.sender);
    }

    // ============ Internal: Conversion Logic ============

    /**
     * @notice Convert all non-stablecoin assets to USDC
     * @param minAmountsOut Minimum USDC for each swap (must be > 0 for non-dust swaps)
     * @return totalUSDC Total USDC after conversion
     * @return cbBTCConverted Amount of cbBTC converted (for events)
     * @return wethConverted Amount of WETH converted (for events)
     * @dev Skips assets with USD value below MIN_SWAP_USD (dust threshold)
     */
    function _convertAllToUsdc(uint256[] calldata minAmountsOut) internal returns (
        uint256 totalUSDC,
        uint256 cbBTCConverted,
        uint256 wethConverted
    ) {
        address stablecoin = _assets[stablecoinIndex];
        uint256 minAmountsIdx = 0;

        // Swap each non-stablecoin asset to USDC
        for (uint8 i = 0; i < assetCount; i++) {
            if (i == stablecoinIndex) continue;

            uint256 balance = IERC20(_assets[i]).balanceOf(address(this));
            uint256 minOut = minAmountsOut[minAmountsIdx];
            minAmountsIdx++;

            // Skip if no balance
            if (balance == 0) {
                continue;
            }

            // Skip dust amounts (below MIN_SWAP_USD threshold)
            // This mirrors V2 rebalance behavior
            uint256 assetUsdValue = _assetUsdValue(i);
            if (assetUsdValue < MIN_SWAP_USD) {
                continue;
            }

            // Sanity check: minOut must be > 0 for non-dust swaps
            // This prevents executor from passing zeros to grief users
            if (minOut == 0) revert ZeroMinAmountOut();

            // Execute swap: asset -> USDC
            uint256 usdcReceived = _swapToUsdc(i, balance, minOut);

            // Track for event emission (simplified - assumes index 0 is cbBTC, index 1 is WETH)
            // In production, you'd want to track by address instead
            if (i == 0 && i != stablecoinIndex) {
                cbBTCConverted = balance;
            } else if (i == 1 && i != stablecoinIndex) {
                wethConverted = balance;
            } else if (i == 0 && stablecoinIndex == 1) {
                cbBTCConverted = balance;
            } else if (i == 1 && stablecoinIndex == 0) {
                wethConverted = balance;
            }

            totalUSDC += usdcReceived;
        }

        // Total USDC is final vault balance (includes original USDC + swapped amounts)
        totalUSDC = IERC20(stablecoin).balanceOf(address(this));
    }

    /**
     * @notice Swap a single asset to USDC using exactInputSingle
     * @param assetIndex Index of asset to swap
     * @param amountIn Amount of asset to swap
     * @param minAmountOut Minimum USDC to receive
     * @return amountOut Actual USDC received
     */
    function _swapToUsdc(uint8 assetIndex, uint256 amountIn, uint256 minAmountOut) internal returns (uint256 amountOut) {
        address token = _assets[assetIndex];
        address stablecoin = _assets[stablecoinIndex];
        uint24 fee = _poolFees[assetIndex];

        // Approve router
        IERC20(token).forceApprove(address(swapRouter), amountIn);

        // Execute swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: token,
            tokenOut: stablecoin,
            fee: fee,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        });

        amountOut = swapRouter.exactInputSingle(params);

        // Revoke approval
        IERC20(token).forceApprove(address(swapRouter), 0);

        // Verify slippage (belt and suspenders)
        if (amountOut < minAmountOut) revert SlippageExceeded();

        emit SwapExecuted(assetIndex, true, amountIn, amountOut);
    }

    // ============ Owner Functions: Configuration ============

    function setExecutor(address newExecutor) external onlyOwner {
        address previousExecutor = executor;
        executor = newExecutor;
        emit ExecutorSet(previousExecutor, newExecutor);
    }

    function setAutoRebalanceEnabled(bool enabled) external onlyOwner {
        autoRebalanceEnabled = enabled;
        emit AutoRebalanceToggled(enabled);
    }

    function setSlippageBps(uint16 newSlippage) external onlyOwner {
        if (newSlippage < MIN_SLIPPAGE_BPS || newSlippage > MAX_SLIPPAGE_BPS) {
            revert InvalidSlippageBps();
        }
        uint16 oldSlippage = slippageBps;
        slippageBps = newSlippage;
        emit SlippageUpdated(oldSlippage, newSlippage);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Owner Functions: Ownership ============

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address oldOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, owner);
    }

    // ============ Owner Functions: Rescue ============

    function rescueToken(address token) external onlyOwner {
        for (uint8 i = 0; i < assetCount; i++) {
            if (token == _assets[i]) revert CannotRescueVaultToken();
        }

        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) revert ZeroAmount();

        IERC20(token).safeTransfer(owner, balance);
        emit TokenRescued(token, balance);
    }

    // ============ Rebalance ============

    function rebalance() external onlyOwnerOrExecutor nonReentrant whenNotPaused {
        // Auto-cancel pending conversion on rebalance (user is managing portfolio, not withdrawing)
        if (conversionRequested) {
            conversionRequested = false;
            emit ConversionCancelled(owner);
        }

        uint16 drift = portfolioDriftBps();
        if (drift < driftThresholdBps) revert DriftBelowThreshold();

        if (msg.sender != owner) {
            if (lastRebalanceAt != 0 && block.timestamp - lastRebalanceAt < COOLDOWN_SECONDS) {
                revert CooldownNotElapsed();
            }
        }

        uint256 totalUsd = _totalUsdValue();
        if (totalUsd == 0) revert EmptyVault();

        int256[] memory deltas = new int256[](assetCount);
        for (uint8 i = 0; i < assetCount; i++) {
            uint256 currentUsd = _assetUsdValue(i);
            uint256 targetUsd = Math.mulDiv(totalUsd, _targetWeightsBps[i], BPS_DENOMINATOR);
            deltas[i] = int256(currentUsd) - int256(targetUsd);
        }

        uint8 swapsExecuted = _executeRebalanceSwaps(deltas);
        lastRebalanceAt = uint64(block.timestamp);

        emit Rebalanced(msg.sender, drift, swapsExecuted, uint64(block.timestamp));
    }

    function _executeRebalanceSwaps(int256[] memory deltas) internal returns (uint8 swapsExecuted) {
        // Phase 1: Sell overweight to USDC
        for (uint8 i = 0; i < assetCount; i++) {
            if (i == stablecoinIndex) continue;
            if (deltas[i] <= int256(MIN_SWAP_USD)) continue;

            if (swapsExecuted >= MAX_SWAPS_PER_REBALANCE) break;

            _executeSellToUsdc(i, uint256(deltas[i]));
            swapsExecuted++;
        }

        // Phase 2: Buy underweight from USDC
        for (uint8 i = 0; i < assetCount; i++) {
            if (i == stablecoinIndex) continue;
            if (deltas[i] >= -int256(MIN_SWAP_USD)) continue;

            if (swapsExecuted >= MAX_SWAPS_PER_REBALANCE) break;

            _executeBuyFromUsdc(i, uint256(-deltas[i]));
            swapsExecuted++;
        }

        return swapsExecuted;
    }

    function _executeSellToUsdc(uint8 assetIndex, uint256 usdValue) internal {
        address token = _assets[assetIndex];
        uint24 fee = _poolFees[assetIndex];

        uint256 assetPrice = _getPrice(_priceFeeds[assetIndex], _getStalenessForAsset(assetIndex));
        uint256 stablePrice = _getPrice(_priceFeeds[stablecoinIndex], MAX_PRICE_STALENESS_STABLE);

        uint256 usdcToReceive = Math.mulDiv(
            usdValue,
            10 ** _tokenDecimals[stablecoinIndex],
            Math.mulDiv(stablePrice, USD_PRECISION, 10 ** _feedDecimals[stablecoinIndex])
        );

        if (usdcToReceive == 0) return;

        uint256 oracleTokensToSell = Math.mulDiv(
            usdValue,
            10 ** _tokenDecimals[assetIndex],
            Math.mulDiv(assetPrice, USD_PRECISION, 10 ** _feedDecimals[assetIndex])
        );

        uint256 maxTokensIn = Math.mulDiv(oracleTokensToSell, BPS_DENOMINATOR + slippageBps, BPS_DENOMINATOR);

        uint256 available = IERC20(token).balanceOf(address(this));
        if (available < maxTokensIn) revert InsufficientBalanceForSwap();

        IERC20(token).forceApprove(address(swapRouter), maxTokensIn);

        ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter.ExactOutputSingleParams({
            tokenIn: token,
            tokenOut: _assets[stablecoinIndex],
            fee: fee,
            recipient: address(this),
            amountOut: usdcToReceive,
            amountInMaximum: maxTokensIn,
            sqrtPriceLimitX96: 0
        });

        uint256 actualIn = swapRouter.exactOutputSingle(params);

        IERC20(token).forceApprove(address(swapRouter), 0);

        if (actualIn > maxTokensIn) revert SlippageExceeded();

        emit SwapExecuted(assetIndex, true, actualIn, usdcToReceive);
    }

    function _executeBuyFromUsdc(uint8 assetIndex, uint256 usdValue) internal {
        address token = _assets[assetIndex];
        uint24 fee = _poolFees[assetIndex];
        address stablecoin = _assets[stablecoinIndex];

        uint256 assetPrice = _getPrice(_priceFeeds[assetIndex], _getStalenessForAsset(assetIndex));
        uint256 stablePrice = _getPrice(_priceFeeds[stablecoinIndex], MAX_PRICE_STALENESS_STABLE);

        uint256 tokensToBuy = Math.mulDiv(
            usdValue,
            10 ** _tokenDecimals[assetIndex],
            Math.mulDiv(assetPrice, USD_PRECISION, 10 ** _feedDecimals[assetIndex])
        );

        if (tokensToBuy == 0) return;

        uint256 oracleUsdcCost = Math.mulDiv(
            usdValue,
            10 ** _tokenDecimals[stablecoinIndex],
            Math.mulDiv(stablePrice, USD_PRECISION, 10 ** _feedDecimals[stablecoinIndex])
        );

        uint256 maxUsdcIn = Math.mulDiv(oracleUsdcCost, BPS_DENOMINATOR + slippageBps, BPS_DENOMINATOR);

        uint256 available = IERC20(stablecoin).balanceOf(address(this));
        if (available < maxUsdcIn) revert InsufficientBalanceForSwap();

        IERC20(stablecoin).forceApprove(address(swapRouter), maxUsdcIn);

        ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter.ExactOutputSingleParams({
            tokenIn: stablecoin,
            tokenOut: token,
            fee: fee,
            recipient: address(this),
            amountOut: tokensToBuy,
            amountInMaximum: maxUsdcIn,
            sqrtPriceLimitX96: 0
        });

        uint256 actualIn = swapRouter.exactOutputSingle(params);

        IERC20(stablecoin).forceApprove(address(swapRouter), 0);

        if (actualIn > maxUsdcIn) revert SlippageExceeded();

        emit SwapExecuted(assetIndex, false, tokensToBuy, actualIn);
    }

    function previewRebalance() external view returns (int256[] memory deltas, uint16 drift) {
        drift = portfolioDriftBps();

        uint256 totalUsd = _totalUsdValue();
        deltas = new int256[](assetCount);

        if (totalUsd == 0) {
            return (deltas, drift);
        }

        for (uint8 i = 0; i < assetCount; i++) {
            uint256 currentUsd = _assetUsdValue(i);
            uint256 targetUsd = Math.mulDiv(totalUsd, _targetWeightsBps[i], BPS_DENOMINATOR);
            deltas[i] = int256(currentUsd) - int256(targetUsd);
        }
    }
}
