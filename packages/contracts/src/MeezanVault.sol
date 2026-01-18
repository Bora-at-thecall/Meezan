// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AllocationPreset, getTargetAllocations} from "./AllocationPresets.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";

contract MeezanVault is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint16 public constant DEFAULT_DRIFT_BPS = 500;
    uint32 public constant COOLDOWN_SECONDS = 43200;
    uint32 public constant MAX_PRICE_STALENESS = 3600;
    uint256 private constant USD_PRECISION = 1e18;
    uint256 public constant MIN_SWAP_USD = 10e18;
    uint256 private constant BPS_DENOMINATOR = 10000;
    uint16 public constant MIN_SLIPPAGE_BPS = 10;
    uint16 public constant MAX_SLIPPAGE_BPS = 500;
    uint16 public constant DEFAULT_SLIPPAGE_BPS = 100;

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
    error InsufficientBalanceForSwap();
    error InvalidPoolFee();
    error InvalidSlippageBps();
    error NotPendingOwner();
    error CannotRescueVaultToken();

    event Deposit(address indexed owner, address indexed token, uint256 amount);
    event Withdraw(address indexed owner, address indexed token, uint256 amount);
    event ExecutorSet(address indexed previousExecutor, address indexed newExecutor);
    event AutoRebalanceToggled(bool enabled);
    event SlippageUpdated(uint16 oldSlippage, uint16 newSlippage);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TokenRescued(address indexed token, uint256 amount);
    event DepositAndAllocated(uint256 amountUSDC, uint256 wbtcBought, uint256 usdcSpent);
    event Rebalanced(
        address indexed caller,
        address indexed sellToken,
        address indexed buyToken,
        uint256 amountOut,
        uint256 amountIn,
        uint16 driftBps,
        uint64 timestamp
    );

    address public owner;
    address public pendingOwner;

    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    AggregatorV3Interface public immutable priceFeedA;
    AggregatorV3Interface public immutable priceFeedB;
    uint8 public immutable tokenDecimalsA;
    uint8 public immutable tokenDecimalsB;
    uint8 public immutable feedDecimalsA;
    uint8 public immutable feedDecimalsB;
    AllocationPreset public immutable allocation;
    uint16 public immutable targetPctA;
    uint16 public immutable targetPctB;
    ISwapRouter public immutable swapRouter;
    uint24 public immutable poolFee;

    uint64 public lastRebalanceAt;
    bool public autoRebalanceEnabled;
    address public executor;
    uint16 public slippageBps;

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

    constructor(
        address _tokenA,
        address _tokenB,
        address _priceFeedA,
        address _priceFeedB,
        address _swapRouter,
        uint24 _poolFee,
        AllocationPreset _allocation
    ) {
        if (_tokenA == address(0) || _tokenB == address(0)) revert ZeroAddress();
        if (_priceFeedA == address(0) || _priceFeedB == address(0)) revert ZeroAddress();
        if (_swapRouter == address(0)) revert ZeroAddress();
        if (_tokenA == _tokenB) revert IdenticalTokens();
        if (_poolFee != 100 && _poolFee != 500 && _poolFee != 3000 && _poolFee != 10000) revert InvalidPoolFee();

        uint8 _tokenDecimalsA = IERC20Metadata(_tokenA).decimals();
        uint8 _tokenDecimalsB = IERC20Metadata(_tokenB).decimals();
        if (_tokenDecimalsA > 18 || _tokenDecimalsB > 18) revert InvalidTokenDecimals();

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
        allocation = _allocation;
        slippageBps = DEFAULT_SLIPPAGE_BPS;

        (uint16 pctA, uint16 pctB) = getTargetAllocations(_allocation);
        targetPctA = pctA;
        targetPctB = pctB;
    }

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

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

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
        if (newSlippage < MIN_SLIPPAGE_BPS || newSlippage > MAX_SLIPPAGE_BPS) revert InvalidSlippageBps();
        uint16 oldSlippage = slippageBps;
        slippageBps = newSlippage;
        emit SlippageUpdated(oldSlippage, newSlippage);
    }

    function rescueToken(address token) external onlyOwner {
        if (token == address(tokenA) || token == address(tokenB)) revert CannotRescueVaultToken();
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) revert ZeroAmount();
        IERC20(token).safeTransfer(owner, balance);
        emit TokenRescued(token, balance);
    }

    function depositTokenA(uint256 amount) external onlyOwner whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        tokenA.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, address(tokenA), amount);
    }

    function depositTokenB(uint256 amount) external onlyOwner whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        tokenB.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, address(tokenB), amount);
    }

    function depositUSDC(uint256 amountUSDC) external onlyOwner nonReentrant whenNotPaused {
        if (amountUSDC == 0) revert ZeroAmount();

        tokenB.safeTransferFrom(msg.sender, address(this), amountUSDC);

        uint256 currentValueA = _usdValue(tokenA.balanceOf(address(this)), tokenDecimalsA, priceFeedA, feedDecimalsA);
        uint256 depositValueB = _usdValue(amountUSDC, tokenDecimalsB, priceFeedB, feedDecimalsB);
        uint256 currentValueB =
            _usdValue(tokenB.balanceOf(address(this)) - amountUSDC, tokenDecimalsB, priceFeedB, feedDecimalsB);

        uint256 totalUsdAfter = currentValueA + currentValueB + depositValueB;
        uint256 desiredUsdA = Math.mulDiv(totalUsdAfter, targetPctA, BPS_DENOMINATOR);

        if (desiredUsdA <= currentValueA) {
            emit DepositAndAllocated(amountUSDC, 0, 0);
            return;
        }

        uint256 usdToBuy = desiredUsdA - currentValueA;

        if (usdToBuy < MIN_SWAP_USD) {
            emit DepositAndAllocated(amountUSDC, 0, 0);
            return;
        }

        uint256 priceA = _getPrice(priceFeedA);
        uint256 wbtcToBuy = Math.mulDiv(usdToBuy, 10 ** feedDecimalsA, priceA);
        wbtcToBuy = Math.mulDiv(wbtcToBuy, 10 ** tokenDecimalsA, USD_PRECISION);

        if (wbtcToBuy == 0) {
            emit DepositAndAllocated(amountUSDC, 0, 0);
            return;
        }

        uint256 priceB = _getPrice(priceFeedB);
        uint256 oracleUsdcCost = Math.mulDiv(usdToBuy, 10 ** feedDecimalsB, priceB);
        oracleUsdcCost = Math.mulDiv(oracleUsdcCost, 10 ** tokenDecimalsB, USD_PRECISION);

        uint256 maxUsdcIn = Math.mulDiv(oracleUsdcCost, BPS_DENOMINATOR + slippageBps, BPS_DENOMINATOR);

        uint256 availableUsdc = tokenB.balanceOf(address(this));
        if (availableUsdc < maxUsdcIn) revert InsufficientBalanceForSwap();

        tokenB.forceApprove(address(swapRouter), maxUsdcIn);

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

        tokenB.forceApprove(address(swapRouter), 0);

        if (usdcSpent > maxUsdcIn) revert SlippageExceeded();

        emit DepositAndAllocated(amountUSDC, wbtcToBuy, usdcSpent);
    }

    function withdrawTokenA(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (tokenA.balanceOf(address(this)) < amount) revert InsufficientBalance();
        tokenA.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, address(tokenA), amount);
    }

    function withdrawTokenB(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (tokenB.balanceOf(address(this)) < amount) revert InsufficientBalance();
        tokenB.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, address(tokenB), amount);
    }

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

    function rebalance() external onlyOwnerOrExecutor nonReentrant whenNotPaused {
        (uint256 valueA, uint256 valueB) = _getUsdValues();
        uint256 totalUsd = valueA + valueB;
        if (totalUsd == 0) revert EmptyVault();

        uint16 drift = driftBps();
        if (drift < DEFAULT_DRIFT_BPS) revert DriftTooLow();

        if (msg.sender != owner) {
            if (lastRebalanceAt != 0 && block.timestamp - lastRebalanceAt < COOLDOWN_SECONDS) {
                revert CooldownNotElapsed();
            }
        }

        uint256 desiredUsdA = Math.mulDiv(totalUsd, targetPctA, BPS_DENOMINATOR);

        address sellToken;
        address buyToken;
        uint256 amountOut;
        uint256 amountIn;

        if (valueA > desiredUsdA) {
            uint256 usdToShift = valueA - desiredUsdA;

            if (usdToShift < MIN_SWAP_USD) {
                lastRebalanceAt = uint64(block.timestamp);
                emit Rebalanced(msg.sender, address(tokenA), address(tokenB), 0, 0, drift, uint64(block.timestamp));
                return;
            }

            sellToken = address(tokenA);
            buyToken = address(tokenB);

            uint256 priceB = _getPrice(priceFeedB);
            uint256 usdcToBuy = Math.mulDiv(usdToShift, 10 ** feedDecimalsB, priceB);
            usdcToBuy = Math.mulDiv(usdcToBuy, 10 ** tokenDecimalsB, USD_PRECISION);

            if (usdcToBuy == 0) {
                lastRebalanceAt = uint64(block.timestamp);
                emit Rebalanced(msg.sender, sellToken, buyToken, 0, 0, drift, uint64(block.timestamp));
                return;
            }

            uint256 priceA = _getPrice(priceFeedA);
            uint256 oracleWbtcCost = Math.mulDiv(usdToShift, 10 ** feedDecimalsA, priceA);
            oracleWbtcCost = Math.mulDiv(oracleWbtcCost, 10 ** tokenDecimalsA, USD_PRECISION);
            uint256 maxWbtcIn = Math.mulDiv(oracleWbtcCost, BPS_DENOMINATOR + slippageBps, BPS_DENOMINATOR);

            uint256 availableWbtc = tokenA.balanceOf(address(this));
            if (availableWbtc < maxWbtcIn) revert InsufficientBalanceForSwap();

            tokenA.forceApprove(address(swapRouter), maxWbtcIn);

            ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter.ExactOutputSingleParams({
                tokenIn: address(tokenA),
                tokenOut: address(tokenB),
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp + 300,
                amountOut: usdcToBuy,
                amountInMaximum: maxWbtcIn,
                sqrtPriceLimitX96: 0
            });

            amountIn = swapRouter.exactOutputSingle(params);
            amountOut = usdcToBuy;

            tokenA.forceApprove(address(swapRouter), 0);

            if (amountIn > maxWbtcIn) revert SlippageExceeded();
        } else {
            uint256 usdToShift = desiredUsdA - valueA;

            if (usdToShift < MIN_SWAP_USD) {
                lastRebalanceAt = uint64(block.timestamp);
                emit Rebalanced(msg.sender, address(tokenB), address(tokenA), 0, 0, drift, uint64(block.timestamp));
                return;
            }

            sellToken = address(tokenB);
            buyToken = address(tokenA);

            uint256 priceA = _getPrice(priceFeedA);
            uint256 wbtcToBuy = Math.mulDiv(usdToShift, 10 ** feedDecimalsA, priceA);
            wbtcToBuy = Math.mulDiv(wbtcToBuy, 10 ** tokenDecimalsA, USD_PRECISION);

            if (wbtcToBuy == 0) {
                lastRebalanceAt = uint64(block.timestamp);
                emit Rebalanced(msg.sender, sellToken, buyToken, 0, 0, drift, uint64(block.timestamp));
                return;
            }

            uint256 priceB = _getPrice(priceFeedB);
            uint256 oracleUsdcCost = Math.mulDiv(usdToShift, 10 ** feedDecimalsB, priceB);
            oracleUsdcCost = Math.mulDiv(oracleUsdcCost, 10 ** tokenDecimalsB, USD_PRECISION);
            uint256 maxUsdcIn = Math.mulDiv(oracleUsdcCost, BPS_DENOMINATOR + slippageBps, BPS_DENOMINATOR);

            uint256 availableUsdc = tokenB.balanceOf(address(this));
            if (availableUsdc < maxUsdcIn) revert InsufficientBalanceForSwap();

            tokenB.forceApprove(address(swapRouter), maxUsdcIn);

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

            amountIn = swapRouter.exactOutputSingle(params);
            amountOut = wbtcToBuy;

            tokenB.forceApprove(address(swapRouter), 0);

            if (amountIn > maxUsdcIn) revert SlippageExceeded();
        }

        lastRebalanceAt = uint64(block.timestamp);

        emit Rebalanced(msg.sender, sellToken, buyToken, amountOut, amountIn, drift, uint64(block.timestamp));
    }

    function holdings() external view returns (uint256 balA, uint256 balB) {
        return (tokenA.balanceOf(address(this)), tokenB.balanceOf(address(this)));
    }

    function targetAllocations() external view returns (uint16 pctA, uint16 pctB) {
        return (targetPctA, targetPctB);
    }

    function currentAllocationsBps() public view returns (uint16 pctA, uint16 pctB) {
        (uint256 valueA, uint256 valueB) = _getUsdValues();
        uint256 totalValue = valueA + valueB;

        if (totalValue == 0) {
            return (0, 0);
        }

        pctA = uint16((valueA * 10000) / totalValue);
        pctB = uint16(10000 - pctA);
    }

    function driftBps() public view returns (uint16) {
        (uint16 currentPctA,) = currentAllocationsBps();

        if (currentPctA >= targetPctA) {
            return currentPctA - targetPctA;
        } else {
            return targetPctA - currentPctA;
        }
    }

    function getUsdValues() external view returns (uint256 valueA, uint256 valueB) {
        return _getUsdValues();
    }

    function _getUsdValues() internal view returns (uint256 valueA, uint256 valueB) {
        uint256 balA = tokenA.balanceOf(address(this));
        uint256 balB = tokenB.balanceOf(address(this));

        valueA = _usdValue(balA, tokenDecimalsA, priceFeedA, feedDecimalsA);
        valueB = _usdValue(balB, tokenDecimalsB, priceFeedB, feedDecimalsB);
    }

    function _usdValue(uint256 amount, uint8 tokenDecimals, AggregatorV3Interface feed, uint8 feedDecimals)
        internal
        view
        returns (uint256 value)
    {
        if (amount == 0) return 0;

        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = feed.latestRoundData();

        if (answer <= 0) revert InvalidPrice();
        if (updatedAt == 0) revert StalePrice();
        if (block.timestamp - updatedAt > MAX_PRICE_STALENESS) revert StalePrice();
        if (answeredInRound < roundId) revert IncompleteRound();

        value = Math.mulDiv(amount, uint256(answer), 10 ** tokenDecimals);
        value = Math.mulDiv(value, USD_PRECISION, 10 ** feedDecimals);
    }

    function _getPrice(AggregatorV3Interface feed) internal view returns (uint256) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = feed.latestRoundData();

        if (answer <= 0) revert InvalidPrice();
        if (updatedAt == 0) revert StalePrice();
        if (block.timestamp - updatedAt > MAX_PRICE_STALENESS) revert StalePrice();
        if (answeredInRound < roundId) revert IncompleteRound();

        return uint256(answer);
    }
}