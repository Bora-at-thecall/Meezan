// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISwapRouter} from "../../src/interfaces/ISwapRouter.sol";

/**
 * @title MockSwapRouter
 * @notice Mock Uniswap V3 SwapRouter for deterministic testing
 * @dev Simulates exactOutputSingle with a configurable exchange rate
 */
contract MockSwapRouter is ISwapRouter {
    using SafeERC20 for IERC20;

    /// @notice Exchange rate: how many tokenIn units per tokenOut unit (scaled by 1e18)
    uint256 public exchangeRate;

    /// @notice Token decimals for tokenIn (USDC = 6)
    uint8 public tokenInDecimals;

    /// @notice Token decimals for tokenOut (WBTC = 8)
    uint8 public tokenOutDecimals;

    /// @notice Whether to simulate a revert for exceeding amountInMaximum
    bool public shouldRevertOnExcess;

    /// @notice Last swap parameters (for test assertions)
    address public lastTokenIn;
    address public lastTokenOut;
    uint256 public lastAmountOut;
    uint256 public lastAmountInMaximum;
    uint256 public lastAmountIn;

    constructor(uint256 _exchangeRate, uint8 _tokenInDecimals, uint8 _tokenOutDecimals) {
        exchangeRate = _exchangeRate;
        tokenInDecimals = _tokenInDecimals;
        tokenOutDecimals = _tokenOutDecimals;
        shouldRevertOnExcess = true;
    }

    /**
     * @notice Set the exchange rate
     * @param _exchangeRate New exchange rate (tokenIn per tokenOut, scaled by 1e18)
     */
    function setExchangeRate(uint256 _exchangeRate) external {
        exchangeRate = _exchangeRate;
    }

    /**
     * @notice Set whether to revert when amountIn exceeds amountInMaximum
     */
    function setShouldRevertOnExcess(bool _shouldRevert) external {
        shouldRevertOnExcess = _shouldRevert;
    }

    /**
     * @notice Simulate exactOutputSingle swap
     * @dev Calculates amountIn based on exchangeRate, transfers tokens
     */
    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountIn)
    {
        lastTokenIn = params.tokenIn;
        lastTokenOut = params.tokenOut;
        lastAmountOut = params.amountOut;
        lastAmountInMaximum = params.amountInMaximum;

        // Calculate amountIn based on exchange rate
        // amountIn = amountOut * exchangeRate / 1e18
        // Adjust for decimal differences
        // tokenOut has tokenOutDecimals, tokenIn has tokenInDecimals
        // exchangeRate is in 1e18 precision
        amountIn = (params.amountOut * exchangeRate) / 1e18;

        // Adjust for decimal difference between tokens
        // If tokenOut=8 decimals, tokenIn=6 decimals, we need to divide by 100
        if (tokenOutDecimals > tokenInDecimals) {
            amountIn = amountIn / (10 ** (tokenOutDecimals - tokenInDecimals));
        } else if (tokenInDecimals > tokenOutDecimals) {
            amountIn = amountIn * (10 ** (tokenInDecimals - tokenOutDecimals));
        }

        lastAmountIn = amountIn;

        // Check slippage
        if (amountIn > params.amountInMaximum) {
            if (shouldRevertOnExcess) {
                revert("Too much requested");
            }
        }

        // Transfer tokenIn from caller to this contract (simulating swap)
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Transfer tokenOut to recipient
        IERC20(params.tokenOut).safeTransfer(params.recipient, params.amountOut);

        return amountIn;
    }

    /**
     * @notice Mint tokenOut to this contract for swap simulation
     * @dev Call this before testing swaps
     */
    function mintTokenOut(address token, uint256 amount) external {
        // This is a mock - we assume the token is a MockERC20 with public mint
        // In tests, we'll transfer tokens to this contract directly
    }
}
