// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice DEPRECATED - Use DeployFactory.s.sol instead
 * @dev This script deploys a single vault with old WBTC addresses.
 *      The production deployment uses DeployFactory.s.sol with cbBTC.
 */

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {MeezanVault} from "../src/MeezanVault.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DeployBaseFork is Script {
    // Base mainnet addresses (used on fork)
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant WBTC = 0x0555E30da8f98308EdB960aa94C0Db47230d2B9c;

    // Chainlink feeds on Base
    address constant BTC_USD_FEED = 0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F;
    address constant USDC_USD_FEED = 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B;

    // Uniswap V3 SwapRouter02 on Base
    address constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    uint24 constant POOL_FEE = 3000; // 0.3%

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // Deploy the vault
        MeezanVault vault = new MeezanVault(
            WBTC,
            USDC,
            BTC_USD_FEED,
            USDC_USD_FEED,
            SWAP_ROUTER,
            POOL_FEE,
            5000, // 50% BTC
            5000, // 50% USDC
            500   // 5% drift threshold
        );

        vm.stopBroadcast();

        console2.log("Deployer:", deployer);
        console2.log("Vault:", address(vault));
        console2.log("USDC:", USDC);
        console2.log("WBTC:", WBTC);
        console2.log("SwapRouter:", SWAP_ROUTER);
        console2.log("BTC/USD Feed:", BTC_USD_FEED);
        console2.log("USDC/USD Feed:", USDC_USD_FEED);
    }
}
