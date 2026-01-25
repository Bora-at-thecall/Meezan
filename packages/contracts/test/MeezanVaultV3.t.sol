// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console2.sol";

import {MeezanVaultV3} from "../src/MeezanVaultV3.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceFeed} from "./mocks/MockPriceFeed.sol";
import {MockSwapRouterV2} from "./mocks/MockSwapRouterV2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MeezanVaultV3Test
 * @notice Comprehensive test suite for MeezanVaultV3
 * @dev Tests V3-specific functionality: conversions, withdrawAll invariant, state transitions
 *
 * Key test areas:
 * - INV-W1: withdrawAll() ALWAYS succeeds
 * - INV-C1: convertAndWithdraw() is atomic (full success or full revert)
 * - INV-C3: Only one pending conversion at a time
 * - State transitions: request/execute/cancel/auto-cancel
 * - minAmountsOut ordering via getConversionAssetOrder()
 */
contract MeezanVaultV3Test is Test {
    // Test accounts
    address public owner;
    address public conversionExecutor;
    address public rebalanceExecutor;
    address public user;

    // Mock tokens (3-asset: cbBTC, WETH, USDC)
    MockERC20 public cbBTC;
    MockERC20 public weth;
    MockERC20 public usdc;

    // Mock price feeds
    MockPriceFeed public btcFeed;
    MockPriceFeed public ethFeed;
    MockPriceFeed public usdcFeed;

    // Mock swap router
    MockSwapRouterV2 public router;

    // Vault under test
    MeezanVaultV3 public vault;

    // Default configuration (40% BTC, 40% ETH, 20% USDC)
    MeezanVaultV3.AssetConfig[] internal defaultConfig;

    // Prices (8 decimals like Chainlink)
    int256 constant BTC_PRICE = 100000e8;  // $100,000
    int256 constant ETH_PRICE = 3000e8;    // $3,000
    int256 constant USDC_PRICE = 1e8;      // $1

    function setUp() public {
        // Setup accounts
        owner = makeAddr("owner");
        conversionExecutor = makeAddr("conversionExecutor");
        rebalanceExecutor = makeAddr("rebalanceExecutor");
        user = makeAddr("user");

        // Deploy mock tokens
        cbBTC = new MockERC20("Coinbase BTC", "cbBTC", 8);
        weth = new MockERC20("Wrapped ETH", "WETH", 18);
        usdc = new MockERC20("USD Coin", "USDC", 6);

        // Deploy mock price feeds
        btcFeed = new MockPriceFeed(8, BTC_PRICE, "BTC / USD");
        ethFeed = new MockPriceFeed(8, ETH_PRICE, "ETH / USD");
        usdcFeed = new MockPriceFeed(8, USDC_PRICE, "USDC / USD");

        // Deploy mock router
        router = new MockSwapRouterV2(address(usdc));

        // Set prices on router
        router.setPrice(address(cbBTC), uint256(BTC_PRICE));
        router.setPrice(address(weth), uint256(ETH_PRICE));
        router.setPrice(address(usdc), uint256(USDC_PRICE));

        // Mint tokens to router for liquidity
        cbBTC.mint(address(router), 1000e8);
        weth.mint(address(router), 10000e18);
        usdc.mint(address(router), 100000000e6);

        // Setup default config (40% BTC, 40% ETH, 20% USDC)
        delete defaultConfig;
        defaultConfig.push(MeezanVaultV3.AssetConfig({
            token: address(cbBTC),
            priceFeed: address(btcFeed),
            poolFee: 3000,  // 0.3% for cbBTC/USDC
            targetWeightBps: 4000  // 40%
        }));
        defaultConfig.push(MeezanVaultV3.AssetConfig({
            token: address(weth),
            priceFeed: address(ethFeed),
            poolFee: 500,   // 0.05% for WETH/USDC
            targetWeightBps: 4000  // 40%
        }));
        defaultConfig.push(MeezanVaultV3.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 2000  // 20%
        }));

        // Deploy vault
        vault = new MeezanVaultV3(
            defaultConfig,
            address(router),
            address(usdc),
            500,  // 5% drift threshold
            owner,
            conversionExecutor
        );

        // Mint tokens to owner
        cbBTC.mint(owner, 10e8);      // 10 BTC
        weth.mint(owner, 100e18);     // 100 ETH
        usdc.mint(owner, 1000000e6);  // 1M USDC

        // Approve vault
        vm.startPrank(owner);
        cbBTC.approve(address(vault), type(uint256).max);
        weth.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    // ============ Helper Functions ============

    function _depositDefaultPortfolio() internal {
        // Deposit to match target allocation roughly
        // $400K BTC + $300K ETH + $200K USDC = $900K total
        vm.startPrank(owner);
        vault.deposit(0, 4e8);       // 4 BTC = $400K
        vault.deposit(1, 100e18);    // ~100 ETH = $300K (slightly under target)
        vault.deposit(2, 200000e6);  // 200K USDC
        vm.stopPrank();
    }

    function _getMinAmountsOut() internal view returns (uint256[] memory) {
        // Get conversion order to understand which index is which asset
        (address[] memory tokens,) = vault.getConversionAssetOrder();
        uint256[] memory minAmounts = new uint256[](tokens.length);

        // Set reasonable minimum amounts (95% of expected based on oracle)
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 balance = IERC20(tokens[i]).balanceOf(address(vault));
            if (balance > 0) {
                // Calculate expected USDC based on oracle price
                uint256 price;
                if (tokens[i] == address(cbBTC)) {
                    price = uint256(BTC_PRICE);
                    // BTC has 8 decimals, price has 8 decimals, USDC has 6 decimals
                    // expectedUsdc = balance * price / 1e8 (to get USD) / 1e8 * 1e6 (to USDC decimals)
                    uint256 expectedUsdc = (balance * price / 1e8) / 100;
                    minAmounts[i] = (expectedUsdc * 95) / 100;  // 95% of expected
                } else if (tokens[i] == address(weth)) {
                    price = uint256(ETH_PRICE);
                    // ETH has 18 decimals, price has 8 decimals, USDC has 6 decimals
                    uint256 expectedUsdc = (balance * price / 1e18) / 100;
                    minAmounts[i] = (expectedUsdc * 95) / 100;
                }
            } else {
                minAmounts[i] = 1;  // Minimum 1 wei to pass ZeroMinAmountOut check
            }
        }
        return minAmounts;
    }

    // ============ INV-W1: withdrawAll ALWAYS Succeeds ============

    function test_INV_W1_WithdrawAllAlwaysSucceeds_NormalState() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        uint256[] memory amounts = vault.withdrawAll();

        // Verify all assets returned
        assertEq(amounts.length, 3);
        assertGt(amounts[0], 0, "Should withdraw BTC");
        assertGt(amounts[1], 0, "Should withdraw ETH");
        assertGt(amounts[2], 0, "Should withdraw USDC");

        // Verify vault is empty
        assertEq(cbBTC.balanceOf(address(vault)), 0);
        assertEq(weth.balanceOf(address(vault)), 0);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_INV_W1_WithdrawAllAlwaysSucceeds_WhenPaused() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vault.pause();

        // Deposits should fail when paused
        vm.prank(owner);
        vm.expectRevert();
        vault.deposit(0, 1e8);

        // But withdrawAll should still work
        vm.prank(owner);
        uint256[] memory amounts = vault.withdrawAll();

        assertGt(amounts[0], 0, "Should withdraw even when paused");
    }

    function test_INV_W1_WithdrawAllAlwaysSucceeds_WithConversionPending() public {
        _depositDefaultPortfolio();

        // Request conversion
        vm.prank(owner);
        vault.requestConversion();
        assertTrue(vault.conversionRequested(), "Conversion should be pending");

        // withdrawAll should auto-cancel and succeed
        vm.prank(owner);
        uint256[] memory amounts = vault.withdrawAll();

        assertFalse(vault.conversionRequested(), "Conversion should be cancelled");
        assertGt(amounts[0], 0, "Should withdraw BTC");
        assertEq(cbBTC.balanceOf(address(vault)), 0, "Vault should be empty");
    }

    function test_INV_W1_WithdrawAllAlwaysSucceeds_AfterFailedConversion() public {
        _depositDefaultPortfolio();

        // Try convertAndWithdraw with bad slippage params (should fail)
        uint256[] memory badMinAmounts = new uint256[](2);
        badMinAmounts[0] = type(uint256).max;  // Impossible minimum
        badMinAmounts[1] = type(uint256).max;

        vm.prank(owner);
        vm.expectRevert();  // Should revert due to slippage
        vault.convertAndWithdraw(badMinAmounts);

        // withdrawAll should still work
        vm.prank(owner);
        uint256[] memory amounts = vault.withdrawAll();

        assertGt(amounts[0], 0, "Should withdraw after failed conversion");
    }

    function test_INV_W1_WithdrawAllAlwaysSucceeds_WithStaleOracle() public {
        _depositDefaultPortfolio();

        // Make oracle stale
        vm.warp(block.timestamp + 3700);  // > 1 hour

        // totalUsdValue should fail with stale oracle
        vm.expectRevert(MeezanVaultV3.StalePrice.selector);
        vault.totalUsdValue();

        // But withdrawAll doesn't use oracles - should succeed
        vm.prank(owner);
        uint256[] memory amounts = vault.withdrawAll();

        assertGt(amounts[0], 0, "Should withdraw with stale oracle");
    }

    function test_INV_W1_WithdrawAllAlwaysSucceeds_EmptyVault() public {
        // Don't deposit anything
        vm.prank(owner);
        uint256[] memory amounts = vault.withdrawAll();

        // Should return zeros, not revert
        assertEq(amounts[0], 0);
        assertEq(amounts[1], 0);
        assertEq(amounts[2], 0);
    }

    // ============ INV-C1: convertAndWithdraw Atomic Revert ============

    function test_INV_C1_ConvertAndWithdraw_AtomicSuccess() public {
        _depositDefaultPortfolio();

        uint256[] memory minAmounts = _getMinAmountsOut();

        uint256 ownerUsdcBefore = usdc.balanceOf(owner);

        vm.prank(owner);
        vault.convertAndWithdraw(minAmounts);

        // All USDC should be in owner's wallet
        uint256 ownerUsdcAfter = usdc.balanceOf(owner);
        assertGt(ownerUsdcAfter, ownerUsdcBefore, "Owner should receive USDC");

        // Vault should be empty
        assertEq(cbBTC.balanceOf(address(vault)), 0, "No BTC left");
        assertEq(weth.balanceOf(address(vault)), 0, "No ETH left");
        // Note: Dust USDC might remain below MIN_SWAP_USD threshold
    }

    function test_INV_C1_ConvertAndWithdraw_AtomicRevert_SlippageFails() public {
        _depositDefaultPortfolio();

        uint256 btcBefore = cbBTC.balanceOf(address(vault));
        uint256 ethBefore = weth.balanceOf(address(vault));
        uint256 usdcBefore = usdc.balanceOf(address(vault));

        // Set impossible minimum amounts
        uint256[] memory badMinAmounts = new uint256[](2);
        badMinAmounts[0] = type(uint256).max;
        badMinAmounts[1] = type(uint256).max;

        vm.prank(owner);
        vm.expectRevert();  // Should revert
        vault.convertAndWithdraw(badMinAmounts);

        // State should be unchanged (atomic revert)
        assertEq(cbBTC.balanceOf(address(vault)), btcBefore, "BTC unchanged");
        assertEq(weth.balanceOf(address(vault)), ethBefore, "ETH unchanged");
        assertEq(usdc.balanceOf(address(vault)), usdcBefore, "USDC unchanged");
    }

    function test_INV_C1_ConvertAndWithdraw_RevertIfConversionPending() public {
        _depositDefaultPortfolio();

        // Request background conversion first
        vm.prank(owner);
        vault.requestConversion();

        // convertAndWithdraw should be blocked
        uint256[] memory minAmounts = _getMinAmountsOut();

        vm.prank(owner);
        vm.expectRevert(MeezanVaultV3.ConversionPendingMustCancel.selector);
        vault.convertAndWithdraw(minAmounts);
    }

    function test_INV_C1_ConvertAndWithdraw_InvalidMinAmountsLength() public {
        _depositDefaultPortfolio();

        // Wrong length (should be 2 for 3-asset vault)
        uint256[] memory wrongLength = new uint256[](1);
        wrongLength[0] = 1;

        vm.prank(owner);
        vm.expectRevert(MeezanVaultV3.InvalidMinAmountsLength.selector);
        vault.convertAndWithdraw(wrongLength);
    }

    function test_INV_C1_ConvertAndWithdraw_ZeroMinAmountReverts() public {
        _depositDefaultPortfolio();

        // minAmountsOut with zeros for non-dust assets
        uint256[] memory zeroMinAmounts = new uint256[](2);
        zeroMinAmounts[0] = 0;  // Zero for BTC (which has balance)
        zeroMinAmounts[1] = 0;

        vm.prank(owner);
        vm.expectRevert(MeezanVaultV3.ZeroMinAmountOut.selector);
        vault.convertAndWithdraw(zeroMinAmounts);
    }

    // ============ INV-C3: Request/Execute/Cancel State Transitions ============

    function test_INV_C3_RequestConversion_Success() public {
        _depositDefaultPortfolio();

        assertFalse(vault.conversionRequested());

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit MeezanVaultV3.ConversionRequested(owner, block.timestamp);
        vault.requestConversion();

        assertTrue(vault.conversionRequested());
    }

    function test_INV_C3_RequestConversion_OnlyOneAtATime() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vault.requestConversion();

        // Second request should fail
        vm.prank(owner);
        vm.expectRevert(MeezanVaultV3.ConversionAlreadyPending.selector);
        vault.requestConversion();
    }

    function test_INV_C3_RequestConversion_FailsIfDisabled() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vault.disableBackgroundConversion();

        vm.prank(owner);
        vm.expectRevert(MeezanVaultV3.BackgroundConversionDisabled.selector);
        vault.requestConversion();
    }

    function test_INV_C3_RequestConversion_FailsIfNoExecutor() public {
        // Deploy vault without conversion executor
        MeezanVaultV3 vaultNoExecutor = new MeezanVaultV3(
            defaultConfig,
            address(router),
            address(usdc),
            500,
            owner,
            address(0)  // No executor
        );

        vm.prank(owner);
        vm.expectRevert(MeezanVaultV3.NoConversionExecutor.selector);
        vaultNoExecutor.requestConversion();
    }

    function test_INV_C3_ExecuteConversion_Success() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vault.requestConversion();

        uint256[] memory minAmounts = _getMinAmountsOut();

        vm.prank(conversionExecutor);
        vault.executeConversion(minAmounts);

        assertFalse(vault.conversionRequested(), "Conversion should be cleared");

        // Assets should be converted to USDC (still in vault, not withdrawn)
        uint256 vaultUsdc = usdc.balanceOf(address(vault));
        assertGt(vaultUsdc, 200000e6, "Should have more USDC after conversion");
    }

    function test_INV_C3_ExecuteConversion_OnlyExecutor() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vault.requestConversion();

        uint256[] memory minAmounts = _getMinAmountsOut();

        // Random user cannot execute
        vm.prank(user);
        vm.expectRevert(MeezanVaultV3.OnlyConversionExecutor.selector);
        vault.executeConversion(minAmounts);

        // Owner cannot execute (only conversionExecutor can)
        vm.prank(owner);
        vm.expectRevert(MeezanVaultV3.OnlyConversionExecutor.selector);
        vault.executeConversion(minAmounts);
    }

    function test_INV_C3_ExecuteConversion_FailsIfNotPending() public {
        _depositDefaultPortfolio();

        uint256[] memory minAmounts = _getMinAmountsOut();

        vm.prank(conversionExecutor);
        vm.expectRevert(MeezanVaultV3.NoConversionPending.selector);
        vault.executeConversion(minAmounts);
    }

    function test_INV_C3_ExecuteConversion_FailsIfDisabled() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vault.requestConversion();

        // Disable background conversion (also cancels pending)
        vm.prank(owner);
        vault.disableBackgroundConversion();

        uint256[] memory minAmounts = _getMinAmountsOut();

        vm.prank(conversionExecutor);
        vm.expectRevert(MeezanVaultV3.BackgroundConversionDisabled.selector);
        vault.executeConversion(minAmounts);
    }

    function test_INV_C3_CancelConversion_Success() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vault.requestConversion();
        assertTrue(vault.conversionRequested());

        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit MeezanVaultV3.ConversionCancelled(owner);
        vault.cancelConversion();

        assertFalse(vault.conversionRequested());
    }

    function test_INV_C3_CancelConversion_OnlyOwner() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vault.requestConversion();

        vm.prank(user);
        vm.expectRevert(MeezanVaultV3.OnlyOwner.selector);
        vault.cancelConversion();
    }

    function test_INV_C3_CancelConversion_FailsIfNoPending() public {
        vm.prank(owner);
        vm.expectRevert(MeezanVaultV3.NoConversionPending.selector);
        vault.cancelConversion();
    }

    // ============ Auto-Cancel on Deposit/Rebalance ============

    function test_AutoCancel_OnDeposit() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vault.requestConversion();
        assertTrue(vault.conversionRequested());

        // Deposit should auto-cancel
        vm.prank(owner);
        vault.deposit(2, 1000e6);

        assertFalse(vault.conversionRequested(), "Should auto-cancel on deposit");
    }

    function test_AutoCancel_OnDepositAndRebalance() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vault.requestConversion();
        assertTrue(vault.conversionRequested());

        // depositAndRebalance should auto-cancel
        vm.prank(owner);
        vault.depositAndRebalance(2, 10000e6);

        assertFalse(vault.conversionRequested(), "Should auto-cancel on depositAndRebalance");
    }

    function test_AutoCancel_OnRebalance() public {
        _depositDefaultPortfolio();

        // Create drift for rebalance
        btcFeed.setPrice(150000e8);
        router.setPrice(address(cbBTC), uint256(150000e8));

        vm.prank(owner);
        vault.requestConversion();
        assertTrue(vault.conversionRequested());

        // Rebalance should auto-cancel
        vm.prank(owner);
        vault.rebalance();

        assertFalse(vault.conversionRequested(), "Should auto-cancel on rebalance");
    }

    function test_AutoCancel_OnWithdrawAll() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vault.requestConversion();
        assertTrue(vault.conversionRequested());

        // withdrawAll should auto-cancel
        vm.prank(owner);
        vault.withdrawAll();

        assertFalse(vault.conversionRequested(), "Should auto-cancel on withdrawAll");
    }

    // ============ getConversionAssetOrder Tests ============

    function test_GetConversionAssetOrder_CorrectOrder() public view {
        (address[] memory tokens, uint8[] memory indices) = vault.getConversionAssetOrder();

        // Should have 2 entries (assetCount - 1 = 3 - 1)
        assertEq(tokens.length, 2);
        assertEq(indices.length, 2);

        // Stablecoin is at index 2, so order should be: index 0 (BTC), index 1 (ETH)
        assertEq(tokens[0], address(cbBTC), "First should be cbBTC");
        assertEq(indices[0], 0);
        assertEq(tokens[1], address(weth), "Second should be WETH");
        assertEq(indices[1], 1);
    }

    function test_GetConversionAssetOrder_MatchesMinAmountsOut() public {
        _depositDefaultPortfolio();

        (address[] memory tokens,) = vault.getConversionAssetOrder();
        uint256[] memory minAmounts = new uint256[](tokens.length);

        // Set min amounts in the order returned by helper
        for (uint256 i = 0; i < tokens.length; i++) {
            minAmounts[i] = 1;  // Minimal amount to pass check
        }

        // Conversion should use these in the same order
        vm.prank(owner);
        vault.convertAndWithdraw(minAmounts);  // Should not revert with correct ordering
    }

    function test_GetConversionAssetOrder_NonStablecoinCount() public view {
        uint8 count = vault.nonStablecoinAssetCount();
        assertEq(count, 2, "Should be assetCount - 1");

        (address[] memory tokens,) = vault.getConversionAssetOrder();
        assertEq(tokens.length, count, "Array length should match nonStablecoinAssetCount");
    }

    // ============ Background Conversion Control ============

    function test_DisableBackgroundConversion_AutoCancelsPending() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vault.requestConversion();
        assertTrue(vault.conversionRequested());

        vm.prank(owner);
        vault.disableBackgroundConversion();

        assertFalse(vault.conversionRequested(), "Should auto-cancel when disabling");
        assertTrue(vault.backgroundConversionDisabled());
    }

    function test_EnableBackgroundConversion_FailsWithNoExecutor() public {
        // Deploy vault without executor
        MeezanVaultV3 vaultNoExecutor = new MeezanVaultV3(
            defaultConfig,
            address(router),
            address(usdc),
            500,
            owner,
            address(0)
        );

        vm.prank(owner);
        vm.expectRevert(MeezanVaultV3.NoConversionExecutor.selector);
        vaultNoExecutor.enableBackgroundConversion();
    }

    function test_EnableBackgroundConversion_Success() public {
        vm.prank(owner);
        vault.disableBackgroundConversion();
        assertTrue(vault.backgroundConversionDisabled());

        vm.prank(owner);
        vault.enableBackgroundConversion();
        assertFalse(vault.backgroundConversionDisabled());
    }

    // ============ Dust Threshold Tests ============

    function test_DustThreshold_SkipsSmallSwaps() public {
        // Deposit tiny amounts (below $1 MIN_SWAP_USD)
        vm.startPrank(owner);
        vault.deposit(0, 100);      // 0.000001 BTC = $0.10
        vault.deposit(1, 1e14);     // 0.0001 ETH = $0.30
        vault.deposit(2, 1000e6);   // $1000 USDC
        vm.stopPrank();

        router.clearHistory();

        // minAmounts for tiny balances
        uint256[] memory minAmounts = new uint256[](2);
        minAmounts[0] = 1;  // Will be skipped due to dust
        minAmounts[1] = 1;  // Will be skipped due to dust

        vm.prank(owner);
        vault.convertAndWithdraw(minAmounts);

        // Should have no swaps (all below dust threshold)
        assertEq(router.swapCount(), 0, "Should skip dust swaps");
    }

    // ============ Event Emission Tests ============

    function test_Events_ConvertedAndWithdrawn() public {
        _depositDefaultPortfolio();

        uint256[] memory minAmounts = _getMinAmountsOut();

        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit MeezanVaultV3.ConvertedAndWithdrawn(owner, 0, 0, 0);
        vault.convertAndWithdraw(minAmounts);
    }

    function test_Events_ConversionExecuted() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vault.requestConversion();

        uint256[] memory minAmounts = _getMinAmountsOut();

        vm.prank(conversionExecutor);
        vm.expectEmit(true, false, false, false);
        emit MeezanVaultV3.ConversionExecuted(conversionExecutor, 0, 0, 0);
        vault.executeConversion(minAmounts);
    }

    // ============ Constructor Tests ============

    function test_Constructor_SetsConversionExecutor() public view {
        assertEq(vault.conversionExecutor(), conversionExecutor);
    }

    function test_Constructor_AllowsZeroExecutor() public {
        // Should not revert with zero executor
        MeezanVaultV3 vaultNoExecutor = new MeezanVaultV3(
            defaultConfig,
            address(router),
            address(usdc),
            500,
            owner,
            address(0)  // Zero executor allowed
        );

        assertEq(vaultNoExecutor.conversionExecutor(), address(0));
    }

    function test_Constructor_InitialState() public view {
        assertFalse(vault.conversionRequested());
        assertFalse(vault.backgroundConversionDisabled());
    }

    // ============ V2 Inherited Functionality ============

    function test_V2_WithdrawStillWorks() public {
        _depositDefaultPortfolio();

        uint256 ownerBtcBefore = cbBTC.balanceOf(owner);

        vm.prank(owner);
        vault.withdraw(0, 1e8);  // Withdraw 1 BTC

        assertEq(cbBTC.balanceOf(owner), ownerBtcBefore + 1e8);
    }

    function test_V2_RebalanceStillWorks() public {
        _depositDefaultPortfolio();

        // Create drift
        btcFeed.setPrice(150000e8);
        router.setPrice(address(cbBTC), uint256(150000e8));

        assertTrue(vault.portfolioDriftBps() >= vault.driftThresholdBps());

        vm.prank(owner);
        vault.rebalance();

        // Drift should be reduced
        uint16 postDrift = vault.portfolioDriftBps();
        assertLt(postDrift, vault.driftThresholdBps(), "Drift should be reduced");
    }

    // ============ Fuzz Tests ============

    function testFuzz_WithdrawAllAlwaysSucceeds(uint256 btcAmount, uint256 ethAmount, uint256 usdcAmount) public {
        btcAmount = bound(btcAmount, 0, 10e8);
        ethAmount = bound(ethAmount, 0, 100e18);
        usdcAmount = bound(usdcAmount, 0, 1000000e6);

        vm.startPrank(owner);
        if (btcAmount > 0) vault.deposit(0, btcAmount);
        if (ethAmount > 0) vault.deposit(1, ethAmount);
        if (usdcAmount > 0) vault.deposit(2, usdcAmount);
        vm.stopPrank();

        // Should never revert
        vm.prank(owner);
        vault.withdrawAll();

        // Vault should be empty
        assertEq(cbBTC.balanceOf(address(vault)), 0);
        assertEq(weth.balanceOf(address(vault)), 0);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function testFuzz_ConversionStateConsistency(bool requestFirst, bool cancelMidway) public {
        _depositDefaultPortfolio();

        if (requestFirst) {
            vm.prank(owner);
            vault.requestConversion();
            assertTrue(vault.conversionRequested());

            if (cancelMidway) {
                vm.prank(owner);
                vault.cancelConversion();
                assertFalse(vault.conversionRequested());
            }
        }

        // withdrawAll should always work regardless of state
        vm.prank(owner);
        vault.withdrawAll();

        // State should be clean after withdrawAll
        assertFalse(vault.conversionRequested());
    }
}

