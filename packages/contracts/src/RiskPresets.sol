// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RiskPresets
 * @notice Defines risk-based allocation presets for Meezan portfolios
 * @dev TokenA = WBTC (volatile), TokenB = USDC (stable)
 *      Higher risk levels allocate more to WBTC for growth potential.
 *      All allocations sum to 10000 basis points (100%).
 */

/// @notice Risk levels from most conservative to most aggressive
enum RiskLevel {
    VeryConservative, // Minimal volatility exposure
    Conservative, // Low volatility exposure
    Balanced, // Equal split
    Growth, // Higher volatility exposure
    Aggressive // Maximum volatility exposure
}

/**
 * @notice Returns target allocation percentages for a given risk level
 * @param level The risk level to get allocations for
 * @return pctA Target percentage for token A (WBTC) in basis points
 * @return pctB Target percentage for token B (USDC) in basis points
 */
function getTargetAllocations(RiskLevel level) pure returns (uint16 pctA, uint16 pctB) {
    if (level == RiskLevel.VeryConservative) {
        return (1000, 9000); // 10% WBTC, 90% USDC
    } else if (level == RiskLevel.Conservative) {
        return (2500, 7500); // 25% WBTC, 75% USDC
    } else if (level == RiskLevel.Balanced) {
        return (5000, 5000); // 50% WBTC, 50% USDC
    } else if (level == RiskLevel.Growth) {
        return (7500, 2500); // 75% WBTC, 25% USDC
    } else {
        // RiskLevel.Aggressive
        return (9000, 1000); // 90% WBTC, 10% USDC
    }
}
