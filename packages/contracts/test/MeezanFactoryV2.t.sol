// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MeezanFactoryV2} from "../src/MeezanFactoryV2.sol";
import {MeezanVaultV2} from "../src/MeezanVaultV2.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceFeed} from "./mocks/MockPriceFeed.sol";
import {MockSwapRouterV2} from "./mocks/MockSwapRouterV2.sol";

contract MeezanFactoryV2Test is Test {
    MeezanFactoryV2 public factory;
    MockSwapRouterV2 public router;

    // Tokens
    MockERC20 public btc;
    MockERC20 public eth;
    MockERC20 public sol;
    MockERC20 public usdc;

    // Price feeds
    MockPriceFeed public btcFeed;
    MockPriceFeed public ethFeed;
    MockPriceFeed public solFeed;
    MockPriceFeed public usdcFeed;

    // Test accounts
    address public owner;
    address public user1;
    address public user2;

    // Constants
    int256 constant BTC_PRICE = 100000e8;
    int256 constant ETH_PRICE = 3500e8;
    int256 constant SOL_PRICE = 200e8;
    int256 constant USDC_PRICE = 1e8;

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");

        // Deploy tokens
        btc = new MockERC20("Bitcoin", "BTC", 8);
        eth = new MockERC20("Ethereum", "ETH", 18);
        sol = new MockERC20("Solana", "SOL", 9);
        usdc = new MockERC20("USD Coin", "USDC", 6);

        // Deploy price feeds
        btcFeed = new MockPriceFeed(8, BTC_PRICE, "BTC/USD");
        ethFeed = new MockPriceFeed(8, ETH_PRICE, "ETH/USD");
        solFeed = new MockPriceFeed(8, SOL_PRICE, "SOL/USD");
        usdcFeed = new MockPriceFeed(8, USDC_PRICE, "USDC/USD");

        // Deploy router
        router = new MockSwapRouterV2(address(usdc));
        router.setPrice(address(btc), uint256(uint256(BTC_PRICE)));
        router.setPrice(address(eth), uint256(uint256(ETH_PRICE)));
        router.setPrice(address(sol), uint256(uint256(SOL_PRICE)));
        router.setPrice(address(usdc), uint256(uint256(USDC_PRICE)));

        // Deploy factory
        factory = new MeezanFactoryV2(address(router));
    }

    // ============ Helper Functions ============

    function _createDefaultAssets() internal view returns (MeezanVaultV2.AssetConfig[] memory) {
        MeezanVaultV2.AssetConfig[] memory assets = new MeezanVaultV2.AssetConfig[](4);

        assets[0] = MeezanVaultV2.AssetConfig({
            token: address(btc),
            priceFeed: address(btcFeed),
            poolFee: 500,
            targetWeightBps: 4000 // 40%
        });
        assets[1] = MeezanVaultV2.AssetConfig({
            token: address(eth),
            priceFeed: address(ethFeed),
            poolFee: 500,
            targetWeightBps: 3000 // 30%
        });
        assets[2] = MeezanVaultV2.AssetConfig({
            token: address(sol),
            priceFeed: address(solFeed),
            poolFee: 500,
            targetWeightBps: 1000 // 10%
        });
        assets[3] = MeezanVaultV2.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 2000 // 20%
        });

        return assets;
    }

    function _createTwoAssets() internal view returns (MeezanVaultV2.AssetConfig[] memory) {
        MeezanVaultV2.AssetConfig[] memory assets = new MeezanVaultV2.AssetConfig[](2);

        assets[0] = MeezanVaultV2.AssetConfig({
            token: address(btc),
            priceFeed: address(btcFeed),
            poolFee: 500,
            targetWeightBps: 6000 // 60%
        });
        assets[1] = MeezanVaultV2.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 4000 // 40%
        });

        return assets;
    }

    // ============ Deployment Tests ============

    function test_FactoryDeployment() public view {
        assertEq(factory.swapRouter(), address(router));
        assertEq(factory.vaultCount(), 0);
    }

    function test_FactoryRevertsOnZeroRouter() public {
        vm.expectRevert(MeezanFactoryV2.ZeroAddress.selector);
        new MeezanFactoryV2(address(0));
    }

    // ============ Vault Creation Tests ============

    function test_CreateVault() public {
        MeezanVaultV2.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        assertTrue(vault != address(0), "Vault should be created");
        assertEq(factory.vaultCount(), 1);
        assertEq(factory.getVaultAt(0), vault);

        // Verify vault configuration
        MeezanVaultV2 v = MeezanVaultV2(vault);
        assertEq(v.assetCount(), 4);
        assertEq(v.driftThresholdBps(), 500);
        assertEq(address(v.swapRouter()), address(router));

        // Owner is set immediately (no acceptance required)
        assertEq(v.owner(), user1);
        assertEq(v.pendingOwner(), address(0));
    }

    function test_CreateVault_EmitsEvent() public {
        MeezanVaultV2.AssetConfig[] memory assets = _createDefaultAssets();

        // Only check indexed parameters (owner)
        vm.prank(user1);
        vm.expectEmit(true, false, false, false);
        emit MeezanFactoryV2.VaultV2Deployed(
            user1,
            address(0), // Don't check
            0,          // Don't check
            0,          // Don't check
            bytes32(0)  // Don't check
        );
        factory.createVault(assets, address(usdc), 500);
    }

    function test_CreateVault_TwoAssets() public {
        MeezanVaultV2.AssetConfig[] memory assets = _createTwoAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        MeezanVaultV2 v = MeezanVaultV2(vault);
        assertEq(v.assetCount(), 2);
    }

    function test_CreateVault_DifferentUsers() public {
        MeezanVaultV2.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault1 = factory.createVault(assets, address(usdc), 500);

        vm.prank(user2);
        address vault2 = factory.createVault(assets, address(usdc), 500);

        assertTrue(vault1 != vault2, "Vaults should be different");
        assertEq(factory.vaultCount(), 2);
    }

    function test_CreateVault_SameUserDifferentConfig() public {
        MeezanVaultV2.AssetConfig[] memory assets4 = _createDefaultAssets();
        MeezanVaultV2.AssetConfig[] memory assets2 = _createTwoAssets();

        vm.startPrank(user1);
        address vault1 = factory.createVault(assets4, address(usdc), 500);
        address vault2 = factory.createVault(assets2, address(usdc), 500);
        vm.stopPrank();

        assertTrue(vault1 != vault2, "Vaults should be different");
        assertEq(factory.vaultCount(), 2);
    }

    function test_CreateVault_SameUserDifferentThreshold() public {
        MeezanVaultV2.AssetConfig[] memory assets = _createDefaultAssets();

        vm.startPrank(user1);
        address vault1 = factory.createVault(assets, address(usdc), 500);
        address vault2 = factory.createVault(assets, address(usdc), 800);
        vm.stopPrank();

        assertTrue(vault1 != vault2, "Vaults should be different");
        assertEq(factory.vaultCount(), 2);
    }

    // ============ Duplicate Vault Tests ============

    function test_CreateVault_RevertsDuplicate() public {
        MeezanVaultV2.AssetConfig[] memory assets = _createDefaultAssets();

        vm.startPrank(user1);
        factory.createVault(assets, address(usdc), 500);

        vm.expectRevert(MeezanFactoryV2.VaultAlreadyExists.selector);
        factory.createVault(assets, address(usdc), 500);
        vm.stopPrank();
    }

    // ============ Validation Passthrough Tests ============

    function test_CreateVault_RevertsInvalidWeightSum() public {
        MeezanVaultV2.AssetConfig[] memory assets = new MeezanVaultV2.AssetConfig[](2);
        assets[0] = MeezanVaultV2.AssetConfig({
            token: address(btc),
            priceFeed: address(btcFeed),
            poolFee: 500,
            targetWeightBps: 5000 // 50%
        });
        assets[1] = MeezanVaultV2.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 4000 // 40% - total is only 90%
        });

        vm.prank(user1);
        vm.expectRevert(MeezanVaultV2.InvalidAllocation.selector);
        factory.createVault(assets, address(usdc), 500);
    }

    function test_CreateVault_RevertsMissingStablecoin() public {
        MeezanVaultV2.AssetConfig[] memory assets = new MeezanVaultV2.AssetConfig[](2);
        assets[0] = MeezanVaultV2.AssetConfig({
            token: address(btc),
            priceFeed: address(btcFeed),
            poolFee: 500,
            targetWeightBps: 6000
        });
        assets[1] = MeezanVaultV2.AssetConfig({
            token: address(eth),
            priceFeed: address(ethFeed),
            poolFee: 500,
            targetWeightBps: 4000
        });

        vm.prank(user1);
        vm.expectRevert(MeezanVaultV2.StablecoinNotInAssets.selector);
        factory.createVault(assets, address(usdc), 500); // USDC not in assets
    }

    function test_CreateVault_RevertsTooFewAssets() public {
        MeezanVaultV2.AssetConfig[] memory assets = new MeezanVaultV2.AssetConfig[](1);
        assets[0] = MeezanVaultV2.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 10000
        });

        vm.prank(user1);
        vm.expectRevert(MeezanVaultV2.TooFewAssets.selector);
        factory.createVault(assets, address(usdc), 500);
    }

    function test_CreateVault_RevertsInvalidDriftThreshold() public {
        MeezanVaultV2.AssetConfig[] memory assets = _createTwoAssets();

        vm.prank(user1);
        vm.expectRevert(MeezanVaultV2.InvalidDriftThreshold.selector);
        factory.createVault(assets, address(usdc), 100); // 1% is below minimum 2%
    }

    // ============ Lookup Tests ============

    function test_GetVault() public {
        MeezanVaultV2.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        address found = factory.getVault(user1, assets, address(usdc), 500);
        assertEq(found, vault);
    }

    function test_GetVault_ReturnsZeroIfNotFound() public {
        MeezanVaultV2.AssetConfig[] memory assets = _createDefaultAssets();

        address found = factory.getVault(user1, assets, address(usdc), 500);
        assertEq(found, address(0));
    }

    function test_GetVaultByHash() public {
        MeezanVaultV2.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        // Get the config hash by computing it
        bytes32 configHash = keccak256(abi.encode(assets, address(usdc), uint16(500)));

        address found = factory.getVaultByHash(user1, configHash);
        assertEq(found, vault);
    }

    // ============ Ownership Tests ============

    function test_VaultOwnership_ImmediateOwnership() public {
        MeezanVaultV2.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        MeezanVaultV2 v = MeezanVaultV2(vault);

        // User is immediately the owner (no acceptance required)
        assertEq(v.owner(), user1);
        assertEq(v.pendingOwner(), address(0));
    }

    function test_VaultOwnership_TransferAfterCreation() public {
        MeezanVaultV2.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        MeezanVaultV2 v = MeezanVaultV2(vault);

        // Owner can transfer to another user (two-step for post-creation transfers)
        vm.prank(user1);
        v.transferOwnership(user2);
        assertEq(v.pendingOwner(), user2);

        // User2 accepts
        vm.prank(user2);
        v.acceptOwnership();
        assertEq(v.owner(), user2);
    }

    // ============ Integration Tests ============

    function test_FullVaultWorkflow() public {
        MeezanVaultV2.AssetConfig[] memory assets = _createDefaultAssets();

        // 1. Create vault (owner is set immediately)
        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);
        MeezanVaultV2 v = MeezanVaultV2(vault);

        // Owner is immediately set (no acceptance step needed)
        assertEq(v.owner(), user1);

        // 2. Mint tokens to user
        btc.mint(user1, 1e8);
        eth.mint(user1, 10e18);
        sol.mint(user1, 100e9);
        usdc.mint(user1, 100_000e6);

        // 4. Approve and deposit
        vm.startPrank(user1);
        btc.approve(vault, type(uint256).max);
        eth.approve(vault, type(uint256).max);
        sol.approve(vault, type(uint256).max);
        usdc.approve(vault, type(uint256).max);

        v.deposit(0, 0.4e8);  // BTC
        v.deposit(1, 4e18);   // ETH
        v.deposit(2, 50e9);   // SOL
        v.deposit(3, 20_000e6); // USDC
        vm.stopPrank();

        // 5. Check holdings
        uint256[] memory holdings = v.holdings();
        assertEq(holdings[0], 0.4e8);
        assertEq(holdings[1], 4e18);
        assertEq(holdings[2], 50e9);
        assertEq(holdings[3], 20_000e6);

        // 6. Check total value
        uint256 totalValue = v.totalUsdValue();
        assertTrue(totalValue > 0, "Total value should be positive");

        // 7. Withdraw all
        vm.prank(user1);
        v.withdrawAll();

        holdings = v.holdings();
        assertEq(holdings[0], 0);
        assertEq(holdings[1], 0);
        assertEq(holdings[2], 0);
        assertEq(holdings[3], 0);
    }
}