/**
 * @title MeezanVaultV3EdgeCaseTest
 * @notice Edge case and integration tests for MeezanVaultV3
 */
contract MeezanVaultV3EdgeCaseTest is Test {
    // Reuse setup similar to main test but focus on edge cases

    address public owner;
    address public conversionExecutor;

    MockERC20 public cbBTC;
    MockERC20 public weth;
    MockERC20 public usdc;

    MockPriceFeed public btcFeed;
    MockPriceFeed public ethFeed;
    MockPriceFeed public usdcFeed;

    MockSwapRouterV2 public router;
    MeezanVaultV3 public vault;

    function setUp() public {
        owner = makeAddr("owner");
        conversionExecutor = makeAddr("conversionExecutor");

        cbBTC = new MockERC20("Coinbase BTC", "cbBTC", 8);
        weth = new MockERC20("Wrapped ETH", "WETH", 18);
        usdc = new MockERC20("USD Coin", "USDC", 6);

        btcFeed = new MockPriceFeed(8, 100000e8, "BTC / USD");
        ethFeed = new MockPriceFeed(8, 3000e8, "ETH / USD");
        usdcFeed = new MockPriceFeed(8, 1e8, "USDC / USD");

        router = new MockSwapRouterV2(address(usdc));
        router.setPrice(address(cbBTC), 100000e8);
        router.setPrice(address(weth), 3000e8);
        router.setPrice(address(usdc), 1e8);

        cbBTC.mint(address(router), 1000e8);
        weth.mint(address(router), 10000e18);
        usdc.mint(address(router), 100000000e6);

        MeezanVaultV3.AssetConfig[] memory config = new MeezanVaultV3.AssetConfig[](3);
        config[0] = MeezanVaultV3.AssetConfig({
            token: address(cbBTC),
            priceFeed: address(btcFeed),
            poolFee: 3000,
            targetWeightBps: 4000
        });
        config[1] = MeezanVaultV3.AssetConfig({
            token: address(weth),
            priceFeed: address(ethFeed),
            poolFee: 500,
            targetWeightBps: 4000
        });
        config[2] = MeezanVaultV3.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 2000
        });

        vault = new MeezanVaultV3(
            config,
            address(router),
            address(usdc),
            500,
            owner,
            conversionExecutor
        );

        cbBTC.mint(owner, 10e8);
        weth.mint(owner, 100e18);
        usdc.mint(owner, 1000000e6);

        vm.startPrank(owner);
        cbBTC.approve(address(vault), type(uint256).max);
        weth.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    function test_OnlyUsdcInVault_ConversionNoOp() public {
        // Only deposit USDC
        vm.prank(owner);
        vault.deposit(2, 10000e6);

        uint256[] memory minAmounts = new uint256[](2);
        minAmounts[0] = 1;
        minAmounts[1] = 1;

        uint256 usdcBefore = usdc.balanceOf(owner);

        vm.prank(owner);
        vault.convertAndWithdraw(minAmounts);

        // Should just transfer USDC (no swaps needed)
        assertEq(router.swapCount(), 0, "No swaps needed for USDC-only");
        assertGt(usdc.balanceOf(owner), usdcBefore, "Owner should receive USDC");
    }

    function test_ExecuteConversion_ThenWithdrawAll() public {
        // Deposit portfolio
        vm.startPrank(owner);
        vault.deposit(0, 4e8);
        vault.deposit(1, 100e18);
        vault.deposit(2, 200000e6);
        vm.stopPrank();

        // Request and execute conversion
        vm.prank(owner);
        vault.requestConversion();

        uint256[] memory minAmounts = new uint256[](2);
        minAmounts[0] = 1;
        minAmounts[1] = 1;

        vm.prank(conversionExecutor);
        vault.executeConversion(minAmounts);

        // Now owner should withdrawAll to get the converted USDC
        uint256 ownerUsdcBefore = usdc.balanceOf(owner);

        vm.prank(owner);
        uint256[] memory amounts = vault.withdrawAll();

        // Most value should be in USDC now
        assertGt(usdc.balanceOf(owner), ownerUsdcBefore + 200000e6, "Should have more USDC");
    }

    function test_FullLifecycle_RequestCancelRetry() public {
        vm.startPrank(owner);
        vault.deposit(0, 4e8);
        vault.deposit(1, 100e18);
        vault.deposit(2, 200000e6);
        vm.stopPrank();

        // 1. Request conversion
        vm.prank(owner);
        vault.requestConversion();
        assertTrue(vault.conversionRequested());

        // 2. Cancel it
        vm.prank(owner);
        vault.cancelConversion();
        assertFalse(vault.conversionRequested());

        // 3. Request again
        vm.prank(owner);
        vault.requestConversion();
        assertTrue(vault.conversionRequested());

        // 4. Execute successfully
        uint256[] memory minAmounts = new uint256[](2);
        minAmounts[0] = 1;
        minAmounts[1] = 1;

        vm.prank(conversionExecutor);
        vault.executeConversion(minAmounts);
        assertFalse(vault.conversionRequested());

        // 5. Withdraw
        vm.prank(owner);
        vault.withdrawAll();

        assertEq(cbBTC.balanceOf(address(vault)), 0);
        assertEq(weth.balanceOf(address(vault)), 0);
    }
}
