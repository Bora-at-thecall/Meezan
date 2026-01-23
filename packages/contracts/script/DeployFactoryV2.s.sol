// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MeezanFactoryV2} from "../src/MeezanFactoryV2.sol";

/**
 * @title DeployFactoryV2
 * @notice Deployment script for MeezanFactoryV2 on Base mainnet
 * @dev Usage:
 *   export PRIVATE_KEY=your_private_key
 *   export BASE_RPC=https://mainnet.base.org
 *   forge script script/DeployFactoryV2.s.sol --rpc-url $BASE_RPC --broadcast --verify
 */
contract DeployFactoryV2 is Script {
    // Base mainnet addresses
    address constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481; // Uniswap V3 Router

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        MeezanFactoryV2 factory = new MeezanFactoryV2(SWAP_ROUTER);

        vm.stopBroadcast();

        console2.log("=== MeezanFactoryV2 Deployment ===");
        console2.log("");
        console2.log("Factory V2 deployed at:", address(factory));
        console2.log("Swap Router:", SWAP_ROUTER);
        console2.log("");
        console2.log("Supported assets (configured in frontend):");
        console2.log("  - cbBTC: 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf");
        console2.log("  - WETH:  0x4200000000000000000000000000000000000006");
        console2.log("  - USDC:  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
        console2.log("");
        console2.log("Next steps:");
        console2.log("1. Update apps/web/lib/contracts-v2.ts with factory address");
        console2.log("2. Test vault creation on mainnet");
    }
}
