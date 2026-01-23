// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MeezanVaultV2} from "./MeezanVaultV2.sol";

/**
 * @title MeezanFactoryV2
 * @notice Factory contract for deploying multi-asset MeezanVaultV2 instances
 * @dev Each user deploys their own vault; ownership is transferred immediately
 *      No admin controls, no upgradeability
 */
contract MeezanFactoryV2 {
    // ============ Events ============

    event VaultV2Deployed(
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

    // ============ State ============

    /// @notice Track vaults per user (keyed by hash of full asset configuration)
    mapping(address => mapping(bytes32 => address)) public vaults;

    /// @notice All vaults deployed by this factory
    address[] public allVaults;

    // ============ Constructor ============

    /**
     * @notice Deploy the v2 factory
     * @param _swapRouter Uniswap V3 SwapRouter address
     */
    constructor(address _swapRouter) {
        if (_swapRouter == address(0)) revert ZeroAddress();
        swapRouter = _swapRouter;
    }

    // ============ Factory Functions ============

    /**
     * @notice Deploy a new multi-asset vault for the caller
     * @param assets Array of asset configurations (2-10 assets)
     * @param stablecoin Address of stablecoin (must be in assets array)
     * @param driftThresholdBps Drift threshold in basis points (200-2000)
     * @return vault The address of the newly deployed vault
     * @dev All validation is performed by MeezanVaultV2 constructor
     */
    function createVault(
        MeezanVaultV2.AssetConfig[] calldata assets,
        address stablecoin,
        uint16 driftThresholdBps
    ) external returns (address vault) {
        // Generate unique configuration hash
        bytes32 configHash = _computeConfigHash(assets, stablecoin, driftThresholdBps);

        // Check if user already has a vault with this exact configuration
        if (vaults[msg.sender][configHash] != address(0)) {
            revert VaultAlreadyExists();
        }

        // Deploy new vault with caller as owner (immediate ownership, no acceptance required)
        MeezanVaultV2 newVault = new MeezanVaultV2(
            assets,
            swapRouter,
            stablecoin,
            driftThresholdBps,
            msg.sender  // Owner is set directly in constructor
        );

        vault = address(newVault);
        vaults[msg.sender][configHash] = vault;
        allVaults.push(vault);

        emit VaultV2Deployed(
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
        MeezanVaultV2.AssetConfig[] calldata assets,
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
     */
    function _computeConfigHash(
        MeezanVaultV2.AssetConfig[] calldata assets,
        address stablecoin,
        uint16 driftThresholdBps
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(assets, stablecoin, driftThresholdBps));
    }
}
