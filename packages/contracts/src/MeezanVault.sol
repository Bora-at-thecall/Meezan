// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {RiskLevel, getTargetAllocations} from "./RiskPresets.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";

/**
 * @title MeezanVault
 * @notice A non-custodial, single-owner vault for holding a two-token portfolio.
 * @dev Designed for long-term holding with rule-based rebalancing. One vault per user.
 *
 * Architecture notes:
 * - Owner is immutable and set at deployment (msg.sender)
 * - Token addresses are immutable (WBTC as tokenA, stablecoin as tokenB)
 * - Risk level and target allocations are set at construction and immutable
 * - Uses Chainlink price feeds for value-based allocation calculations
 * - Rebalancing is triggered by % drift only; time is a safety cooldown for executor
 * - Owner can bypass cooldown; executor must respect it
 * - Withdrawals are always instant and unrestricted for the owner
 */
contract MeezanVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Default drift threshold to trigger rebalance (5%)
    uint16 public constant DEFAULT_DRIFT_BPS = 500;

    /// @notice Minimum time between rebalances for executor (12 hours)
    uint32 public constant COOLDOWN_SECONDS = 43200;

    /// @notice Maximum allowed price staleness (1 hour)
    uint32 public constant MAX_PRICE_STALENESS = 3600;

    /// @notice Standard precision for USD values (18 decimals)
    uint256 private constant USD_PRECISION = 1e18;

    /// @notice Slippage cap for swaps (1.0% = 100 bps)
    uint256 public constant SLIPPAGE_BPS = 100;

    /// @notice Minimum USD value to trigger a swap ($10 in 18-decimal USD)
    uint256 public constant MIN_SWAP_USD = 10e18;

    /// @notice Basis points denominator
    uint256 private constant BPS_DENOMINATOR = 10000;

    // ─────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────

    error OnlyOwner();
    error OnlyOwnerOrExecutor();
    error ZeroAmount();
    error ZeroAddress();
    error IdenticalTokens();
    error InsufficientBalance();
    error DriftTooLow();
    error CooldownNotElapsed();
    error EmptyVault();
    error InvalidPrice();
    error StalePrice();
    error IncompleteRound();
    error InvalidTokenDecimals();
    error InvalidFeedDecimals();
    error SlippageExceeded();

    // ─────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────

    event Deposit(address indexed owner, address indexed token, uint256 amount);
    event Withdraw(address indexed owner, address indexed token, uint256 amount);
    event ExecutorSet(address indexed previousExecutor, address indexed newExecutor);
    event AutoRebalanceToggled(bool enabled);
    event RebalancePlanned(
        address indexed caller,
        address indexed sellToken,
        address indexed buyToken,
        uint16 driftBps,
        uint16 currentPctA,
        uint16 targetPctA,
        uint64 timestamp
    );
    event DepositAndAllocated(uint256 amountUSDC, uint256 wbtcBought, uint256 usdcSpent);

    // ─────────────────────────────────────────────────────────────────────
    // Immutable State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice The owner of this vault (set at deployment, cannot be changed)
    address public immutable owner;

    /// @notice Token A (e.g., WBTC)
    IERC20 public immutable tokenA;

    /// @notice Token B (e.g., USDC)
    IERC20 public immutable tokenB;

    /// @notice Price feed for token A (e.g., BTC/USD)
    AggregatorV3Interface public immutable priceFeedA;

    /// @notice Price feed for token B (e.g., USDC/USD)
    AggregatorV3Interface public immutable priceFeedB;

    /// @notice Decimals for token A
    uint8 public immutable tokenDecimalsA;

    /// @notice Decimals for token B
    uint8 public immutable tokenDecimalsB;

    /// @notice Decimals for price feed A
    uint8 public immutable feedDecimalsA;

    /// @notice Decimals for price feed B
    uint8 public immutable feedDecimalsB;

    /// @notice The selected risk level for this vault
    RiskLevel public immutable riskLevel;

    /// @notice Target allocation for token A in basis points (0-10000)
    uint16 public immutable targetPctA;

    /// @notice Target allocation for token B in basis points (0-10000)
    uint16 public immutable targetPctB;

    /// @notice Uniswap V3 SwapRouter address
    ISwapRouter public immutable swapRouter;

    /// @notice Uniswap V3 pool fee tier (e.g., 3000 = 0.3%)
    uint24 public immutable poolFee;

    // ─────────────────────────────────────────────────────────────────────
    // Mutable State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Timestamp of last rebalance
    uint64 public lastRebalanceAt;

    /// @notice Whether automatic rebalancing by executor is enabled
    bool public autoRebalanceEnabled;

    /// @notice Address authorized to call rebalance when auto-rebalance is enabled
    address public executor;

    // ─────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyOwnerOrExecutor() {
        bool isOwner = msg.sender == owner;
        bool isAuthorizedExecutor = autoRebalanceEnabled && executor != address(0) && msg.sender == executor;
        if (!isOwner && !isAuthorizedExecutor) revert OnlyOwnerOrExecutor();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Creates a new vault for the caller with a predefined risk level
     * @param _tokenA Address of token A (e.g., WBTC)
     * @param _tokenB Address of token B (e.g., USDC)
     * @param _priceFeedA Chainlink price feed for token A (e.g., BTC/USD)
     * @param _priceFeedB Chainlink price feed for token B (e.g., USDC/USD)
     * @param _swapRouter Uniswap V3 SwapRouter address
     * @param _poolFee Uniswap V3 pool fee tier (e.g., 3000 for 0.3%)
     * @param _riskLevel The risk level determining target allocations
     */
    constructor(
        address _tokenA,
        address _tokenB,
        address _priceFeedA,
        address _priceFeedB,
        address _swapRouter,
        uint24 _poolFee,
        RiskLevel _riskLevel
    ) {
        if (_tokenA == address(0) || _tokenB == address(0)) revert ZeroAddress();
        if (_priceFeedA == address(0) || _priceFeedB == address(0)) revert ZeroAddress();
        if (_swapRouter == address(0)) revert ZeroAddress();
        if (_tokenA == _tokenB) revert IdenticalTokens();

        // Cache and validate token decimals
        uint8 _tokenDecimalsA = IERC20Metadata(_tokenA).decimals();
        uint8 _tokenDecimalsB = IERC20Metadata(_tokenB).decimals();
        if (_tokenDecimalsA > 18 || _tokenDecimalsB > 18) revert InvalidTokenDecimals();

        // Cache and validate feed decimals
        uint8 _feedDecimalsA = AggregatorV3Interface(_priceFeedA).decimals();
        uint8 _feedDecimalsB = AggregatorV3Interface(_priceFeedB).decimals();
        if (_feedDecimalsA > 18 || _feedDecimalsB > 18) revert InvalidFeedDecimals();

        owner = msg.sender;
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        priceFeedA = AggregatorV3Interface(_priceFeedA);
        priceFeedB = AggregatorV3Interface(_priceFeedB);
        swapRouter = ISwapRouter(_swapRouter);
        poolFee = _poolFee;
        tokenDecimalsA = _tokenDecimalsA;
        tokenDecimalsB = _tokenDecimalsB;
        feedDecimalsA = _feedDecimalsA;
        feedDecimalsB = _feedDecimalsB;
        riskLevel = _riskLevel;

        (uint16 pctA, uint16 pctB) = getTargetAllocations(_riskLevel);
        targetPctA = pctA;
        targetPctB = pctB;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Owner Configuration
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Set the executor address for automated rebalancing
     * @param newExecutor The new executor address (can be address(0) to disable)
     */
    function setExecutor(address newExecutor) external onlyOwner {
        address previousExecutor = executor;
        executor = newExecutor;
        emit ExecutorSet(previousExecutor, newExecutor);
    }

    /**
     * @notice Enable or disable automatic rebalancing by executor
     * @param enabled Whether to enable auto-rebalance
     */
    function setAutoRebalanceEnabled(bool enabled) external onlyOwner {
        autoRebalanceEnabled = enabled;
        emit AutoRebalanceToggled(enabled);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Deposit Functions
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Deposit token A into the vault
     * @param amount Amount of token A to deposit
     */
    function depositTokenA(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        tokenA.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, address(tokenA), amount);
    }

    /**
     * @notice Deposit token B into the vault
     * @param amount Amount of token B to deposit
     */
    function depositTokenB(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        tokenB.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, address(tokenB), amount);
    }

    /**
     * @notice Deposit USDC and immediately swap to reach target allocation
     * @dev Single transaction: pulls USDC, computes WBTC needed, swaps via Uniswap V3
     * @param amountUSDC Amount of USDC to deposit
     */
    function depositUSDC(uint256 amountUSDC) external onlyOwner nonReentrant {
        if (amountUSDC == 0) revert ZeroAmount();

        // Pull USDC from owner
        tokenB.safeTransferFrom(msg.sender, address(this), amountUSDC);

        // Get current USD values
        uint256 currentValueA = _usdValue(tokenA.balanceOf(address(this)), tokenDecimalsA, priceFeedA, feedDecimalsA);
        uint256 depositValueB = _usdValue(amountUSDC, tokenDecimalsB, priceFeedB, feedDecimalsB);
        uint256 currentValueB =
            _usdValue(tokenB.balanceOf(address(this)) - amountUSDC, tokenDecimalsB, priceFeedB, feedDecimalsB);

        uint256 totalUsdAfter = currentValueA + currentValueB + depositValueB;

        // Compute desired USD value for token A
        uint256 desiredUsdA = Math.mulDiv(totalUsdAfter, targetPctA, BPS_DENOMINATOR);

        // If already at or above target, no swap needed
        if (desiredUsdA <= currentValueA) {
            emit DepositAndAllocated(amountUSDC, 0, 0);
            return;
        }

        uint256 usdToBuy = desiredUsdA - currentValueA;

        // Skip dust swaps below minimum threshold
        if (usdToBuy < MIN_SWAP_USD) {
            emit DepositAndAllocated(amountUSDC, 0, 0);
            return;
        }

        // Convert USD to WBTC units using oracle price
        // wbtcToBuy = usdToBuy * 10^tokenDecimalsA / priceA
        // We need to reverse the _usdValue calculation
        uint256 priceA = _getPrice(priceFeedA);
        uint256 wbtcToBuy = Math.mulDiv(usdToBuy, 10 ** feedDecimalsA, priceA);
        wbtcToBuy = Math.mulDiv(wbtcToBuy, 10 ** tokenDecimalsA, USD_PRECISION);

        if (wbtcToBuy == 0) {
            emit DepositAndAllocated(amountUSDC, 0, 0);
            return;
        }

        // Calculate max USDC input based on oracle price + slippage
        // oracleUsdcCost = usdToBuy converted to USDC units
        uint256 priceB = _getPrice(priceFeedB);
        uint256 oracleUsdcCost = Math.mulDiv(usdToBuy, 10 ** feedDecimalsB, priceB);
        oracleUsdcCost = Math.mulDiv(oracleUsdcCost, 10 ** tokenDecimalsB, USD_PRECISION);

        // Max USDC = oracleCost * (1 + slippage)
        uint256 maxUsdcIn = Math.mulDiv(oracleUsdcCost, BPS_DENOMINATOR + SLIPPAGE_BPS, BPS_DENOMINATOR);

        // Cap at available USDC balance
        uint256 availableUsdc = tokenB.balanceOf(address(this));
        if (maxUsdcIn > availableUsdc) {
            maxUsdcIn = availableUsdc;
        }

        // Approve router to spend USDC
        tokenB.forceApprove(address(swapRouter), maxUsdcIn);

        // Execute swap
        ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter.ExactOutputSingleParams({
            tokenIn: address(tokenB),
            tokenOut: address(tokenA),
            fee: poolFee,
            recipient: address(this),
            deadline: block.timestamp + 300,
            amountOut: wbtcToBuy,
            amountInMaximum: maxUsdcIn,
            sqrtPriceLimitX96: 0
        });

        uint256 usdcSpent = swapRouter.exactOutputSingle(params);

        // Revoke any remaining approval
        tokenB.forceApprove(address(swapRouter), 0);

        // Verify slippage wasn't exceeded (sanity check - router should revert but we double check)
        if (usdcSpent > maxUsdcIn) revert SlippageExceeded();

        emit DepositAndAllocated(amountUSDC, wbtcToBuy, usdcSpent);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Withdraw Functions
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Withdraw token A from the vault
     * @param amount Amount of token A to withdraw
     */
    function withdrawTokenA(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (tokenA.balanceOf(address(this)) < amount) revert InsufficientBalance();
        tokenA.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, address(tokenA), amount);
    }

    /**
     * @notice Withdraw token B from the vault
     * @param amount Amount of token B to withdraw
     */
    function withdrawTokenB(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (tokenB.balanceOf(address(this)) < amount) revert InsufficientBalance();
        tokenB.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, address(tokenB), amount);
    }

    /**
     * @notice Withdraw all tokens from the vault
     * @return amountA Amount of token A withdrawn
     * @return amountB Amount of token B withdrawn
     */
    function withdrawAll() external onlyOwner returns (uint256 amountA, uint256 amountB) {
        amountA = tokenA.balanceOf(address(this));
        amountB = tokenB.balanceOf(address(this));

        if (amountA > 0) {
            tokenA.safeTransfer(msg.sender, amountA);
            emit Withdraw(msg.sender, address(tokenA), amountA);
        }
        if (amountB > 0) {
            tokenB.safeTransfer(msg.sender, amountB);
            emit Withdraw(msg.sender, address(tokenB), amountB);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Rebalancing
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Plan a rebalance operation (no swap executed yet)
     * @dev Callable by owner always (bypasses cooldown), or by executor if auto-rebalance is enabled.
     *      Executor must respect cooldown; owner does not.
     *      Enforces drift threshold. Reverts on empty vault.
     *      Emits RebalancePlanned with direction info for off-chain execution.
     */
    function rebalance() external onlyOwnerOrExecutor {
        // Check for empty vault
        (uint256 valueA, uint256 valueB) = _getUsdValues();
        if (valueA + valueB == 0) revert EmptyVault();

        uint16 drift = driftBps();
        if (drift < DEFAULT_DRIFT_BPS) revert DriftTooLow();

        // Executor must respect cooldown; owner can bypass
        if (msg.sender != owner) {
            if (lastRebalanceAt != 0 && block.timestamp - lastRebalanceAt < COOLDOWN_SECONDS) {
                revert CooldownNotElapsed();
            }
        }

        (uint16 currentPctA,) = currentAllocationsBps();

        // Determine direction
        address sellToken;
        address buyToken;
        if (currentPctA > targetPctA) {
            // Over-allocated to A, sell A for B
            sellToken = address(tokenA);
            buyToken = address(tokenB);
        } else {
            // Under-allocated to A, sell B for A
            sellToken = address(tokenB);
            buyToken = address(tokenA);
        }

        lastRebalanceAt = uint64(block.timestamp);

        emit RebalancePlanned(msg.sender, sellToken, buyToken, drift, currentPctA, targetPctA, uint64(block.timestamp));
    }

    // ─────────────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns current holdings in the vault
     * @return balA Balance of token A
     * @return balB Balance of token B
     */
    function holdings() external view returns (uint256 balA, uint256 balB) {
        return (tokenA.balanceOf(address(this)), tokenB.balanceOf(address(this)));
    }

    /**
     * @notice Returns target allocation percentages
     * @return pctA Target percentage for token A (basis points)
     * @return pctB Target percentage for token B (basis points)
     */
    function targetAllocations() external view returns (uint16 pctA, uint16 pctB) {
        return (targetPctA, targetPctB);
    }

    /**
     * @notice Returns current allocation percentages based on USD values
     * @dev Uses Chainlink price feeds for value-based allocation
     * @return pctA Current percentage for token A (basis points)
     * @return pctB Current percentage for token B (basis points)
     */
    function currentAllocationsBps() public view returns (uint16 pctA, uint16 pctB) {
        (uint256 valueA, uint256 valueB) = _getUsdValues();
        uint256 totalValue = valueA + valueB;

        if (totalValue == 0) {
            return (0, 0);
        }

        pctA = uint16((valueA * 10000) / totalValue);
        pctB = uint16(10000 - pctA);
    }

    /**
     * @notice Returns the current drift from target allocation
     * @dev Drift = |currentPctA - targetPctA|
     * @return drift The absolute drift in basis points
     */
    function driftBps() public view returns (uint16) {
        (uint16 currentPctA,) = currentAllocationsBps();

        if (currentPctA >= targetPctA) {
            return currentPctA - targetPctA;
        } else {
            return targetPctA - currentPctA;
        }
    }

    /**
     * @notice Returns the USD values of holdings
     * @return valueA USD value of token A holdings (18 decimals)
     * @return valueB USD value of token B holdings (18 decimals)
     */
    function getUsdValues() external view returns (uint256 valueA, uint256 valueB) {
        return _getUsdValues();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal Functions
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Calculates USD values of both token holdings
     * @return valueA USD value of token A (18 decimals)
     * @return valueB USD value of token B (18 decimals)
     */
    function _getUsdValues() internal view returns (uint256 valueA, uint256 valueB) {
        uint256 balA = tokenA.balanceOf(address(this));
        uint256 balB = tokenB.balanceOf(address(this));

        valueA = _usdValue(balA, tokenDecimalsA, priceFeedA, feedDecimalsA);
        valueB = _usdValue(balB, tokenDecimalsB, priceFeedB, feedDecimalsB);
    }

    /**
     * @notice Calculates USD value of a token amount with stale price protection
     * @param amount Token amount in token's native decimals
     * @param tokenDecimals Number of decimals for the token
     * @param feed Chainlink price feed for the token
     * @param feedDecimals Number of decimals for the feed
     * @return value USD value normalized to 18 decimals
     */
    function _usdValue(uint256 amount, uint8 tokenDecimals, AggregatorV3Interface feed, uint8 feedDecimals)
        internal
        view
        returns (uint256 value)
    {
        if (amount == 0) return 0;

        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = feed.latestRoundData();

        // Validate price data
        if (answer <= 0) revert InvalidPrice();
        if (updatedAt == 0) revert StalePrice();
        if (block.timestamp - updatedAt > MAX_PRICE_STALENESS) revert StalePrice();
        if (answeredInRound < roundId) revert IncompleteRound();

        // Calculate USD value using chained mulDiv to avoid overflow
        // Step 1: Multiply amount by price, divide by token decimals
        // Step 2: Scale to USD precision by dividing by feed decimals
        // Result: (amount * price * USD_PRECISION) / (10^tokenDecimals * 10^feedDecimals)
        value = Math.mulDiv(amount, uint256(answer), 10 ** tokenDecimals);
        value = Math.mulDiv(value, USD_PRECISION, 10 ** feedDecimals);
    }

    /**
     * @notice Gets validated price from a Chainlink feed
     * @param feed The Chainlink price feed
     * @return price The price as uint256
     */
    function _getPrice(AggregatorV3Interface feed) internal view returns (uint256) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = feed.latestRoundData();

        if (answer <= 0) revert InvalidPrice();
        if (updatedAt == 0) revert StalePrice();
        if (block.timestamp - updatedAt > MAX_PRICE_STALENESS) revert StalePrice();
        if (answeredInRound < roundId) revert IncompleteRound();

        return uint256(answer);
    }
}
