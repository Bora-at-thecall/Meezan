// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MeezanVault} from "./MeezanVault.sol";
import {AllocationPreset, getTargetAllocations} from "./AllocationPresets.sol";

/**
 * @title MeezanFactory
 * @notice Factory contract for deploying personal MeezanVault instances
 * @dev Each user deploys their own vault; ownership is transferred to them immediately
 *      Supports both preset allocations (Simple mode) and custom allocations (Advanced mode)
 */
contract MeezanFactory {
    event VaultDeployed(
        address indexed owner,
        address indexed vault,
        AllocationPreset allocation
    );

    event AdvancedVaultDeployed(
        address indexed owner,
        address indexed vault,
        uint16 pctA,
        uint16 pctB,
        uint16 driftThresholdBps
    );

    // Immutable configuration set at factory deployment
    address public immutable tokenA;      // WBTC/cbBTC
    address public immutable tokenB;      // USDC
    address public immutable priceFeedA;  // BTC/USD
    address public immutable priceFeedB;  // USDC/USD
    address public immutable swapRouter;  // Uniswap v3
    uint24 public immutable poolFee;      // Pool fee tier

    // Track vaults per user (one vault per user per preset allocation)
    mapping(address => mapping(AllocationPreset => address)) public vaults;

    // Track advanced vaults per user (keyed by hash of allocation parameters)
    mapping(address => mapping(bytes32 => address)) public advancedVaults;

    // Default drift threshold for preset vaults (matches MeezanVault.DEFAULT_DRIFT_BPS)
    uint16 public constant DEFAULT_DRIFT_BPS = 500; // 5%

    error VaultAlreadyExists();
    error AdvancedVaultAlreadyExists();

    constructor(
        address _tokenA,
        address _tokenB,
        address _priceFeedA,
        address _priceFeedB,
        address _swapRouter,
        uint24 _poolFee
    ) {
        tokenA = _tokenA;
        tokenB = _tokenB;
        priceFeedA = _priceFeedA;
        priceFeedB = _priceFeedB;
        swapRouter = _swapRouter;
        poolFee = _poolFee;
    }

    /**
     * @notice Deploy a new vault for the caller using a preset allocation (Simple mode)
     * @param allocation The BTC/USDC allocation preset for the vault
     * @return vault The address of the newly deployed vault
     */
    function createVault(AllocationPreset allocation) external returns (address vault) {
        // Check if user already has a vault with this allocation
        if (vaults[msg.sender][allocation] != address(0)) {
            revert VaultAlreadyExists();
        }

        // Get target allocations from preset
        (uint16 pctA, uint16 pctB) = getTargetAllocations(allocation);

        // Deploy new vault with default drift threshold (factory is initial owner)
        MeezanVault newVault = new MeezanVault(
            tokenA,
            tokenB,
            priceFeedA,
            priceFeedB,
            swapRouter,
            poolFee,
            pctA,
            pctB,
            DEFAULT_DRIFT_BPS
        );

        // Transfer ownership to caller
        newVault.transferOwnership(msg.sender);

        vault = address(newVault);
        vaults[msg.sender][allocation] = vault;

        emit VaultDeployed(msg.sender, vault, allocation);
    }

    /**
     * @notice Deploy a new vault for the caller with custom allocation (Advanced mode)
     * @param pctA Target percentage for token A (BTC) in basis points (e.g., 6000 = 60%)
     * @param pctB Target percentage for token B (USDC) in basis points (e.g., 4000 = 40%)
     * @param driftThresholdBps Custom drift threshold in basis points (min 200 = 2%, max 2000 = 20%)
     * @return vault The address of the newly deployed vault
     */
    function createAdvancedVault(
        uint16 pctA,
        uint16 pctB,
        uint16 driftThresholdBps
    ) external returns (address vault) {
        // Create unique key for this allocation configuration
        bytes32 allocationKey = keccak256(abi.encodePacked(pctA, pctB, driftThresholdBps));

        // Check if user already has a vault with this exact configuration
        if (advancedVaults[msg.sender][allocationKey] != address(0)) {
            revert AdvancedVaultAlreadyExists();
        }

        // Deploy new vault with custom parameters (validation happens in vault constructor)
        MeezanVault newVault = new MeezanVault(
            tokenA,
            tokenB,
            priceFeedA,
            priceFeedB,
            swapRouter,
            poolFee,
            pctA,
            pctB,
            driftThresholdBps
        );

        // Transfer ownership to caller
        newVault.transferOwnership(msg.sender);

        vault = address(newVault);
        advancedVaults[msg.sender][allocationKey] = vault;

        emit AdvancedVaultDeployed(msg.sender, vault, pctA, pctB, driftThresholdBps);
    }

    /**
     * @notice Get vault address for a user and preset allocation
     * @param owner The vault owner
     * @param allocation The allocation preset
     * @return vault The vault address (or zero if none exists)
     */
    function getVault(address owner, AllocationPreset allocation) external view returns (address vault) {
        return vaults[owner][allocation];
    }

    /**
     * @notice Get advanced vault address for a user and custom allocation
     * @param owner The vault owner
     * @param pctA Target percentage for token A in basis points
     * @param pctB Target percentage for token B in basis points
     * @param driftThresholdBps Drift threshold in basis points
     * @return vault The vault address (or zero if none exists)
     */
    function getAdvancedVault(
        address owner,
        uint16 pctA,
        uint16 pctB,
        uint16 driftThresholdBps
    ) external view returns (address vault) {
        bytes32 allocationKey = keccak256(abi.encodePacked(pctA, pctB, driftThresholdBps));
        return advancedVaults[owner][allocationKey];
    }
}
