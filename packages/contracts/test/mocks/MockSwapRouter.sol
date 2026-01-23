// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISwapRouter} from "../../src/interfaces/ISwapRouter.sol";

/**
 * @title MockSwapRouter
 * @notice Mock Uniswap V3 SwapRouter for deterministic testing
 * @dev Simulates exactOutputSingle with configurable exchange rates per direction
 */
contract MockSwapRouter is ISwapRouter {
    using SafeERC20 for IERC20;

    /// @notice Exchange rate for USDC->WBTC: USDC per WBTC (scaled by 1e18)
    /// Example: 40000e18 means 40,000 USDC per 1 WBTC
    uint256 public usdcPerWbtc;

    /// @notice Exchange rate for WBTC->USDC: WBTC per USDC (scaled by 1e18)
    /// Example: 25e12 means 0.000025 WBTC per 1 USDC (i.e., 1/40000)
    uint256 public wbtcPerUsdc;

    /// @notice Token addresses for direction detection
    address public wbtcToken;
    address public usdcToken;

    /// @notice Whether to simulate a revert for exceeding amountInMaximum
    bool public shouldRevertOnExcess;

    /// @notice Last swap parameters (for test assertions)
    address public lastTokenIn;
    address public lastTokenOut;
    uint256 public lastAmountOut;
    uint256 public lastAmountInMaximum;
    uint256 public lastAmountIn;

    constructor(uint256 _usdcPerWbtc, address _wbtcToken, address _usdcToken) {
        usdcPerWbtc = _usdcPerWbtc;
        // Calculate inverse: if 40000 USDC per WBTC, then 1/40000 WBTC per USDC
        // In 1e18 precision: 1e18 * 1e18 / 40000e18 = 25e12
        wbtcPerUsdc = 1e36 / _usdcPerWbtc;
        wbtcToken = _wbtcToken;
        usdcToken = _usdcToken;
        shouldRevertOnExcess = true;
    }

    /**
     * @notice Set the exchange rate (USDC per WBTC)
     * @param _usdcPerWbtc New rate (scaled by 1e18)
     */
    function setExchangeRate(uint256 _usdcPerWbtc) external {
        usdcPerWbtc = _usdcPerWbtc;
        wbtcPerUsdc = 1e36 / _usdcPerWbtc;
    }

    /**
     * @notice Set whether to revert when amountIn exceeds amountInMaximum
     */
    function setShouldRevertOnExcess(bool _shouldRevert) external {
        shouldRevertOnExcess = _shouldRevert;
    }

    /**
     * @notice Simulate exactOutputSingle swap
     * @dev Calculates amountIn based on exchange rate and token direction
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

        uint8 tokenInDecimals = IERC20Metadata(params.tokenIn).decimals();
        uint8 tokenOutDecimals = IERC20Metadata(params.tokenOut).decimals();

        // Determine direction and calculate amountIn
        if (params.tokenIn == usdcToken && params.tokenOut == wbtcToken) {
            // Buying WBTC with USDC
            // amountIn (USDC) = amountOut (WBTC) * usdcPerWbtc / 1e18
            amountIn = (params.amountOut * usdcPerWbtc) / 1e18;
            // Adjust for decimal difference (WBTC=8, USDC=6)
            if (tokenOutDecimals > tokenInDecimals) {
                amountIn = amountIn / (10 ** (tokenOutDecimals - tokenInDecimals));
            } else if (tokenInDecimals > tokenOutDecimals) {
                amountIn = amountIn * (10 ** (tokenInDecimals - tokenOutDecimals));
            }
        } else if (params.tokenIn == wbtcToken && params.tokenOut == usdcToken) {
            // Buying USDC with WBTC
            // amountIn (WBTC) = amountOut (USDC) * wbtcPerUsdc / 1e18
            amountIn = (params.amountOut * wbtcPerUsdc) / 1e18;
            // Adjust for decimal difference (USDC=6, WBTC=8)
            if (tokenOutDecimals > tokenInDecimals) {
                amountIn = amountIn / (10 ** (tokenOutDecimals - tokenInDecimals));
            } else if (tokenInDecimals > tokenOutDecimals) {
                amountIn = amountIn * (10 ** (tokenInDecimals - tokenOutDecimals));
            }
        } else {
            revert("Unknown token pair");
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
     * @notice Simulate exactInputSingle swap (sell exact amount of input token)
     * @dev Calculates amountOut based on exchange rate and token direction
     */
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        lastTokenIn = params.tokenIn;
        lastTokenOut = params.tokenOut;
        lastAmountIn = params.amountIn;

        uint8 tokenInDecimals = IERC20Metadata(params.tokenIn).decimals();
        uint8 tokenOutDecimals = IERC20Metadata(params.tokenOut).decimals();

        // Determine direction and calculate amountOut
        if (params.tokenIn == wbtcToken && params.tokenOut == usdcToken) {
            // Selling WBTC for USDC
            // amountOut (USDC) = amountIn (WBTC) * usdcPerWbtc / 1e18
            amountOut = (params.amountIn * usdcPerWbtc) / 1e18;
            // Adjust for decimal difference (WBTC=8, USDC=6)
            if (tokenInDecimals > tokenOutDecimals) {
                amountOut = amountOut / (10 ** (tokenInDecimals - tokenOutDecimals));
            } else if (tokenOutDecimals > tokenInDecimals) {
                amountOut = amountOut * (10 ** (tokenOutDecimals - tokenInDecimals));
            }
        } else if (params.tokenIn == usdcToken && params.tokenOut == wbtcToken) {
            // Selling USDC for WBTC
            // amountOut (WBTC) = amountIn (USDC) * wbtcPerUsdc / 1e18
            amountOut = (params.amountIn * wbtcPerUsdc) / 1e18;
            // Adjust for decimal difference (USDC=6, WBTC=8)
            if (tokenInDecimals > tokenOutDecimals) {
                amountOut = amountOut / (10 ** (tokenInDecimals - tokenOutDecimals));
            } else if (tokenOutDecimals > tokenInDecimals) {
                amountOut = amountOut * (10 ** (tokenOutDecimals - tokenInDecimals));
            }
        } else {
            revert("Unknown token pair");
        }

        lastAmountOut = amountOut;

        // Check slippage
        require(amountOut >= params.amountOutMinimum, "Too little received");

        // Transfer tokenIn from caller to this contract
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);

        // Transfer tokenOut to recipient
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);

        return amountOut;
    }
}
