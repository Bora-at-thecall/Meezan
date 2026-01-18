// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MeezanFactory} from "../src/MeezanFactory.sol";

/**
 * @title DeployFactory
 * @notice Deployment script for MeezanFactory on Base mainnet
 * @dev Usage:
 *   export PRIVATE_KEY=your_private_key
 *   export BASE_RPC=https://mainnet.base.org
 *   forge script script/DeployFactory.s.sol --rpc-url $BASE_RPC --broadcast --verify
 */
contract DeployFactory is Script {
    // Base mainnet addresses
    address constant CBBTC = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf; // Coinbase Wrapped BTC
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant BTC_USD_FEED = 0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D; // cbBTC/USD on Base
    address constant USDC_USD_FEED = 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B;
    address constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481; // Uniswap v3 Router

    uint24 constant POOL_FEE = 500; // 0.05% fee tier for cbBTC/USDC

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        MeezanFactory factory = new MeezanFactory(
            CBBTC,
            USDC,
            BTC_USD_FEED,
            USDC_USD_FEED,
            SWAP_ROUTER,
            POOL_FEE
        );

        vm.stopBroadcast();

        console2.log("=== Deployment Summary ===");
        console2.log("MeezanFactory deployed at:", address(factory));
        console2.log("");
        console2.log("Configuration:");
        console2.log("  Token A (cbBTC):", CBBTC);
        console2.log("  Token B (USDC):", USDC);
        console2.log("  BTC/USD Feed:", BTC_USD_FEED);
        console2.log("  USDC/USD Feed:", USDC_USD_FEED);
        console2.log("  Swap Router:", SWAP_ROUTER);
        console2.log("  Pool Fee:", POOL_FEE);
        console2.log("");
        console2.log("Next steps:");
        console2.log("1. Update apps/web/lib/contracts.ts with factory address");
        console2.log("2. Deploy the web app");
    }
}
