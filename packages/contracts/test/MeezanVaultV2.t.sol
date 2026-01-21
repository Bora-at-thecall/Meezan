// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console2.sol";

import {MeezanVaultV2} from "../src/MeezanVaultV2.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceFeed} from "./mocks/MockPriceFeed.sol";
import {MockSwapRouter} from "./mocks/MockSwapRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MeezanVaultV2Test
 * @notice Comprehensive test suite for MeezanVaultV2
 * @dev Tests all invariants from V2_INVARIANTS.md
 */
contract MeezanVaultV2Test is Test {
    // Test accounts
    address public owner;
    address public executor;
    address public user;

    // Mock tokens (4-asset default: BTC, ETH, SOL, USDC)
    MockERC20 public btc;
    MockERC20 public eth;
    MockERC20 public sol;
    MockERC20 public usdc;

    // Mock price feeds
    MockPriceFeed public btcFeed;
    MockPriceFeed public ethFeed;
    MockPriceFeed public solFeed;
    MockPriceFeed public usdcFeed;

    // Mock swap router
    MockSwapRouter public router;

    // Vault under test
    MeezanVaultV2 public vault;

    // Default configuration (40% BTC, 30% ETH, 10% SOL, 20% USDC)
    MeezanVaultV2.AssetConfig[] internal defaultConfig;

    // Prices (8 decimals like Chainlink)
    int256 constant BTC_PRICE = 100000e8;  // $100,000
    int256 constant ETH_PRICE = 3000e8;    // $3,000
    int256 constant SOL_PRICE = 150e8;     // $150
    int256 constant USDC_PRICE = 1e8;      // $1

    function setUp() public {
        // Setup accounts
        owner = makeAddr("owner");
        executor = makeAddr("executor");
        user = makeAddr("user");

        // Deploy mock tokens
        btc = new MockERC20("Mock BTC", "mBTC", 8);
        eth = new MockERC20("Mock ETH", "mETH", 18);
        sol = new MockERC20("Mock SOL", "mSOL", 9);
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        // Deploy mock price feeds
        btcFeed = new MockPriceFeed(8, BTC_PRICE, "BTC / USD");
        ethFeed = new MockPriceFeed(8, ETH_PRICE, "ETH / USD");
        solFeed = new MockPriceFeed(8, SOL_PRICE, "SOL / USD");
        usdcFeed = new MockPriceFeed(8, USDC_PRICE, "USDC / USD");

        // Deploy mock router
        router = new MockSwapRouter(1e18, address(btc), address(usdc));

        // Setup default config (40% BTC, 30% ETH, 10% SOL, 20% USDC)
        delete defaultConfig;
        defaultConfig.push(MeezanVaultV2.AssetConfig({
            token: address(btc),
            priceFeed: address(btcFeed),
            poolFee: 500,
            targetWeightBps: 4000  // 40%
        }));
        defaultConfig.push(MeezanVaultV2.AssetConfig({
            token: address(eth),
            priceFeed: address(ethFeed),
            poolFee: 500,
            targetWeightBps: 3000  // 30%
        }));
        defaultConfig.push(MeezanVaultV2.AssetConfig({
            token: address(sol),
            priceFeed: address(solFeed),
            poolFee: 500,
            targetWeightBps: 1000  // 10%
        }));
        defaultConfig.push(MeezanVaultV2.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 2000  // 20%
        }));

        // Deploy vault with default config
        vm.prank(owner);
        vault = new MeezanVaultV2(
            defaultConfig,
            address(router),
            address(usdc),
            500  // 5% drift threshold
        );

        // Mint tokens to owner
        btc.mint(owner, 10e8);      // 10 BTC
        eth.mint(owner, 100e18);    // 100 ETH
        sol.mint(owner, 1000e9);    // 1000 SOL
        usdc.mint(owner, 1000000e6); // 1M USDC

        // Approve vault
        vm.startPrank(owner);
        btc.approve(address(vault), type(uint256).max);
        eth.approve(address(vault), type(uint256).max);
        sol.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    // ============ Helper Functions ============

    function _deployVault(MeezanVaultV2.AssetConfig[] memory config, uint16 drift) internal returns (MeezanVaultV2) {
        vm.prank(owner);
        return new MeezanVaultV2(config, address(router), address(usdc), drift);
    }

    function _depositDefaultPortfolio() internal {
        // Deposit to match target allocation roughly
        // $400K BTC + $300K ETH + $100K SOL + $200K USDC = $1M total
        vm.startPrank(owner);
        vault.deposit(0, 4e8);       // 4 BTC = $400K
        vault.deposit(1, 100e18);    // 100 ETH = $300K
        vault.deposit(2, 666e9);     // 666 SOL = ~$100K
        vault.deposit(3, 200000e6);  // 200K USDC
        vm.stopPrank();
    }

    // ============ INV-01: Weight Sum Integrity ============

    function test_INV01_WeightSumIs10000() public view {
        uint256 total = 0;
        for (uint8 i = 0; i < vault.assetCount(); i++) {
            total += vault.targetWeightBps(i);
        }
        assertEq(total, 10000, "Target weights must sum to 10000");
    }

    function test_INV01_RevertOnInvalidWeightSum() public {
        MeezanVaultV2.AssetConfig[] memory badConfig = new MeezanVaultV2.AssetConfig[](2);
        badConfig[0] = MeezanVaultV2.AssetConfig({
            token: address(btc),
            priceFeed: address(btcFeed),
            poolFee: 500,
            targetWeightBps: 5000
        });
        badConfig[1] = MeezanVaultV2.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 4999  // Sum = 9999 (not 10000)
        });

        vm.expectRevert(MeezanVaultV2.InvalidAllocation.selector);
        _deployVault(badConfig, 500);
    }

    // ============ INV-02: Minimum Weight Per Asset ============

    function test_INV02_MinimumWeight() public view {
        for (uint8 i = 0; i < vault.assetCount(); i++) {
            assertGe(vault.targetWeightBps(i), 100, "Each weight must be >= 100 bps");
        }
    }

    function test_INV02_RevertOnWeightTooSmall() public {
        MeezanVaultV2.AssetConfig[] memory badConfig = new MeezanVaultV2.AssetConfig[](2);
        badConfig[0] = MeezanVaultV2.AssetConfig({
            token: address(btc),
            priceFeed: address(btcFeed),
            poolFee: 500,
            targetWeightBps: 9950  // 99.5%
        });
        badConfig[1] = MeezanVaultV2.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 50    // 0.5% - too small
        });

        vm.expectRevert(MeezanVaultV2.WeightTooSmall.selector);
        _deployVault(badConfig, 500);
    }

    // ============ INV-03: Asset Count Bounds ============

    function test_INV03_AssetCountBounds() public view {
        uint8 count = vault.assetCount();
        assertGe(count, 2, "Asset count must be >= 2");
        assertLe(count, 10, "Asset count must be <= 10");
    }

    function test_INV03_RevertOnTooFewAssets() public {
        MeezanVaultV2.AssetConfig[] memory badConfig = new MeezanVaultV2.AssetConfig[](1);
        badConfig[0] = MeezanVaultV2.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 10000
        });

        vm.expectRevert(MeezanVaultV2.TooFewAssets.selector);
        _deployVault(badConfig, 500);
    }

    function test_INV03_RevertOnTooManyAssets() public {
        // Create 11 mock tokens and feeds
        MeezanVaultV2.AssetConfig[] memory badConfig = new MeezanVaultV2.AssetConfig[](11);

        for (uint8 i = 0; i < 11; i++) {
            MockERC20 token = new MockERC20(string.concat("Token", vm.toString(i)), "TKN", 18);
            MockPriceFeed feed = new MockPriceFeed(8, 1e8, "TKN / USD");

            badConfig[i] = MeezanVaultV2.AssetConfig({
                token: address(token),
                priceFeed: address(feed),
                poolFee: 500,
                targetWeightBps: i == 10 ? 1000 : 900  // Weights sum to 10000
            });
        }

        vm.expectRevert(MeezanVaultV2.TooManyAssets.selector);
        _deployVault(badConfig, 500);
    }

    // ============ INV-04: Stablecoin Presence ============

    function test_INV04_StablecoinPresent() public view {
        uint8 idx = vault.stablecoinIndex();
        assertLt(idx, vault.assetCount(), "Stablecoin index must be valid");
        assertEq(vault.assets(idx), address(usdc), "Stablecoin must be USDC");
    }

    function test_INV04_RevertOnMissingStablecoin() public {
        MeezanVaultV2.AssetConfig[] memory badConfig = new MeezanVaultV2.AssetConfig[](2);
        badConfig[0] = MeezanVaultV2.AssetConfig({
            token: address(btc),
            priceFeed: address(btcFeed),
            poolFee: 500,
            targetWeightBps: 5000
        });
        badConfig[1] = MeezanVaultV2.AssetConfig({
            token: address(eth),
            priceFeed: address(ethFeed),
            poolFee: 500,
            targetWeightBps: 5000
        });

        // Try to deploy with USDC as stablecoin, but it's not in the config
        vm.expectRevert(MeezanVaultV2.StablecoinNotInAssets.selector);
        vm.prank(owner);
        new MeezanVaultV2(badConfig, address(router), address(usdc), 500);
    }

    // ============ INV-05: Owner Exclusivity for Withdrawals ============

    function test_INV05_OnlyOwnerCanWithdraw() public {
        _depositDefaultPortfolio();

        // Non-owner cannot withdraw
        vm.prank(user);
        vm.expectRevert(MeezanVaultV2.OnlyOwner.selector);
        vault.withdraw(0, 1e8);

        // Owner can withdraw
        vm.prank(owner);
        vault.withdraw(0, 1e8);
    }

    function test_INV05_OnlyOwnerCanWithdrawAll() public {
        _depositDefaultPortfolio();

        vm.prank(user);
        vm.expectRevert(MeezanVaultV2.OnlyOwner.selector);
        vault.withdrawAll();

        vm.prank(owner);
        vault.withdrawAll();
    }

    // ============ INV-06: Executor Rebalance Constraints ============

    function test_INV06_ExecutorNeedsAutoRebalanceEnabled() public {
        _depositDefaultPortfolio();

        // Set executor but don't enable auto-rebalance
        vm.prank(owner);
        vault.setExecutor(executor);

        // Make price change to create drift
        btcFeed.setPrice(150000e8);  // BTC +50%

        // Executor should fail
        vm.prank(executor);
        vm.expectRevert(MeezanVaultV2.OnlyOwnerOrExecutor.selector);
        vault.rebalance();

        // Enable auto-rebalance
        vm.prank(owner);
        vault.setAutoRebalanceEnabled(true);

        // Now executor can rebalance
        vm.prank(executor);
        vault.rebalance();
    }

    function test_INV06_ExecutorRespectsCooldown() public {
        _depositDefaultPortfolio();

        // Enable executor
        vm.startPrank(owner);
        vault.setExecutor(executor);
        vault.setAutoRebalanceEnabled(true);
        vm.stopPrank();

        // Create drift
        btcFeed.setPrice(150000e8);

        // First rebalance succeeds
        vm.prank(executor);
        vault.rebalance();

        // Immediate second rebalance fails (cooldown)
        btcFeed.setPrice(160000e8);  // More drift
        vm.prank(executor);
        vm.expectRevert(MeezanVaultV2.CooldownNotElapsed.selector);
        vault.rebalance();

        // After cooldown, it succeeds
        skip(vault.COOLDOWN_SECONDS() + 1);

        // Refresh all oracle timestamps after time skip
        btcFeed.setPrice(170000e8);  // This updates timestamp
        ethFeed.setPrice(ETH_PRICE);
        solFeed.setPrice(SOL_PRICE);
        usdcFeed.setPrice(USDC_PRICE);

        vm.prank(executor);
        vault.rebalance();
    }

    function test_INV06_OwnerBypassesCooldown() public {
        _depositDefaultPortfolio();

        // Create drift and rebalance as owner
        btcFeed.setPrice(150000e8);
        vm.prank(owner);
        vault.rebalance();

        // Owner can rebalance again immediately (no cooldown)
        btcFeed.setPrice(160000e8);
        vm.prank(owner);
        vault.rebalance();  // Should not revert
    }

    // ============ INV-07: Two-Step Ownership Transfer ============

    function test_INV07_TwoStepOwnership() public {
        address newOwner = makeAddr("newOwner");

        // Step 1: Start transfer
        vm.prank(owner);
        vault.transferOwnership(newOwner);
        assertEq(vault.owner(), owner, "Owner unchanged until acceptance");
        assertEq(vault.pendingOwner(), newOwner, "Pending owner set");

        // Random user cannot accept
        vm.prank(user);
        vm.expectRevert(MeezanVaultV2.NotPendingOwner.selector);
        vault.acceptOwnership();

        // Step 2: Accept transfer
        vm.prank(newOwner);
        vault.acceptOwnership();
        assertEq(vault.owner(), newOwner, "Owner updated");
        assertEq(vault.pendingOwner(), address(0), "Pending owner cleared");
    }

    function test_INV07_OwnerNeverZero() public view {
        assertTrue(vault.owner() != address(0), "Owner must never be zero");
    }

    // ============ INV-09: All Oracles Fresh For Operations ============

    function test_INV09_StaleOracleReverts() public {
        // Warp to a reasonable timestamp to avoid underflow
        vm.warp(100000);

        _depositDefaultPortfolio();

        // Make BTC oracle stale (set updatedAt to more than MAX_PRICE_STALENESS ago)
        btcFeed.setUpdatedAt(block.timestamp - vault.MAX_PRICE_STALENESS() - 1);

        // Trying to read USD value should fail
        vm.expectRevert(MeezanVaultV2.StalePrice.selector);
        vault.totalUsdValue();
    }

    function test_INV09_InvalidPriceReverts() public {
        _depositDefaultPortfolio();

        // Set BTC price to zero
        btcFeed.setPrice(0);

        vm.expectRevert(MeezanVaultV2.InvalidPrice.selector);
        vault.totalUsdValue();
    }

    // ============ INV-10: Appropriate Staleness Thresholds ============

    function test_INV10_StalenessThresholds() public view {
        assertEq(vault.MAX_PRICE_STALENESS(), 3600, "Volatile staleness = 1 hour");
        assertEq(vault.MAX_PRICE_STALENESS_STABLE(), 90000, "Stable staleness = 25 hours");
    }

    // ============ INV-11: Drift Threshold Gating ============

    function test_INV11_RebalanceRequiresDriftThreshold() public {
        _depositDefaultPortfolio();

        // Without drift, rebalance should fail
        vm.prank(owner);
        vm.expectRevert(MeezanVaultV2.DriftBelowThreshold.selector);
        vault.rebalance();

        // Create drift above threshold
        btcFeed.setPrice(150000e8);  // BTC +50%
        assertTrue(vault.portfolioDriftBps() >= vault.driftThresholdBps());

        // Now rebalance succeeds
        vm.prank(owner);
        vault.rebalance();
    }

    // ============ INV-12: Slippage Bounds ============

    function test_INV12_SlippageBounds() public view {
        uint16 slip = vault.slippageBps();
        assertGe(slip, vault.MIN_SLIPPAGE_BPS(), "Slippage >= min");
        assertLe(slip, vault.MAX_SLIPPAGE_BPS(), "Slippage <= max");
    }

    function test_INV12_SetSlippageValidation() public {
        // Too low
        vm.prank(owner);
        vm.expectRevert(MeezanVaultV2.InvalidSlippageBps.selector);
        vault.setSlippageBps(5);  // < 10

        // Too high
        vm.prank(owner);
        vm.expectRevert(MeezanVaultV2.InvalidSlippageBps.selector);
        vault.setSlippageBps(600);  // > 500

        // Valid
        vm.prank(owner);
        vault.setSlippageBps(200);
        assertEq(vault.slippageBps(), 200);
    }

    // ============ INV-13: Minimum Swap Value ============

    function test_INV13_MinSwapValue() public view {
        assertEq(vault.MIN_SWAP_USD(), 1e18, "Min swap = $1");
    }

    // ============ INV-14: Withdrawals Always Available ============

    function test_INV14_WithdrawalsWorkWhenPaused() public {
        _depositDefaultPortfolio();

        // Pause the vault
        vm.prank(owner);
        vault.pause();

        // Deposits should fail
        vm.prank(owner);
        vm.expectRevert();
        vault.deposit(0, 1e8);

        // Withdrawals should still work
        vm.prank(owner);
        vault.withdrawAll();

        // Verify all withdrawn
        uint256[] memory holdings = vault.holdings();
        for (uint8 i = 0; i < vault.assetCount(); i++) {
            assertEq(holdings[i], 0, "All assets withdrawn");
        }
    }

    // ============ INV-16: Holdings Match Balances ============

    function test_INV16_HoldingsMatchBalances() public {
        _depositDefaultPortfolio();

        uint256[] memory holdings = vault.holdings();
        for (uint8 i = 0; i < vault.assetCount(); i++) {
            address token = vault.assets(i);
            uint256 actualBalance = IERC20(token).balanceOf(address(vault));
            assertEq(holdings[i], actualBalance, "Holding must match balance");
        }
    }

    // ============ INV-17: Current Weights Sum to 100% ============

    function test_INV17_CurrentWeightsSum() public {
        _depositDefaultPortfolio();

        uint16[] memory weights = vault.allCurrentWeights();
        uint256 sum = 0;
        for (uint8 i = 0; i < weights.length; i++) {
            sum += weights[i];
        }
        assertEq(sum, 10000, "Current weights must sum to 10000");
    }

    function test_INV17_CurrentWeightsZeroWhenEmpty() public view {
        uint16[] memory weights = vault.allCurrentWeights();
        uint256 sum = 0;
        for (uint8 i = 0; i < weights.length; i++) {
            sum += weights[i];
        }
        // Empty vault should have all zeros
        assertEq(sum, 0, "Empty vault has zero weights");
    }

    // ============ INV-18: Portfolio Drift is Maximum Asset Drift ============

    function test_INV18_DriftIsMax() public {
        _depositDefaultPortfolio();

        // Change prices to create different drifts
        btcFeed.setPrice(120000e8);  // BTC +20% -> higher drift
        ethFeed.setPrice(3300e8);    // ETH +10%

        uint16 portfolioDrift = vault.portfolioDriftBps();
        uint16 maxFound = 0;

        for (uint8 i = 0; i < vault.assetCount(); i++) {
            uint16 drift = vault.assetDriftBps(i);
            if (drift > maxFound) {
                maxFound = drift;
            }
        }

        assertEq(portfolioDrift, maxFound, "Portfolio drift must be max of individual drifts");
    }

    // ============ INV-19: Drift Threshold Bounds ============

    function test_INV19_DriftThresholdBounds() public view {
        uint16 threshold = vault.driftThresholdBps();
        assertGe(threshold, 200, "Threshold >= 2%");
        assertLe(threshold, 2000, "Threshold <= 20%");
    }

    function test_INV19_RevertOnInvalidThreshold() public {
        // Too low
        vm.expectRevert(MeezanVaultV2.InvalidDriftThreshold.selector);
        _deployVault(defaultConfig, 100);  // 1%

        // Too high
        vm.expectRevert(MeezanVaultV2.InvalidDriftThreshold.selector);
        _deployVault(defaultConfig, 2500);  // 25%
    }

    // ============ Additional Unit Tests ============

    function test_Deployment() public view {
        assertEq(vault.owner(), owner);
        assertEq(vault.assetCount(), 4);
        assertEq(vault.driftThresholdBps(), 500);
        assertEq(vault.slippageBps(), 100);
        assertFalse(vault.autoRebalanceEnabled());
        assertEq(vault.executor(), address(0));
    }

    function test_AllAssets() public view {
        address[] memory assetList = vault.allAssets();
        assertEq(assetList.length, 4);
        assertEq(assetList[0], address(btc));
        assertEq(assetList[1], address(eth));
        assertEq(assetList[2], address(sol));
        assertEq(assetList[3], address(usdc));
    }

    function test_AllTargetWeights() public view {
        uint16[] memory weights = vault.allTargetWeights();
        assertEq(weights.length, 4);
        assertEq(weights[0], 4000);
        assertEq(weights[1], 3000);
        assertEq(weights[2], 1000);
        assertEq(weights[3], 2000);
    }

    function test_Deposit() public {
        vm.prank(owner);
        vault.deposit(0, 1e8);  // 1 BTC

        uint256[] memory holdings = vault.holdings();
        assertEq(holdings[0], 1e8);
    }

    function test_DepositRevertsForNonOwner() public {
        vm.prank(user);
        vm.expectRevert(MeezanVaultV2.OnlyOwner.selector);
        vault.deposit(0, 1e8);
    }

    function test_Withdraw() public {
        vm.startPrank(owner);
        vault.deposit(0, 2e8);  // 2 BTC
        vault.withdraw(0, 1e8);  // Withdraw 1 BTC
        vm.stopPrank();

        uint256[] memory holdings = vault.holdings();
        assertEq(holdings[0], 1e8);
    }

    function test_WithdrawAll() public {
        _depositDefaultPortfolio();

        uint256 btcBefore = btc.balanceOf(owner);
        uint256 ethBefore = eth.balanceOf(owner);

        vm.prank(owner);
        uint256[] memory amounts = vault.withdrawAll();

        assertEq(amounts.length, 4);
        assertEq(btc.balanceOf(owner), btcBefore + amounts[0]);
        assertEq(eth.balanceOf(owner), ethBefore + amounts[1]);

        // Verify vault is empty
        uint256[] memory holdings = vault.holdings();
        for (uint8 i = 0; i < vault.assetCount(); i++) {
            assertEq(holdings[i], 0);
        }
    }

    function test_TotalUsdValue() public {
        _depositDefaultPortfolio();

        uint256 total = vault.totalUsdValue();
        // 4 BTC @ $100K = $400K
        // 100 ETH @ $3K = $300K
        // 666 SOL @ $150 = ~$99.9K
        // 200K USDC = $200K
        // Total ~ $1M
        assertGt(total, 900000e18);  // At least $900K
        assertLt(total, 1100000e18); // At most $1.1M
    }

    function test_NeedsRebalance() public {
        _depositDefaultPortfolio();

        // Initially balanced
        assertFalse(vault.needsRebalance());

        // Create drift
        btcFeed.setPrice(150000e8);  // BTC +50%

        assertTrue(vault.needsRebalance());
    }

    function test_PreviewRebalance() public {
        _depositDefaultPortfolio();

        // Create drift
        btcFeed.setPrice(150000e8);

        (int256[] memory deltas, uint16 drift) = vault.previewRebalance();

        assertEq(deltas.length, 4);
        assertGt(drift, 0);

        // BTC should be overweight (positive delta)
        assertGt(deltas[0], 0, "BTC should be overweight");
    }

    function test_RebalanceEmitsIntent() public {
        _depositDefaultPortfolio();

        // Create drift
        btcFeed.setPrice(150000e8);

        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit MeezanVaultV2.RebalanceIntent(owner, 0, new int256[](0), 0);
        vault.rebalance();
    }

    function test_RescueToken() public {
        // Send random token to vault
        MockERC20 randomToken = new MockERC20("Random", "RND", 18);
        randomToken.mint(address(vault), 1000e18);

        vm.prank(owner);
        vault.rescueToken(address(randomToken));

        assertEq(randomToken.balanceOf(owner), 1000e18);
        assertEq(randomToken.balanceOf(address(vault)), 0);
    }

    function test_CannotRescueVaultToken() public {
        _depositDefaultPortfolio();

        vm.prank(owner);
        vm.expectRevert(MeezanVaultV2.CannotRescueVaultToken.selector);
        vault.rescueToken(address(btc));
    }

    function test_DuplicateAssetReverts() public {
        MeezanVaultV2.AssetConfig[] memory badConfig = new MeezanVaultV2.AssetConfig[](2);
        badConfig[0] = MeezanVaultV2.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 5000
        });
        badConfig[1] = MeezanVaultV2.AssetConfig({
            token: address(usdc),  // Duplicate!
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 5000
        });

        vm.expectRevert(MeezanVaultV2.DuplicateAsset.selector);
        _deployVault(badConfig, 500);
    }

    function test_InvalidAssetIndexReverts() public {
        vm.expectRevert(MeezanVaultV2.InvalidAssetIndex.selector);
        vault.assets(10);

        vm.expectRevert(MeezanVaultV2.InvalidAssetIndex.selector);
        vault.targetWeightBps(10);
    }

    function test_ZeroAddressReverts() public {
        MeezanVaultV2.AssetConfig[] memory badConfig = new MeezanVaultV2.AssetConfig[](2);
        badConfig[0] = MeezanVaultV2.AssetConfig({
            token: address(0),  // Zero address!
            priceFeed: address(btcFeed),
            poolFee: 500,
            targetWeightBps: 5000
        });
        badConfig[1] = MeezanVaultV2.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 5000
        });

        vm.expectRevert(MeezanVaultV2.ZeroAddress.selector);
        _deployVault(badConfig, 500);
    }

    function test_InvalidPoolFeeReverts() public {
        MeezanVaultV2.AssetConfig[] memory badConfig = new MeezanVaultV2.AssetConfig[](2);
        badConfig[0] = MeezanVaultV2.AssetConfig({
            token: address(btc),
            priceFeed: address(btcFeed),
            poolFee: 999,  // Invalid fee tier!
            targetWeightBps: 5000
        });
        badConfig[1] = MeezanVaultV2.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 5000
        });

        vm.expectRevert(MeezanVaultV2.InvalidPoolFee.selector);
        _deployVault(badConfig, 500);
    }

    function test_TwoAssetPortfolio() public {
        // Minimal 2-asset portfolio
        MeezanVaultV2.AssetConfig[] memory config = new MeezanVaultV2.AssetConfig[](2);
        config[0] = MeezanVaultV2.AssetConfig({
            token: address(btc),
            priceFeed: address(btcFeed),
            poolFee: 500,
            targetWeightBps: 8000  // 80%
        });
        config[1] = MeezanVaultV2.AssetConfig({
            token: address(usdc),
            priceFeed: address(usdcFeed),
            poolFee: 500,
            targetWeightBps: 2000  // 20%
        });

        MeezanVaultV2 twoAssetVault = _deployVault(config, 500);

        assertEq(twoAssetVault.assetCount(), 2);
        assertEq(twoAssetVault.stablecoinIndex(), 1);
    }

    function test_TenAssetPortfolio() public {
        // Maximum 10-asset portfolio
        MeezanVaultV2.AssetConfig[] memory config = new MeezanVaultV2.AssetConfig[](10);

        for (uint8 i = 0; i < 10; i++) {
            address token;
            address feed;

            if (i == 9) {
                // Last one is USDC (stablecoin)
                token = address(usdc);
                feed = address(usdcFeed);
            } else {
                // Create unique tokens
                token = address(new MockERC20(string.concat("Token", vm.toString(i)), "TKN", 18));
                feed = address(new MockPriceFeed(8, 100e8, "TKN / USD"));
            }

            config[i] = MeezanVaultV2.AssetConfig({
                token: token,
                priceFeed: feed,
                poolFee: 500,
                targetWeightBps: 1000  // 10% each
            });
        }

        MeezanVaultV2 tenAssetVault = _deployVault(config, 500);

        assertEq(tenAssetVault.assetCount(), 10);
        assertEq(tenAssetVault.stablecoinIndex(), 9);
    }
}
