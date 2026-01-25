// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MeezanFactoryV3} from "../src/MeezanFactoryV3.sol";
import {MeezanVaultV3} from "../src/MeezanVaultV3.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceFeed} from "./mocks/MockPriceFeed.sol";
import {MockSwapRouterV2} from "./mocks/MockSwapRouterV2.sol";

/**
 * @title MeezanFactoryV3Test
 * @notice Test suite for MeezanFactoryV3
 * @dev Key differences from V2 factory tests:
 *      - Tests conversionExecutor assignment
 *      - Tests vault conversion functionality works end-to-end
 */
contract MeezanFactoryV3Test is Test {
    MeezanFactoryV3 public factory;
    MockSwapRouterV2 public router;

    // Tokens
    MockERC20 public cbBTC;
    MockERC20 public weth;
    MockERC20 public usdc;

    // Price feeds
    MockPriceFeed public btcFeed;
    MockPriceFeed public ethFeed;
    MockPriceFeed public usdcFeed;

    // Test accounts
    address public owner;
    address public user1;
    address public user2;
    address public conversionExecutor;

    // Constants
    int256 constant BTC_PRICE = 100000e8;
    int256 constant ETH_PRICE = 3000e8;
    int256 constant USDC_PRICE = 1e8;

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        conversionExecutor = makeAddr("conversionExecutor");

        // Deploy tokens
        cbBTC = new MockERC20("Coinbase BTC", "cbBTC", 8);
        weth = new MockERC20("Wrapped ETH", "WETH", 18);
        usdc = new MockERC20("USD Coin", "USDC", 6);

        // Deploy price feeds
        btcFeed = new MockPriceFeed(8, BTC_PRICE, "BTC/USD");
        ethFeed = new MockPriceFeed(8, ETH_PRICE, "ETH/USD");
        usdcFeed = new MockPriceFeed(8, USDC_PRICE, "USDC/USD");

        // Deploy router
        router = new MockSwapRouterV2(address(usdc));
        router.setPrice(address(cbBTC), uint256(BTC_PRICE));
        router.setPrice(address(weth), uint256(ETH_PRICE));
        router.setPrice(address(usdc), uint256(USDC_PRICE));

        // Mint tokens to router for liquidity
        cbBTC.mint(address(router), 1000e8);
        weth.mint(address(router), 10000e18);
        usdc.mint(address(router), 100000000e6);

        // Deploy factory with conversion executor
        factory = new MeezanFactoryV3(address(router), conversionExecutor);
    }

    // ============ Helper Functions ============

    function _createDefaultAssets() internal view returns (MeezanVaultV3.AssetConfig[] memory) {
        MeezanVaultV3.AssetConfig[] memory assets = new MeezanVaultV3.AssetConfig[](3);

        assets[0] = MeezanVaultV3.AssetConfig({
            token: address(cbBTC),
            priceFeed: address(btcFeed),
            poolFee: 3000,  // 0.3% for cbBTC/USDC
            targetWeightBps: 4000 // 40%
        });
        assets[1] = MeezanVaultV3.AssetConfig({
            token: address(weth),
            priceFeed: address(ethFeed),
            poolFee: 500,   // 0.05% for WETH/USDC
            targetWeightBps: 4000 // 40%
        });
        assets[2] = MeezanVaultV3.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 2000 // 20%
        });

        return assets;
    }

    function _createTwoAssets() internal view returns (MeezanVaultV3.AssetConfig[] memory) {
        MeezanVaultV3.AssetConfig[] memory assets = new MeezanVaultV3.AssetConfig[](2);

        assets[0] = MeezanVaultV3.AssetConfig({
            token: address(cbBTC),
            priceFeed: address(btcFeed),
            poolFee: 3000,
            targetWeightBps: 6000 // 60%
        });
        assets[1] = MeezanVaultV3.AssetConfig({
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
        assertEq(factory.conversionExecutor(), conversionExecutor);
        assertEq(factory.vaultCount(), 0);
    }

    function test_FactoryRevertsOnZeroRouter() public {
        vm.expectRevert(MeezanFactoryV3.ZeroAddress.selector);
        new MeezanFactoryV3(address(0), conversionExecutor);
    }

    function test_FactoryAllowsZeroExecutor() public {
        // Zero executor is allowed (disables background conversion)
        MeezanFactoryV3 factoryNoExecutor = new MeezanFactoryV3(address(router), address(0));
        assertEq(factoryNoExecutor.conversionExecutor(), address(0));
    }

    // ============ Vault Creation Tests ============

    function test_CreateVault() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        assertTrue(vault != address(0), "Vault should be created");
        assertEq(factory.vaultCount(), 1);
        assertEq(factory.getVaultAt(0), vault);

        // Verify vault configuration
        MeezanVaultV3 v = MeezanVaultV3(vault);
        assertEq(v.assetCount(), 3);
        assertEq(v.driftThresholdBps(), 500);
        assertEq(address(v.swapRouter()), address(router));

        // Owner is set immediately
        assertEq(v.owner(), user1);
        assertEq(v.pendingOwner(), address(0));

        // Conversion executor matches factory
        assertEq(v.conversionExecutor(), conversionExecutor);
    }

    function test_CreateVault_EmitsEvent() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        vm.expectEmit(true, false, false, false);
        emit MeezanFactoryV3.VaultV3Deployed(
            user1,
            address(0), // Don't check
            0,          // Don't check
            0,          // Don't check
            bytes32(0)  // Don't check
        );
        factory.createVault(assets, address(usdc), 500);
    }

    function test_CreateVault_TwoAssets() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createTwoAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        MeezanVaultV3 v = MeezanVaultV3(vault);
        assertEq(v.assetCount(), 2);
    }

    function test_CreateVault_DifferentUsers() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault1 = factory.createVault(assets, address(usdc), 500);

        vm.prank(user2);
        address vault2 = factory.createVault(assets, address(usdc), 500);

        assertTrue(vault1 != vault2, "Vaults should be different");
        assertEq(factory.vaultCount(), 2);

        // Both have same conversion executor
        assertEq(MeezanVaultV3(vault1).conversionExecutor(), conversionExecutor);
        assertEq(MeezanVaultV3(vault2).conversionExecutor(), conversionExecutor);
    }

    function test_CreateVault_SameUserDifferentConfig() public {
        MeezanVaultV3.AssetConfig[] memory assets3 = _createDefaultAssets();
        MeezanVaultV3.AssetConfig[] memory assets2 = _createTwoAssets();

        vm.startPrank(user1);
        address vault1 = factory.createVault(assets3, address(usdc), 500);
        address vault2 = factory.createVault(assets2, address(usdc), 500);
        vm.stopPrank();

        assertTrue(vault1 != vault2, "Vaults should be different");
        assertEq(factory.vaultCount(), 2);
    }

    function test_CreateVault_SameUserDifferentThreshold() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        vm.startPrank(user1);
        address vault1 = factory.createVault(assets, address(usdc), 500);
        address vault2 = factory.createVault(assets, address(usdc), 800);
        vm.stopPrank();

        assertTrue(vault1 != vault2, "Vaults should be different");
        assertEq(factory.vaultCount(), 2);
    }

    // ============ Duplicate Vault Tests ============

    function test_CreateVault_RevertsDuplicate() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        vm.startPrank(user1);
        factory.createVault(assets, address(usdc), 500);

        vm.expectRevert(MeezanFactoryV3.VaultAlreadyExists.selector);
        factory.createVault(assets, address(usdc), 500);
        vm.stopPrank();
    }

    // ============ Validation Passthrough Tests ============

    function test_CreateVault_RevertsInvalidWeightSum() public {
        MeezanVaultV3.AssetConfig[] memory assets = new MeezanVaultV3.AssetConfig[](2);
        assets[0] = MeezanVaultV3.AssetConfig({
            token: address(cbBTC),
            priceFeed: address(btcFeed),
            poolFee: 3000,
            targetWeightBps: 5000 // 50%
        });
        assets[1] = MeezanVaultV3.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 4000 // 40% - total is only 90%
        });

        vm.prank(user1);
        vm.expectRevert(MeezanVaultV3.InvalidAllocation.selector);
        factory.createVault(assets, address(usdc), 500);
    }

    function test_CreateVault_RevertsMissingStablecoin() public {
        MeezanVaultV3.AssetConfig[] memory assets = new MeezanVaultV3.AssetConfig[](2);
        assets[0] = MeezanVaultV3.AssetConfig({
            token: address(cbBTC),
            priceFeed: address(btcFeed),
            poolFee: 3000,
            targetWeightBps: 6000
        });
        assets[1] = MeezanVaultV3.AssetConfig({
            token: address(weth),
            priceFeed: address(ethFeed),
            poolFee: 500,
            targetWeightBps: 4000
        });

        vm.prank(user1);
        vm.expectRevert(MeezanVaultV3.StablecoinNotInAssets.selector);
        factory.createVault(assets, address(usdc), 500); // USDC not in assets
    }

    function test_CreateVault_RevertsTooFewAssets() public {
        MeezanVaultV3.AssetConfig[] memory assets = new MeezanVaultV3.AssetConfig[](1);
        assets[0] = MeezanVaultV3.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 10000
        });

        vm.prank(user1);
        vm.expectRevert(MeezanVaultV3.TooFewAssets.selector);
        factory.createVault(assets, address(usdc), 500);
    }

    function test_CreateVault_RevertsInvalidDriftThreshold() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createTwoAssets();

        vm.prank(user1);
        vm.expectRevert(MeezanVaultV3.InvalidDriftThreshold.selector);
        factory.createVault(assets, address(usdc), 100); // 1% is below minimum 2%
    }

    // ============ Lookup Tests ============

    function test_GetVault() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        address found = factory.getVault(user1, assets, address(usdc), 500);
        assertEq(found, vault);
    }

    function test_GetVault_ReturnsZeroIfNotFound() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        address found = factory.getVault(user1, assets, address(usdc), 500);
        assertEq(found, address(0));
    }

    function test_GetVaultByHash() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        // Get the config hash by computing it
        bytes32 configHash = keccak256(abi.encode(assets, address(usdc), uint16(500)));

        address found = factory.getVaultByHash(user1, configHash);
        assertEq(found, vault);
    }

    // ============ Conversion Executor Tests ============

    function test_VaultInheritsConversionExecutor() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        MeezanVaultV3 v = MeezanVaultV3(vault);
        assertEq(v.conversionExecutor(), conversionExecutor);
    }

    function test_VaultConversionExecutorIsImmutable() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        MeezanVaultV3 v = MeezanVaultV3(vault);

        // Verify it's immutable by checking after ownership transfer
        vm.prank(user1);
        v.transferOwnership(user2);

        vm.prank(user2);
        v.acceptOwnership();

        // Executor should still be the same
        assertEq(v.conversionExecutor(), conversionExecutor);
    }

    function test_FactoryWithZeroExecutor_VaultsHaveZeroExecutor() public {
        MeezanFactoryV3 factoryNoExecutor = new MeezanFactoryV3(address(router), address(0));

        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault = factoryNoExecutor.createVault(assets, address(usdc), 500);

        MeezanVaultV3 v = MeezanVaultV3(vault);
        assertEq(v.conversionExecutor(), address(0));

        // Background conversion should fail without executor
        cbBTC.mint(user1, 1e8);
        usdc.mint(user1, 10000e6);

        vm.startPrank(user1);
        cbBTC.approve(vault, type(uint256).max);
        usdc.approve(vault, type(uint256).max);
        v.deposit(0, 1e8);
        v.deposit(2, 10000e6);

        vm.expectRevert(MeezanVaultV3.NoConversionExecutor.selector);
        v.requestConversion();
        vm.stopPrank();
    }

    // ============ Integration Tests ============

    function test_FullVaultWorkflow_WithConversion() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        // 1. Create vault
        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);
        MeezanVaultV3 v = MeezanVaultV3(vault);

        assertEq(v.owner(), user1);

        // 2. Mint and deposit
        cbBTC.mint(user1, 4e8);
        weth.mint(user1, 100e18);
        usdc.mint(user1, 200000e6);

        vm.startPrank(user1);
        cbBTC.approve(vault, type(uint256).max);
        weth.approve(vault, type(uint256).max);
        usdc.approve(vault, type(uint256).max);

        v.deposit(0, 4e8);
        v.deposit(1, 100e18);
        v.deposit(2, 200000e6);
        vm.stopPrank();

        // 3. Check holdings
        uint256[] memory holdings = v.holdings();
        assertEq(holdings[0], 4e8);
        assertEq(holdings[1], 100e18);
        assertEq(holdings[2], 200000e6);

        // 4. Request background conversion
        vm.prank(user1);
        v.requestConversion();
        assertTrue(v.conversionRequested());

        // 5. Execute conversion (by authorized executor)
        uint256[] memory minAmounts = new uint256[](2);
        minAmounts[0] = 1;  // Min for BTC
        minAmounts[1] = 1;  // Min for ETH

        vm.prank(conversionExecutor);
        v.executeConversion(minAmounts);
        assertFalse(v.conversionRequested());

        // 6. Vault should now have mostly USDC
        holdings = v.holdings();
        assertEq(holdings[0], 0, "BTC should be converted");
        assertEq(holdings[1], 0, "ETH should be converted");
        assertGt(holdings[2], 200000e6, "USDC should have increased");

        // 7. Withdraw all USDC
        uint256 userUsdcBefore = usdc.balanceOf(user1);

        vm.prank(user1);
        v.withdrawAll();

        uint256 userUsdcAfter = usdc.balanceOf(user1);
        assertGt(userUsdcAfter, userUsdcBefore, "User should receive USDC");

        // 8. Vault should be empty
        holdings = v.holdings();
        assertEq(holdings[0], 0);
        assertEq(holdings[1], 0);
        assertEq(holdings[2], 0);
    }

    function test_FullVaultWorkflow_ConvertAndWithdraw() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        // 1. Create vault
        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);
        MeezanVaultV3 v = MeezanVaultV3(vault);

        // 2. Deposit
        cbBTC.mint(user1, 4e8);
        weth.mint(user1, 100e18);
        usdc.mint(user1, 200000e6);

        vm.startPrank(user1);
        cbBTC.approve(vault, type(uint256).max);
        weth.approve(vault, type(uint256).max);
        usdc.approve(vault, type(uint256).max);

        v.deposit(0, 4e8);
        v.deposit(1, 100e18);
        v.deposit(2, 200000e6);

        // 3. Use instant atomic conversion (convertAndWithdraw)
        uint256 userUsdcBefore = usdc.balanceOf(user1);

        uint256[] memory minAmounts = new uint256[](2);
        minAmounts[0] = 1;
        minAmounts[1] = 1;

        v.convertAndWithdraw(minAmounts);
        vm.stopPrank();

        // 4. User should have all USDC
        uint256 userUsdcAfter = usdc.balanceOf(user1);
        assertGt(userUsdcAfter, userUsdcBefore, "User should receive USDC");

        // 5. Vault should be empty (or have dust below MIN_SWAP_USD)
        uint256[] memory holdings = v.holdings();
        assertEq(holdings[0], 0);
        assertEq(holdings[1], 0);
        // USDC transferred to user in convertAndWithdraw
    }

    // ============ Ownership Tests ============

    function test_VaultOwnership_ImmediateOwnership() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        MeezanVaultV3 v = MeezanVaultV3(vault);

        // User is immediately the owner
        assertEq(v.owner(), user1);
        assertEq(v.pendingOwner(), address(0));
    }

    function test_VaultOwnership_TransferAfterCreation() public {
        MeezanVaultV3.AssetConfig[] memory assets = _createDefaultAssets();

        vm.prank(user1);
        address vault = factory.createVault(assets, address(usdc), 500);

        MeezanVaultV3 v = MeezanVaultV3(vault);

        // Owner can transfer (two-step)
        vm.prank(user1);
        v.transferOwnership(user2);
        assertEq(v.pendingOwner(), user2);

        // User2 accepts
        vm.prank(user2);
        v.acceptOwnership();
        assertEq(v.owner(), user2);

        // Conversion executor unchanged
        assertEq(v.conversionExecutor(), conversionExecutor);
    }
}
