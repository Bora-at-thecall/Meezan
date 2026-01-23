// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISwapRouter} from "../../src/interfaces/ISwapRouter.sol";

/**
 * @title MockSwapRouterV2
 * @notice Conserving mock router for MeezanVaultV2 testing
 * @dev Supports multiple token pairs, uses oracle-based pricing
 *      Value is conserved: output value = input value (no fees simulated)
 */
contract MockSwapRouterV2 is ISwapRouter {
    using SafeERC20 for IERC20;

    /// @notice Token prices in USD (scaled by 1e8, like Chainlink)
    mapping(address => uint256) public tokenPrices;

    /// @notice USDC token address (base currency)
    address public usdc;

    /// @notice Track swap count for testing
    uint256 public swapCount;

    /// @notice Track swap details for assertions
    struct SwapRecord {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
    }
    SwapRecord[] public swapHistory;

    /// @notice Simulated slippage in basis points (0 = perfect execution)
    uint16 public slippageSimulation;

    error TooMuchRequested();
    error UnknownToken();
    error InsufficientLiquidity();

    constructor(address _usdc) {
        usdc = _usdc;
    }

    /**
     * @notice Set price for a token
     * @param token Token address
     * @param priceUsd Price in USD (scaled by 1e8, like Chainlink)
     */
    function setPrice(address token, uint256 priceUsd) external {
        tokenPrices[token] = priceUsd;
    }

    /**
     * @notice Set slippage simulation (for testing slippage protection)
     * @param bps Slippage in basis points (e.g., 100 = 1% worse execution)
     */
    function setSlippageSimulation(uint16 bps) external {
        slippageSimulation = bps;
    }

    /**
     * @notice Clear swap history for fresh test runs
     */
    function clearHistory() external {
        delete swapHistory;
        swapCount = 0;
    }

    /**
     * @notice Get swap history length
     */
    function getSwapHistoryLength() external view returns (uint256) {
        return swapHistory.length;
    }

    /**
     * @notice Get swap record by index
     */
    function getSwapRecord(uint256 index) external view returns (SwapRecord memory) {
        return swapHistory[index];
    }

    /**
     * @notice Simulate exactOutputSingle swap with value conservation
     * @dev Calculates input based on oracle prices, respects amountInMaximum
     */
    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountIn)
    {
        uint256 priceIn = tokenPrices[params.tokenIn];
        uint256 priceOut = tokenPrices[params.tokenOut];

        if (priceIn == 0) revert UnknownToken();
        if (priceOut == 0) revert UnknownToken();

        uint8 decimalsIn = IERC20Metadata(params.tokenIn).decimals();
        uint8 decimalsOut = IERC20Metadata(params.tokenOut).decimals();

        // Calculate USD value of output
        // valueUsd = amountOut * priceOut / 10^decimalsOut
        uint256 valueUsd = (params.amountOut * priceOut) / (10 ** decimalsOut);

        // Calculate input amount for same USD value
        // amountIn = valueUsd * 10^decimalsIn / priceIn
        amountIn = (valueUsd * (10 ** decimalsIn)) / priceIn;

        // Apply simulated slippage (makes execution worse for the vault)
        if (slippageSimulation > 0) {
            amountIn = (amountIn * (10000 + slippageSimulation)) / 10000;
        }

        // Check slippage limit
        if (amountIn > params.amountInMaximum) {
            revert TooMuchRequested();
        }

        // Check caller has enough tokens
        uint256 callerBalance = IERC20(params.tokenIn).balanceOf(msg.sender);
        if (callerBalance < amountIn) revert InsufficientLiquidity();

        // Check we have enough output tokens
        uint256 routerBalance = IERC20(params.tokenOut).balanceOf(address(this));
        if (routerBalance < params.amountOut) revert InsufficientLiquidity();

        // Execute transfer: tokenIn from caller to router
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Execute transfer: tokenOut from router to recipient
        IERC20(params.tokenOut).safeTransfer(params.recipient, params.amountOut);

        // Record swap
        swapHistory.push(SwapRecord({
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amountIn: amountIn,
            amountOut: params.amountOut
        }));
        swapCount++;

        return amountIn;
    }

    /**
     * @notice Simulate exactInputSingle swap with value conservation
     * @dev Calculates output based on oracle prices, respects amountOutMinimum
     */
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        uint256 priceIn = tokenPrices[params.tokenIn];
        uint256 priceOut = tokenPrices[params.tokenOut];

        if (priceIn == 0) revert UnknownToken();
        if (priceOut == 0) revert UnknownToken();

        uint8 decimalsIn = IERC20Metadata(params.tokenIn).decimals();
        uint8 decimalsOut = IERC20Metadata(params.tokenOut).decimals();

        // Calculate USD value of input
        // valueUsd = amountIn * priceIn / 10^decimalsIn
        uint256 valueUsd = (params.amountIn * priceIn) / (10 ** decimalsIn);

        // Calculate output amount for same USD value
        // amountOut = valueUsd * 10^decimalsOut / priceOut
        amountOut = (valueUsd * (10 ** decimalsOut)) / priceOut;

        // Apply simulated slippage (makes execution worse for the vault)
        if (slippageSimulation > 0) {
            amountOut = (amountOut * (10000 - slippageSimulation)) / 10000;
        }

        // Check slippage limit
        require(amountOut >= params.amountOutMinimum, "Too little received");

        // Check caller has enough tokens
        uint256 callerBalance = IERC20(params.tokenIn).balanceOf(msg.sender);
        require(callerBalance >= params.amountIn, "Insufficient balance");

        // Check we have enough output tokens
        uint256 routerBalance = IERC20(params.tokenOut).balanceOf(address(this));
        require(routerBalance >= amountOut, "Insufficient liquidity");

        // Execute transfer: tokenIn from caller to router
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);

        // Execute transfer: tokenOut from router to recipient
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);

        // Record swap
        swapHistory.push(SwapRecord({
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amountIn: params.amountIn,
            amountOut: amountOut
        }));
        swapCount++;

        return amountOut;
    }

    /**
     * @notice Mint tokens to router for liquidity simulation
     * @param token Token to receive
     * @param amount Amount to add
     */
    function addLiquidity(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }
}
