// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AllocationPresets
 * @notice Defines BTC/USDC allocation presets for Meezan vaults
 * @dev TokenA = WBTC/cbBTC, TokenB = USDC
 *      All allocations sum to 10000 basis points (100%).
 */

/// @notice Allocation presets from lowest to highest BTC percentage
enum AllocationPreset {
    Split10_90,  // 10% BTC, 90% USDC
    Split25_75,  // 25% BTC, 75% USDC
    Split50_50,  // 50% BTC, 50% USDC
    Split75_25,  // 75% BTC, 25% USDC
    Split90_10   // 90% BTC, 10% USDC
}

/**
 * @notice Returns target allocation percentages for a given preset
 * @param preset The allocation preset to get percentages for
 * @return pctA Target percentage for token A (BTC) in basis points
 * @return pctB Target percentage for token B (USDC) in basis points
 */
function getTargetAllocations(AllocationPreset preset) pure returns (uint16 pctA, uint16 pctB) {
    if (preset == AllocationPreset.Split10_90) {
        return (1000, 9000); // 10% BTC, 90% USDC
    } else if (preset == AllocationPreset.Split25_75) {
        return (2500, 7500); // 25% BTC, 75% USDC
    } else if (preset == AllocationPreset.Split50_50) {
        return (5000, 5000); // 50% BTC, 50% USDC
    } else if (preset == AllocationPreset.Split75_25) {
        return (7500, 2500); // 75% BTC, 25% USDC
    } else {
        // AllocationPreset.Split90_10
        return (9000, 1000); // 90% BTC, 10% USDC
    }
}
