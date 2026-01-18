// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

import {MeezanVault} from "../src/MeezanVault.sol";
import {AllocationPreset} from "../src/AllocationPresets.sol";

import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockPriceFeed} from "../test/mocks/MockPriceFeed.sol";
import {MockSwapRouter} from "../test/mocks/MockSwapRouter.sol";

contract DeployBase is Script {
    function run() external {
        // Read deployer key from environment variable PRIVATE_KEY
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // 1) Deploy mock tokens
        // USDC: 6 decimals
        MockERC20 usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        // WBTC: 8 decimals
        MockERC20 wbtc = new MockERC20("Mock WBTC", "mWBTC", 8);

        // 2) Deploy mock price feeds (8 decimals like Chainlink)
        // BTC/USD: $100,000 -> 100000 * 1e8
        MockPriceFeed btcUsd = new MockPriceFeed(8, 100000e8, "BTC / USD");
        // USDC/USD: $1 -> 1 * 1e8
        MockPriceFeed usdcUsd = new MockPriceFeed(8, 1e8, "USDC / USD");

        // 3) Deploy mock swap router
        // Router expects: USDC per 1 WBTC, scaled by 1e18.
        // If BTC is $100,000 and USDC is $1, then 1 WBTC = 100,000 USDC.
        MockSwapRouter router = new MockSwapRouter(100000e18, address(wbtc), address(usdc));

        // 4) Deploy MeezanVault
        // Constructor signature:
        // (tokenA, tokenB, priceFeedA, priceFeedB, swapRouter, poolFee, allocation)
        MeezanVault vault = new MeezanVault(
            address(wbtc),
            address(usdc),
            address(btcUsd),
            address(usdcUsd),
            address(router),
            3000,
            AllocationPreset.Split50_50
        );

        // 5) Mint tokens to deployer (your dev wallet)
        address deployer = vm.addr(deployerKey);
        usdc.mint(deployer, 200000e6); // 200,000 USDC
        wbtc.mint(deployer, 2e8);      // 2 WBTC

        vm.stopBroadcast();

        // Print addresses
        console2.log("Deployed mUSDC:", address(usdc));
        console2.log("Deployed mWBTC:", address(wbtc));
        console2.log("Deployed BTC/USD feed:", address(btcUsd));
        console2.log("Deployed USDC/USD feed:", address(usdcUsd));
        console2.log("Deployed Mock Router:", address(router));
        console2.log("Deployed MeezanVault:", address(vault));
        console2.log("Deployer:", deployer);
    }
}
