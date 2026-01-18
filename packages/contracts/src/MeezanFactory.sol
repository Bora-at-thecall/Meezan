// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MeezanVault} from "./MeezanVault.sol";
import {AllocationPreset} from "./AllocationPresets.sol";

/**
 * @title MeezanFactory
 * @notice Factory contract for deploying personal MeezanVault instances
 * @dev Each user deploys their own vault; ownership is transferred to them immediately
 */
contract MeezanFactory {
    event VaultDeployed(
        address indexed owner,
        address indexed vault,
        AllocationPreset allocation
    );

    // Immutable configuration set at factory deployment
    address public immutable tokenA;      // WBTC/cbBTC
    address public immutable tokenB;      // USDC
    address public immutable priceFeedA;  // BTC/USD
    address public immutable priceFeedB;  // USDC/USD
    address public immutable swapRouter;  // Uniswap v3
    uint24 public immutable poolFee;      // Pool fee tier

    // Track vaults per user (one vault per user per allocation)
    mapping(address => mapping(AllocationPreset => address)) public vaults;

    error VaultAlreadyExists();

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
     * @notice Deploy a new vault for the caller
     * @param allocation The BTC/USDC allocation preset for the vault
     * @return vault The address of the newly deployed vault
     */
    function createVault(AllocationPreset allocation) external returns (address vault) {
        // Check if user already has a vault with this allocation
        if (vaults[msg.sender][allocation] != address(0)) {
            revert VaultAlreadyExists();
        }

        // Deploy new vault (factory is initial owner)
        MeezanVault newVault = new MeezanVault(
            tokenA,
            tokenB,
            priceFeedA,
            priceFeedB,
            swapRouter,
            poolFee,
            allocation
        );

        // Transfer ownership to caller
        newVault.transferOwnership(msg.sender);

        vault = address(newVault);
        vaults[msg.sender][allocation] = vault;

        emit VaultDeployed(msg.sender, vault, allocation);
    }

    /**
     * @notice Get vault address for a user and allocation preset
     * @param owner The vault owner
     * @param allocation The allocation preset
     * @return vault The vault address (or zero if none exists)
     */
    function getVault(address owner, AllocationPreset allocation) external view returns (address vault) {
        return vaults[owner][allocation];
    }
}
