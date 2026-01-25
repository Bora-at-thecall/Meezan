// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MeezanVaultV3} from "./MeezanVaultV3.sol";

/**
 * @title MeezanFactoryV3
 * @notice Factory contract for deploying MeezanVaultV3 instances with USDC conversion support
 * @dev Each user deploys their own vault; ownership is transferred immediately
 *      Conversion executor is protocol-controlled (set at factory deployment)
 *      No admin controls, no upgradeability
 *
 * Key differences from FactoryV2:
 * - Deploys MeezanVaultV3 (with conversion support)
 * - Includes immutable conversionExecutor (shared across all vaults)
 * - Frontend queries both V2 and V3 factories to find user vaults
 */
contract MeezanFactoryV3 {
    // ============ Events ============

    event VaultV3Deployed(
        address indexed owner,
        address indexed vault,
        uint8 assetCount,
        uint16 driftThresholdBps,
        bytes32 configHash
    );

    // ============ Errors ============

    error ZeroAddress();
    error VaultAlreadyExists();

    // ============ Immutable Configuration ============

    /// @notice Uniswap V3 SwapRouter address (same for all vaults)
    address public immutable swapRouter;

    /// @notice Conversion executor address (same for all vaults deployed by this factory)
    /// @dev Protocol-controlled, cannot be changed after deployment
    address public immutable conversionExecutor;

    // ============ State ============

    /// @notice Track vaults per user (keyed by hash of full asset configuration)
    mapping(address => mapping(bytes32 => address)) public vaults;

    /// @notice All vaults deployed by this factory
    address[] public allVaults;

    // ============ Constructor ============

    /**
     * @notice Deploy the V3 factory
     * @param _swapRouter Uniswap V3 SwapRouter address
     * @param _conversionExecutor Address authorized to execute background conversions
     * @dev _conversionExecutor can be address(0) to disable background conversion feature
     */
    constructor(address _swapRouter, address _conversionExecutor) {
        if (_swapRouter == address(0)) revert ZeroAddress();
        // Note: _conversionExecutor can be zero (disables background conversion)
        swapRouter = _swapRouter;
        conversionExecutor = _conversionExecutor;
    }

    // ============ Factory Functions ============

    /**
     * @notice Deploy a new V3 vault for the caller
     * @param assets Array of asset configurations (2-10 assets)
     * @param stablecoin Address of stablecoin (must be in assets array)
     * @param driftThresholdBps Drift threshold in basis points (200-2000)
     * @return vault The address of the newly deployed vault
     * @dev All validation is performed by MeezanVaultV3 constructor
     * @dev Conversion executor is set from factory's immutable value
     */
    function createVault(
        MeezanVaultV3.AssetConfig[] calldata assets,
        address stablecoin,
        uint16 driftThresholdBps
    ) external returns (address vault) {
        // Generate unique configuration hash
        bytes32 configHash = _computeConfigHash(assets, stablecoin, driftThresholdBps);

        // Check if user already has a vault with this exact configuration
        if (vaults[msg.sender][configHash] != address(0)) {
            revert VaultAlreadyExists();
        }

        // Deploy new vault with caller as owner
        MeezanVaultV3 newVault = new MeezanVaultV3(
            assets,
            swapRouter,
            stablecoin,
            driftThresholdBps,
            msg.sender,          // Owner is set directly
            conversionExecutor   // Protocol-controlled executor
        );

        vault = address(newVault);
        vaults[msg.sender][configHash] = vault;
        allVaults.push(vault);

        emit VaultV3Deployed(
            msg.sender,
            vault,
            uint8(assets.length),
            driftThresholdBps,
            configHash
        );
    }

    // ============ View Functions ============

    /**
     * @notice Get vault address for a user and configuration
     * @param owner The vault owner
     * @param assets Array of asset configurations
     * @param stablecoin Stablecoin address
     * @param driftThresholdBps Drift threshold
     * @return vault The vault address (or zero if none exists)
     */
    function getVault(
        address owner,
        MeezanVaultV3.AssetConfig[] calldata assets,
        address stablecoin,
        uint16 driftThresholdBps
    ) external view returns (address vault) {
        bytes32 configHash = _computeConfigHash(assets, stablecoin, driftThresholdBps);
        return vaults[owner][configHash];
    }

    /**
     * @notice Get vault by config hash (for lookup after deployment)
     * @param owner The vault owner
     * @param configHash The configuration hash from deployment event
     * @return vault The vault address (or zero if none exists)
     */
    function getVaultByHash(address owner, bytes32 configHash) external view returns (address vault) {
        return vaults[owner][configHash];
    }

    /**
     * @notice Get total number of vaults deployed
     * @return count Number of vaults
     */
    function vaultCount() external view returns (uint256 count) {
        return allVaults.length;
    }

    /**
     * @notice Get vault address by index
     * @param index Index in allVaults array
     * @return vault The vault address
     */
    function getVaultAt(uint256 index) external view returns (address vault) {
        return allVaults[index];
    }

    // ============ Internal Functions ============

    /**
     * @notice Compute unique hash for vault configuration
     * @dev Includes all asset parameters, stablecoin, and drift threshold
     *      Note: Does NOT include conversionExecutor (same for all vaults from this factory)
     */
    function _computeConfigHash(
        MeezanVaultV3.AssetConfig[] calldata assets,
        address stablecoin,
        uint16 driftThresholdBps
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(assets, stablecoin, driftThresholdBps));
    }
}
