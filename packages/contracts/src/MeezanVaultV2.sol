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
 * @title MeezanVaultV2
 * @notice Multi-asset portfolio vault with automatic rebalancing
 * @dev Supports 2-10 assets with target weight allocation and drift-based rebalancing
 *
 * Key differences from v1:
 * - Variable asset count (2-10) vs fixed 2
 * - All swaps route through stablecoin intermediary
 * - Max-drift calculation across all assets
 * - Per-asset pool fees
 */
contract MeezanVaultV2 is ReentrancyGuard, Pausable {
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

    // ============ Errors ============

    error OnlyOwner();
    error OnlyOwnerOrExecutor();
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

    // ============ Events ============

    event Deposit(address indexed owner, address indexed token, uint256 amount);
    event Withdraw(address indexed owner, address indexed token, uint256 amount);
    event ExecutorSet(address indexed previousExecutor, address indexed newExecutor);
    event AutoRebalanceToggled(bool enabled);
    event SlippageUpdated(uint16 oldSlippage, uint16 newSlippage);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TokenRescued(address indexed token, uint256 amount);

    // v2 specific events
    event RebalanceIntent(
        address indexed caller,
        uint16 portfolioDriftBps,
        int256[] deltas,
        uint64 timestamp
    );

    // ============ Structs ============

    /// @notice Configuration for each asset in the portfolio
    struct AssetConfig {
        address token;           // ERC20 address
        address priceFeed;       // Chainlink aggregator
        uint24 poolFee;          // Uniswap V3 fee tier for stablecoin pair
        uint16 targetWeightBps;  // Target allocation (100 = 1%)
    }

    // ============ Immutable State ============
    // Note: Solidity doesn't support immutable arrays, so we use internal state
    // These are set once in constructor and have no setters

    uint8 public immutable assetCount;
    uint8 public immutable stablecoinIndex;
    uint16 public immutable driftThresholdBps;
    ISwapRouter public immutable swapRouter;

    // Fixed-size arrays (padded to MAX_ASSETS)
    // These are effectively immutable - set in constructor, no setters
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
    address public executor;
    uint16 public slippageBps;

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

    // ============ Constructor ============

    /**
     * @notice Deploy a new multi-asset vault
     * @param assets Array of asset configurations (2-10 assets)
     * @param _swapRouter Uniswap V3 SwapRouter address
     * @param _stablecoin Address of stablecoin (must be in assets array)
     * @param _driftThresholdBps Drift threshold in basis points (200-2000)
     */
    constructor(
        AssetConfig[] memory assets,
        address _swapRouter,
        address _stablecoin,
        uint16 _driftThresholdBps
    ) {
        // Validate asset count (INV-03)
        if (assets.length < MIN_ASSETS) revert TooFewAssets();
        if (assets.length > MAX_ASSETS) revert TooManyAssets();

        // Validate swap router
        if (_swapRouter == address(0)) revert ZeroAddress();

        // Validate drift threshold (INV-19)
        if (_driftThresholdBps < MIN_DRIFT_BPS || _driftThresholdBps > MAX_DRIFT_BPS) {
            revert InvalidDriftThreshold();
        }

        // Validate weight sum and find stablecoin (INV-01, INV-04)
        uint256 totalWeight = 0;
        bool stablecoinFound = false;
        uint8 stableIdx = 0;

        for (uint8 i = 0; i < assets.length; i++) {
            AssetConfig memory asset = assets[i];

            // Validate addresses
            if (asset.token == address(0)) revert ZeroAddress();
            if (asset.priceFeed == address(0)) revert ZeroAddress();

            // Check for duplicates
            for (uint8 j = 0; j < i; j++) {
                if (asset.token == assets[j].token) revert DuplicateAsset();
            }

            // Validate minimum weight (INV-02)
            if (asset.targetWeightBps < MIN_WEIGHT_BPS) revert WeightTooSmall();

            // Validate pool fee
            if (asset.poolFee != 100 && asset.poolFee != 500 && asset.poolFee != 3000 && asset.poolFee != 10000) {
                revert InvalidPoolFee();
            }

            // Get and validate decimals
            uint8 tokenDec = IERC20Metadata(asset.token).decimals();
            uint8 feedDec = AggregatorV3Interface(asset.priceFeed).decimals();
            if (tokenDec > 18) revert InvalidTokenDecimals();
            if (feedDec > 18) revert InvalidFeedDecimals();

            // Store asset configuration
            _assets[i] = asset.token;
            _priceFeeds[i] = asset.priceFeed;
            _poolFees[i] = asset.poolFee;
            _targetWeightsBps[i] = asset.targetWeightBps;
            _tokenDecimals[i] = tokenDec;
            _feedDecimals[i] = feedDec;

            totalWeight += asset.targetWeightBps;

            // Find stablecoin index
            if (asset.token == _stablecoin) {
                stablecoinFound = true;
                stableIdx = i;
            }
        }

        // Validate weight sum equals 100% (INV-01)
        if (totalWeight != BPS_DENOMINATOR) revert InvalidAllocation();

        // Validate stablecoin is in assets (INV-04)
        if (!stablecoinFound) revert StablecoinNotInAssets();

        // Set immutables
        assetCount = uint8(assets.length);
        stablecoinIndex = stableIdx;
        driftThresholdBps = _driftThresholdBps;
        swapRouter = ISwapRouter(_swapRouter);

        // Set initial mutable state
        owner = msg.sender;
        slippageBps = DEFAULT_SLIPPAGE_BPS;
    }

    // ============ View Functions: Asset Configuration ============

    /// @notice Get asset address by index
    function assets(uint8 index) external view returns (address) {
        if (index >= assetCount) revert InvalidAssetIndex();
        return _assets[index];
    }

    /// @notice Get all asset addresses
    function allAssets() external view returns (address[] memory) {
        address[] memory result = new address[](assetCount);
        for (uint8 i = 0; i < assetCount; i++) {
            result[i] = _assets[i];
        }
        return result;
    }

    /// @notice Get target weight for asset by index
    function targetWeightBps(uint8 index) external view returns (uint16) {
        if (index >= assetCount) revert InvalidAssetIndex();
        return _targetWeightsBps[index];
    }

    /// @notice Get all target weights
    function allTargetWeights() external view returns (uint16[] memory) {
        uint16[] memory result = new uint16[](assetCount);
        for (uint8 i = 0; i < assetCount; i++) {
            result[i] = _targetWeightsBps[i];
        }
        return result;
    }

    /// @notice Get price feed address for asset by index
    function priceFeed(uint8 index) external view returns (address) {
        if (index >= assetCount) revert InvalidAssetIndex();
        return _priceFeeds[index];
    }

    /// @notice Get pool fee for asset by index
    function poolFee(uint8 index) external view returns (uint24) {
        if (index >= assetCount) revert InvalidAssetIndex();
        return _poolFees[index];
    }

    // ============ View Functions: Portfolio State ============

    /// @notice Get current token balances (INV-16: holdings match balances)
    function holdings() external view returns (uint256[] memory balances) {
        balances = new uint256[](assetCount);
        for (uint8 i = 0; i < assetCount; i++) {
            balances[i] = IERC20(_assets[i]).balanceOf(address(this));
        }
    }

    /// @notice Get USD value of each asset
    function getUsdValues() external view returns (uint256[] memory values) {
        values = new uint256[](assetCount);
        for (uint8 i = 0; i < assetCount; i++) {
            values[i] = _assetUsdValue(i);
        }
    }

    /// @notice Get total USD value of portfolio
    function totalUsdValue() external view returns (uint256) {
        return _totalUsdValue();
    }

    /// @notice Get current weight of asset in basis points
    function currentWeightBps(uint8 index) external view returns (uint16) {
        if (index >= assetCount) revert InvalidAssetIndex();
        return _currentWeightBps(index);
    }

    /// @notice Get all current weights (INV-17: sum to 10000)
    function allCurrentWeights() external view returns (uint16[] memory weights) {
        weights = new uint16[](assetCount);
        uint256 total = _totalUsdValue();

        if (total == 0) {
            return weights; // All zeros
        }

        uint256 sum = 0;
        for (uint8 i = 0; i < assetCount - 1; i++) {
            weights[i] = uint16((_assetUsdValue(i) * BPS_DENOMINATOR) / total);
            sum += weights[i];
        }
        // Assign remainder to last asset to ensure sum = 10000
        weights[assetCount - 1] = uint16(BPS_DENOMINATOR - sum);
    }

    /// @notice Get drift of single asset in basis points
    function assetDriftBps(uint8 index) external view returns (uint16) {
        if (index >= assetCount) revert InvalidAssetIndex();
        return _assetDriftBps(index);
    }

    /// @notice Get portfolio drift (max of all asset drifts) (INV-18)
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

    /// @notice Check if rebalance is needed (drift >= threshold)
    function needsRebalance() external view returns (bool) {
        return portfolioDriftBps() >= driftThresholdBps;
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

        // value = balance * price / 10^tokenDecimals
        // Then scale to USD_PRECISION (1e18)
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

    /// @notice Deposit a specific asset
    function deposit(uint8 assetIndex, uint256 amount) external onlyOwner whenNotPaused {
        if (assetIndex >= assetCount) revert InvalidAssetIndex();
        if (amount == 0) revert ZeroAmount();

        IERC20(_assets[assetIndex]).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, _assets[assetIndex], amount);
    }

    // ============ Owner Functions: Withdrawals (INV-05, INV-14, INV-15) ============

    /// @notice Withdraw specific amount of an asset
    /// @dev No whenNotPaused - withdrawals always work (INV-14)
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
    function withdrawAll() external onlyOwner returns (uint256[] memory amounts) {
        amounts = new uint256[](assetCount);

        for (uint8 i = 0; i < assetCount; i++) {
            amounts[i] = IERC20(_assets[i]).balanceOf(address(this));
            if (amounts[i] > 0) {
                IERC20(_assets[i]).safeTransfer(msg.sender, amounts[i]);
                emit Withdraw(msg.sender, _assets[i], amounts[i]);
            }
        }
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

    // ============ Owner Functions: Ownership (INV-07) ============

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

    /// @notice Rescue accidentally sent tokens (not vault assets)
    function rescueToken(address token) external onlyOwner {
        // Check token is not a vault asset
        for (uint8 i = 0; i < assetCount; i++) {
            if (token == _assets[i]) revert CannotRescueVaultToken();
        }

        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) revert ZeroAmount();

        IERC20(token).safeTransfer(owner, balance);
        emit TokenRescued(token, balance);
    }

    // ============ Rebalance (Stub - No Swaps in Phase 1) ============

    /**
     * @notice Calculate and emit rebalance intent (INV-11)
     * @dev Phase 1: Only computes required swaps and emits event. Does NOT execute swaps.
     *      Swap execution will be added in Phase 2.
     */
    function rebalance() external onlyOwnerOrExecutor nonReentrant whenNotPaused {
        // Verify drift threshold (INV-11)
        uint16 drift = portfolioDriftBps();
        if (drift < driftThresholdBps) revert DriftBelowThreshold();

        // Verify cooldown for executor (INV-06)
        if (msg.sender != owner) {
            if (lastRebalanceAt != 0 && block.timestamp - lastRebalanceAt < COOLDOWN_SECONDS) {
                revert CooldownNotElapsed();
            }
        }

        // Calculate total value
        uint256 totalUsd = _totalUsdValue();
        if (totalUsd == 0) revert EmptyVault();

        // Calculate deltas (positive = overweight, negative = underweight)
        int256[] memory deltas = new int256[](assetCount);
        for (uint8 i = 0; i < assetCount; i++) {
            uint256 currentUsd = _assetUsdValue(i);
            uint256 targetUsd = Math.mulDiv(totalUsd, _targetWeightsBps[i], BPS_DENOMINATOR);
            deltas[i] = int256(currentUsd) - int256(targetUsd);
        }

        // Update timestamp
        lastRebalanceAt = uint64(block.timestamp);

        // Emit intent (actual swaps to be implemented in Phase 2)
        emit RebalanceIntent(msg.sender, drift, deltas, uint64(block.timestamp));

        // NOTE: Phase 2 will add _executeRebalanceSwaps(deltas) here
    }

    /**
     * @notice Preview what swaps would be needed for rebalance
     * @return deltas Array of USD deltas (positive = overweight, negative = underweight)
     * @return drift Current portfolio drift in basis points
     */
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
