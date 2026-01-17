// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MeezanVault} from "../src/MeezanVault.sol";
import {RiskLevel, getTargetAllocations} from "../src/RiskPresets.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceFeed} from "./mocks/MockPriceFeed.sol";

/**
 * @title MeezanVaultTest
 * @notice Test suite for MeezanVault core functionality
 */
contract MeezanVaultTest is Test {
    MeezanVault public vault;
    MockERC20 public tokenA; // WBTC mock (8 decimals)
    MockERC20 public tokenB; // USDC mock (6 decimals)
    MockPriceFeed public priceFeedA; // BTC/USD
    MockPriceFeed public priceFeedB; // USDC/USD

    address public owner = address(this);
    address public attacker = address(0xBEEF);
    address public executorAddr = address(0xE1E1);

    // BTC at $40,000, USDC at $1 (8 decimals for Chainlink feeds)
    int256 constant BTC_PRICE = 40_000e8;
    int256 constant USDC_PRICE = 1e8;

    // Initial balances in native token decimals
    uint256 constant INITIAL_WBTC = 10e8; // 10 WBTC
    uint256 constant INITIAL_USDC = 400_000e6; // 400,000 USDC

    function setUp() public {
        // Deploy mock tokens with correct decimals
        tokenA = new MockERC20("Wrapped Bitcoin", "WBTC", 8);
        tokenB = new MockERC20("USD Coin", "USDC", 6);

        // Deploy mock price feeds (8 decimals like Chainlink)
        priceFeedA = new MockPriceFeed(8, BTC_PRICE, "BTC/USD");
        priceFeedB = new MockPriceFeed(8, USDC_PRICE, "USDC/USD");

        // Deploy vault with Balanced risk level (50/50)
        vault = new MeezanVault(
            address(tokenA), address(tokenB), address(priceFeedA), address(priceFeedB), RiskLevel.Balanced
        );

        // Mint tokens to owner
        tokenA.mint(owner, INITIAL_WBTC);
        tokenB.mint(owner, INITIAL_USDC);

        // Approve vault to spend tokens
        tokenA.approve(address(vault), type(uint256).max);
        tokenB.approve(address(vault), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helper to create vault with specific risk level
    // ─────────────────────────────────────────────────────────────────────

    function _createVault(RiskLevel level) internal returns (MeezanVault) {
        return new MeezanVault(address(tokenA), address(tokenB), address(priceFeedA), address(priceFeedB), level);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Risk Presets Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_VeryConservativeAllocations() public pure {
        (uint16 pctA, uint16 pctB) = getTargetAllocations(RiskLevel.VeryConservative);
        assertEq(pctA, 1000, "VeryConservative: pctA should be 1000");
        assertEq(pctB, 9000, "VeryConservative: pctB should be 9000");
        assertEq(pctA + pctB, 10000, "Allocations must sum to 10000");
    }

    function test_ConservativeAllocations() public pure {
        (uint16 pctA, uint16 pctB) = getTargetAllocations(RiskLevel.Conservative);
        assertEq(pctA, 2500, "Conservative: pctA should be 2500");
        assertEq(pctB, 7500, "Conservative: pctB should be 7500");
        assertEq(pctA + pctB, 10000, "Allocations must sum to 10000");
    }

    function test_BalancedAllocations() public pure {
        (uint16 pctA, uint16 pctB) = getTargetAllocations(RiskLevel.Balanced);
        assertEq(pctA, 5000, "Balanced: pctA should be 5000");
        assertEq(pctB, 5000, "Balanced: pctB should be 5000");
        assertEq(pctA + pctB, 10000, "Allocations must sum to 10000");
    }

    function test_GrowthAllocations() public pure {
        (uint16 pctA, uint16 pctB) = getTargetAllocations(RiskLevel.Growth);
        assertEq(pctA, 7500, "Growth: pctA should be 7500");
        assertEq(pctB, 2500, "Growth: pctB should be 2500");
        assertEq(pctA + pctB, 10000, "Allocations must sum to 10000");
    }

    function test_AggressiveAllocations() public pure {
        (uint16 pctA, uint16 pctB) = getTargetAllocations(RiskLevel.Aggressive);
        assertEq(pctA, 9000, "Aggressive: pctA should be 9000");
        assertEq(pctB, 1000, "Aggressive: pctB should be 1000");
        assertEq(pctA + pctB, 10000, "Allocations must sum to 10000");
    }

    function test_AllRiskLevelsSumTo10000() public pure {
        for (uint8 i = 0; i <= uint8(RiskLevel.Aggressive); i++) {
            (uint16 pctA, uint16 pctB) = getTargetAllocations(RiskLevel(i));
            assertEq(pctA + pctB, 10000, "All risk levels must sum to 10000");
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Constructor Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_OwnerSetCorrectly() public view {
        assertEq(vault.owner(), owner, "Owner should be deployer");
    }

    function test_TokensSetCorrectly() public view {
        assertEq(address(vault.tokenA()), address(tokenA), "Token A mismatch");
        assertEq(address(vault.tokenB()), address(tokenB), "Token B mismatch");
    }

    function test_PriceFeedsSetCorrectly() public view {
        assertEq(address(vault.priceFeedA()), address(priceFeedA), "Price feed A mismatch");
        assertEq(address(vault.priceFeedB()), address(priceFeedB), "Price feed B mismatch");
    }

    function test_TokenDecimalsStoredCorrectly() public view {
        assertEq(vault.tokenDecimalsA(), 8, "WBTC should have 8 decimals");
        assertEq(vault.tokenDecimalsB(), 6, "USDC should have 6 decimals");
    }

    function test_FeedDecimalsStoredCorrectly() public view {
        assertEq(vault.feedDecimalsA(), 8, "BTC/USD feed should have 8 decimals");
        assertEq(vault.feedDecimalsB(), 8, "USDC/USD feed should have 8 decimals");
    }

    function test_RiskLevelSetCorrectly() public view {
        assertEq(uint8(vault.riskLevel()), uint8(RiskLevel.Balanced), "Risk level should be Balanced");
    }

    function test_AllocationsMatchRiskLevel() public view {
        (uint16 pctA, uint16 pctB) = vault.targetAllocations();
        (uint16 expectedA, uint16 expectedB) = getTargetAllocations(RiskLevel.Balanced);
        assertEq(pctA, expectedA, "Target pct A should match Balanced preset");
        assertEq(pctB, expectedB, "Target pct B should match Balanced preset");
    }

    function test_VaultWithVeryConservative() public {
        MeezanVault v = _createVault(RiskLevel.VeryConservative);
        assertEq(uint8(v.riskLevel()), uint8(RiskLevel.VeryConservative));
        (uint16 pctA, uint16 pctB) = v.targetAllocations();
        assertEq(pctA, 1000);
        assertEq(pctB, 9000);
    }

    function test_VaultWithConservative() public {
        MeezanVault v = _createVault(RiskLevel.Conservative);
        assertEq(uint8(v.riskLevel()), uint8(RiskLevel.Conservative));
        (uint16 pctA, uint16 pctB) = v.targetAllocations();
        assertEq(pctA, 2500);
        assertEq(pctB, 7500);
    }

    function test_VaultWithGrowth() public {
        MeezanVault v = _createVault(RiskLevel.Growth);
        assertEq(uint8(v.riskLevel()), uint8(RiskLevel.Growth));
        (uint16 pctA, uint16 pctB) = v.targetAllocations();
        assertEq(pctA, 7500);
        assertEq(pctB, 2500);
    }

    function test_VaultWithAggressive() public {
        MeezanVault v = _createVault(RiskLevel.Aggressive);
        assertEq(uint8(v.riskLevel()), uint8(RiskLevel.Aggressive));
        (uint16 pctA, uint16 pctB) = v.targetAllocations();
        assertEq(pctA, 9000);
        assertEq(pctB, 1000);
    }

    function test_RevertZeroAddressTokenA() public {
        vm.expectRevert(MeezanVault.ZeroAddress.selector);
        new MeezanVault(address(0), address(tokenB), address(priceFeedA), address(priceFeedB), RiskLevel.Balanced);
    }

    function test_RevertZeroAddressTokenB() public {
        vm.expectRevert(MeezanVault.ZeroAddress.selector);
        new MeezanVault(address(tokenA), address(0), address(priceFeedA), address(priceFeedB), RiskLevel.Balanced);
    }

    function test_RevertZeroAddressPriceFeedA() public {
        vm.expectRevert(MeezanVault.ZeroAddress.selector);
        new MeezanVault(address(tokenA), address(tokenB), address(0), address(priceFeedB), RiskLevel.Balanced);
    }

    function test_RevertZeroAddressPriceFeedB() public {
        vm.expectRevert(MeezanVault.ZeroAddress.selector);
        new MeezanVault(address(tokenA), address(tokenB), address(priceFeedA), address(0), RiskLevel.Balanced);
    }

    function test_RevertIdenticalTokens() public {
        vm.expectRevert(MeezanVault.IdenticalTokens.selector);
        new MeezanVault(address(tokenA), address(tokenA), address(priceFeedA), address(priceFeedB), RiskLevel.Balanced);
    }

    function test_RevertTokenDecimalsOver18() public {
        MockERC20 badToken = new MockERC20("Bad Token", "BAD", 19);
        vm.expectRevert(MeezanVault.InvalidTokenDecimals.selector);
        new MeezanVault(
            address(badToken), address(tokenB), address(priceFeedA), address(priceFeedB), RiskLevel.Balanced
        );
    }

    function test_RevertTokenBDecimalsOver18() public {
        MockERC20 badToken = new MockERC20("Bad Token", "BAD", 20);
        vm.expectRevert(MeezanVault.InvalidTokenDecimals.selector);
        new MeezanVault(
            address(tokenA), address(badToken), address(priceFeedA), address(priceFeedB), RiskLevel.Balanced
        );
    }

    function test_RevertFeedDecimalsOver18() public {
        MockPriceFeed badFeed = new MockPriceFeed(19, 1e19, "BAD/USD");
        vm.expectRevert(MeezanVault.InvalidFeedDecimals.selector);
        new MeezanVault(address(tokenA), address(tokenB), address(badFeed), address(priceFeedB), RiskLevel.Balanced);
    }

    function test_RevertFeedBDecimalsOver18() public {
        MockPriceFeed badFeed = new MockPriceFeed(20, 1e20, "BAD/USD");
        vm.expectRevert(MeezanVault.InvalidFeedDecimals.selector);
        new MeezanVault(address(tokenA), address(tokenB), address(priceFeedA), address(badFeed), RiskLevel.Balanced);
    }

    function test_ConstantsSetCorrectly() public view {
        assertEq(vault.DEFAULT_DRIFT_BPS(), 500, "DEFAULT_DRIFT_BPS should be 500");
        assertEq(vault.COOLDOWN_SECONDS(), 43200, "COOLDOWN_SECONDS should be 43200");
        assertEq(vault.MAX_PRICE_STALENESS(), 3600, "MAX_PRICE_STALENESS should be 3600");
    }

    function test_InitialStateDefaults() public view {
        assertEq(vault.lastRebalanceAt(), 0, "lastRebalanceAt should be 0");
        assertEq(vault.autoRebalanceEnabled(), false, "autoRebalanceEnabled should be false");
        assertEq(vault.executor(), address(0), "executor should be address(0)");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Deposit Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_DepositTokenA() public {
        uint256 depositAmount = 1e8; // 1 WBTC

        vault.depositTokenA(depositAmount);

        (uint256 balA, uint256 balB) = vault.holdings();
        assertEq(balA, depositAmount, "Balance A should match deposit");
        assertEq(balB, 0, "Balance B should be zero");
    }

    function test_DepositTokenB() public {
        uint256 depositAmount = 10_000e6; // 10,000 USDC

        vault.depositTokenB(depositAmount);

        (uint256 balA, uint256 balB) = vault.holdings();
        assertEq(balA, 0, "Balance A should be zero");
        assertEq(balB, depositAmount, "Balance B should match deposit");
    }

    function test_DepositBothTokens() public {
        vault.depositTokenA(1e8);
        vault.depositTokenB(10_000e6);

        (uint256 balA, uint256 balB) = vault.holdings();
        assertEq(balA, 1e8, "Balance A mismatch");
        assertEq(balB, 10_000e6, "Balance B mismatch");
    }

    function test_RevertDepositZeroAmount() public {
        vm.expectRevert(MeezanVault.ZeroAmount.selector);
        vault.depositTokenA(0);

        vm.expectRevert(MeezanVault.ZeroAmount.selector);
        vault.depositTokenB(0);
    }

    function test_RevertDepositNotOwner() public {
        vm.prank(attacker);
        vm.expectRevert(MeezanVault.OnlyOwner.selector);
        vault.depositTokenA(1e8);

        vm.prank(attacker);
        vm.expectRevert(MeezanVault.OnlyOwner.selector);
        vault.depositTokenB(10_000e6);
    }

    function test_DepositEmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit MeezanVault.Deposit(owner, address(tokenA), 1e8);
        vault.depositTokenA(1e8);

        vm.expectEmit(true, true, false, true);
        emit MeezanVault.Deposit(owner, address(tokenB), 10_000e6);
        vault.depositTokenB(10_000e6);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Withdraw Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_WithdrawTokenA() public {
        vault.depositTokenA(1e8);

        uint256 balanceBefore = tokenA.balanceOf(owner);
        vault.withdrawTokenA(0.4e8);
        uint256 balanceAfter = tokenA.balanceOf(owner);

        assertEq(balanceAfter - balanceBefore, 0.4e8, "Should receive 0.4 WBTC");

        (uint256 balA,) = vault.holdings();
        assertEq(balA, 0.6e8, "Vault should have 0.6 WBTC remaining");
    }

    function test_WithdrawTokenB() public {
        vault.depositTokenB(10_000e6);

        uint256 balanceBefore = tokenB.balanceOf(owner);
        vault.withdrawTokenB(3_000e6);
        uint256 balanceAfter = tokenB.balanceOf(owner);

        assertEq(balanceAfter - balanceBefore, 3_000e6, "Should receive 3,000 USDC");

        (, uint256 balB) = vault.holdings();
        assertEq(balB, 7_000e6, "Vault should have 7,000 USDC remaining");
    }

    function test_RevertWithdrawZeroAmount() public {
        vault.depositTokenA(1e8);

        vm.expectRevert(MeezanVault.ZeroAmount.selector);
        vault.withdrawTokenA(0);

        vm.expectRevert(MeezanVault.ZeroAmount.selector);
        vault.withdrawTokenB(0);
    }

    function test_RevertWithdrawNotOwner() public {
        vault.depositTokenA(1e8);
        vault.depositTokenB(10_000e6);

        vm.prank(attacker);
        vm.expectRevert(MeezanVault.OnlyOwner.selector);
        vault.withdrawTokenA(0.5e8);

        vm.prank(attacker);
        vm.expectRevert(MeezanVault.OnlyOwner.selector);
        vault.withdrawTokenB(5_000e6);
    }

    function test_RevertWithdrawMoreThanBalance() public {
        vault.depositTokenA(1e8);

        vm.expectRevert(MeezanVault.InsufficientBalance.selector);
        vault.withdrawTokenA(1.1e8);
    }

    function test_WithdrawEmitsEvent() public {
        vault.depositTokenA(1e8);
        vault.depositTokenB(10_000e6);

        vm.expectEmit(true, true, false, true);
        emit MeezanVault.Withdraw(owner, address(tokenA), 0.5e8);
        vault.withdrawTokenA(0.5e8);

        vm.expectEmit(true, true, false, true);
        emit MeezanVault.Withdraw(owner, address(tokenB), 5_000e6);
        vault.withdrawTokenB(5_000e6);
    }

    // ─────────────────────────────────────────────────────────────────────
    // WithdrawAll Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_WithdrawAll() public {
        vault.depositTokenA(1e8);
        vault.depositTokenB(10_000e6);

        uint256 balABefore = tokenA.balanceOf(owner);
        uint256 balBBefore = tokenB.balanceOf(owner);

        (uint256 amountA, uint256 amountB) = vault.withdrawAll();

        assertEq(amountA, 1e8, "Should return amount A");
        assertEq(amountB, 10_000e6, "Should return amount B");

        assertEq(tokenA.balanceOf(owner) - balABefore, 1e8, "Owner should receive A");
        assertEq(tokenB.balanceOf(owner) - balBBefore, 10_000e6, "Owner should receive B");

        (uint256 balA, uint256 balB) = vault.holdings();
        assertEq(balA, 0, "Vault A balance should be zero");
        assertEq(balB, 0, "Vault B balance should be zero");
    }

    function test_WithdrawAllEmpty() public {
        (uint256 amountA, uint256 amountB) = vault.withdrawAll();

        assertEq(amountA, 0, "Should return 0 for A");
        assertEq(amountB, 0, "Should return 0 for B");
    }

    function test_WithdrawAllPartial() public {
        vault.depositTokenA(1e8);

        (uint256 amountA, uint256 amountB) = vault.withdrawAll();

        assertEq(amountA, 1e8, "Should return 1 WBTC");
        assertEq(amountB, 0, "Should return 0 for B");
    }

    function test_RevertWithdrawAllNotOwner() public {
        vault.depositTokenA(1e8);

        vm.prank(attacker);
        vm.expectRevert(MeezanVault.OnlyOwner.selector);
        vault.withdrawAll();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Executor/AutoRebalance Configuration Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_SetExecutor() public {
        vm.expectEmit(true, true, false, false);
        emit MeezanVault.ExecutorSet(address(0), executorAddr);
        vault.setExecutor(executorAddr);

        assertEq(vault.executor(), executorAddr, "Executor should be set");
    }

    function test_SetExecutorToZero() public {
        vault.setExecutor(executorAddr);
        vault.setExecutor(address(0));

        assertEq(vault.executor(), address(0), "Executor should be cleared");
    }

    function test_RevertSetExecutorNotOwner() public {
        vm.prank(attacker);
        vm.expectRevert(MeezanVault.OnlyOwner.selector);
        vault.setExecutor(executorAddr);
    }

    function test_SetAutoRebalanceEnabled() public {
        vm.expectEmit(false, false, false, true);
        emit MeezanVault.AutoRebalanceToggled(true);
        vault.setAutoRebalanceEnabled(true);

        assertEq(vault.autoRebalanceEnabled(), true, "Auto rebalance should be enabled");

        vault.setAutoRebalanceEnabled(false);
        assertEq(vault.autoRebalanceEnabled(), false, "Auto rebalance should be disabled");
    }

    function test_RevertSetAutoRebalanceNotOwner() public {
        vm.prank(attacker);
        vm.expectRevert(MeezanVault.OnlyOwner.selector);
        vault.setAutoRebalanceEnabled(true);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Stale Price Protection Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_RevertOnStalePrice() public {
        // Warp to a reasonable timestamp first
        vm.warp(100_000);
        priceFeedA.setPrice(BTC_PRICE); // Refresh price at current time
        priceFeedB.setPrice(USDC_PRICE);

        vault.depositTokenA(0.1e8);
        vault.depositTokenB(4_000e6);

        // Set price feed to be stale (older than MAX_PRICE_STALENESS)
        priceFeedA.setUpdatedAt(block.timestamp - vault.MAX_PRICE_STALENESS() - 1);

        vm.expectRevert(MeezanVault.StalePrice.selector);
        vault.currentAllocationsBps();
    }

    function test_RevertOnStalePriceRebalance() public {
        // Warp to a reasonable timestamp first
        vm.warp(100_000);
        priceFeedA.setPrice(BTC_PRICE);
        priceFeedB.setPrice(USDC_PRICE);

        vault.depositTokenA(0.12e8);
        vault.depositTokenB(3_200e6);

        // Set price feed to be stale
        priceFeedA.setUpdatedAt(block.timestamp - vault.MAX_PRICE_STALENESS() - 1);

        vm.expectRevert(MeezanVault.StalePrice.selector);
        vault.rebalance();
    }

    function test_RevertOnUpdatedAtZero() public {
        vault.depositTokenA(0.1e8);
        vault.depositTokenB(4_000e6);

        priceFeedA.setRoundData(1, BTC_PRICE, 0, 1);

        vm.expectRevert(MeezanVault.StalePrice.selector);
        vault.currentAllocationsBps();
    }

    function test_RevertOnIncompleteRound() public {
        vault.depositTokenA(0.1e8);
        vault.depositTokenB(4_000e6);

        // answeredInRound < roundId indicates incomplete round
        priceFeedA.setRoundData(5, BTC_PRICE, block.timestamp, 4);

        vm.expectRevert(MeezanVault.IncompleteRound.selector);
        vault.currentAllocationsBps();
    }

    function test_RevertOnNegativePrice() public {
        vault.depositTokenA(0.1e8);
        vault.depositTokenB(4_000e6);

        priceFeedA.setRoundData(1, -1, block.timestamp, 1);

        vm.expectRevert(MeezanVault.InvalidPrice.selector);
        vault.currentAllocationsBps();
    }

    function test_RevertOnZeroPrice() public {
        vault.depositTokenA(0.1e8);
        vault.depositTokenB(4_000e6);

        priceFeedA.setRoundData(1, 0, block.timestamp, 1);

        vm.expectRevert(MeezanVault.InvalidPrice.selector);
        vault.currentAllocationsBps();
    }

    function test_AcceptsFreshPrice() public {
        vault.depositTokenA(0.1e8);
        vault.depositTokenB(4_000e6);

        // Price is fresh (just updated)
        priceFeedA.setPrice(BTC_PRICE);

        (uint16 pctA, uint16 pctB) = vault.currentAllocationsBps();
        assertEq(pctA, 5000, "Should calculate allocation with fresh price");
        assertEq(pctB, 5000, "Should calculate allocation with fresh price");
    }

    function test_AcceptsPriceAtMaxStaleness() public {
        // Warp to a reasonable timestamp first
        vm.warp(100_000);
        priceFeedA.setPrice(BTC_PRICE);
        priceFeedB.setPrice(USDC_PRICE);

        vault.depositTokenA(0.1e8);
        vault.depositTokenB(4_000e6);

        // Price is exactly at max staleness (should still work)
        priceFeedA.setUpdatedAt(block.timestamp - vault.MAX_PRICE_STALENESS());

        (uint16 pctA, uint16 pctB) = vault.currentAllocationsBps();
        assertEq(pctA, 5000, "Should accept price at max staleness");
        assertEq(pctB, 5000);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Value-Based Allocation Tests (WBTC/USDC decimal mismatch)
    // ─────────────────────────────────────────────────────────────────────

    function test_ValueBasedAllocation5050() public {
        // 0.1 WBTC @ $40,000 = $4,000
        // 4,000 USDC @ $1 = $4,000
        // Total = $8,000 => should be 50/50
        vault.depositTokenA(0.1e8); // 0.1 WBTC
        vault.depositTokenB(4_000e6); // 4,000 USDC

        (uint16 pctA, uint16 pctB) = vault.currentAllocationsBps();
        assertEq(pctA, 5000, "Should be 50% WBTC");
        assertEq(pctB, 5000, "Should be 50% USDC");
    }

    function test_ValueBasedAllocation7525() public {
        // 0.15 WBTC @ $40,000 = $6,000 (75%)
        // 2,000 USDC @ $1 = $2,000 (25%)
        // Total = $8,000
        vault.depositTokenA(0.15e8); // 0.15 WBTC
        vault.depositTokenB(2_000e6); // 2,000 USDC

        (uint16 pctA, uint16 pctB) = vault.currentAllocationsBps();
        assertEq(pctA, 7500, "Should be 75% WBTC");
        assertEq(pctB, 2500, "Should be 25% USDC");
    }

    function test_ValueBasedAllocation2575() public {
        // 0.05 WBTC @ $40,000 = $2,000 (25%)
        // 6,000 USDC @ $1 = $6,000 (75%)
        // Total = $8,000
        vault.depositTokenA(0.05e8); // 0.05 WBTC
        vault.depositTokenB(6_000e6); // 6,000 USDC

        (uint16 pctA, uint16 pctB) = vault.currentAllocationsBps();
        assertEq(pctA, 2500, "Should be 25% WBTC");
        assertEq(pctB, 7500, "Should be 75% USDC");
    }

    function test_UsdValuesCorrect() public {
        // 1 WBTC @ $40,000 = $40,000
        // 10,000 USDC @ $1 = $10,000
        vault.depositTokenA(1e8);
        vault.depositTokenB(10_000e6);

        (uint256 valueA, uint256 valueB) = vault.getUsdValues();
        assertEq(valueA, 40_000e18, "WBTC value should be $40,000");
        assertEq(valueB, 10_000e18, "USDC value should be $10,000");
    }

    function test_CurrentAllocationsEmpty() public view {
        (uint16 pctA, uint16 pctB) = vault.currentAllocationsBps();
        assertEq(pctA, 0, "Empty vault pctA should be 0");
        assertEq(pctB, 0, "Empty vault pctB should be 0");
    }

    function test_DriftBpsZeroWhenEmpty() public view {
        uint16 drift = vault.driftBps();
        // Empty vault: currentPctA = 0, targetPctA = 5000, drift = 5000
        assertEq(drift, 5000, "Empty vault drift should be 5000 (target is 50%)");
    }

    function test_DriftBpsZeroWhenBalanced() public {
        // Balanced vault matches target (50/50 by value)
        vault.depositTokenA(0.1e8); // $4,000
        vault.depositTokenB(4_000e6); // $4,000

        uint16 drift = vault.driftBps();
        assertEq(drift, 0, "Balanced vault should have 0 drift");
    }

    function test_DriftBpsWhenOverAllocatedToA() public {
        // 60% A / 40% B by value
        // 0.12 WBTC @ $40k = $4,800 (60%)
        // 3,200 USDC = $3,200 (40%)
        vault.depositTokenA(0.12e8);
        vault.depositTokenB(3_200e6);

        uint16 drift = vault.driftBps();
        assertEq(drift, 1000, "60/40 should have drift of 1000 bps (10%)");
    }

    function test_DriftBpsWhenUnderAllocatedToA() public {
        // 40% A / 60% B by value
        // 0.08 WBTC @ $40k = $3,200 (40%)
        // 4,800 USDC = $4,800 (60%)
        vault.depositTokenA(0.08e8);
        vault.depositTokenB(4_800e6);

        uint16 drift = vault.driftBps();
        assertEq(drift, 1000, "40/60 should have drift of 1000 bps (10%)");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Rebalance Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_RebalanceRevertsOnEmptyVault() public {
        vm.expectRevert(MeezanVault.EmptyVault.selector);
        vault.rebalance();
    }

    function test_RebalanceRevertsIfDriftTooLow() public {
        // 50/50 deposit matches target exactly
        vault.depositTokenA(0.1e8); // $4,000
        vault.depositTokenB(4_000e6); // $4,000

        vm.expectRevert(MeezanVault.DriftTooLow.selector);
        vault.rebalance();
    }

    function test_RebalanceRevertsIfDriftJustBelowThreshold() public {
        // 54/46 by value = 400 bps drift (below 500 threshold)
        // 0.108 WBTC @ $40k = $4,320 (54%)
        // 3,680 USDC = $3,680 (46%)
        vault.depositTokenA(0.108e8);
        vault.depositTokenB(3_680e6);

        (uint16 pctA,) = vault.currentAllocationsBps();
        assertEq(pctA, 5400, "Should be 54%");
        assertEq(vault.driftBps(), 400, "Should be 400 bps drift");

        vm.expectRevert(MeezanVault.DriftTooLow.selector);
        vault.rebalance();
    }

    function test_RebalanceSucceedsWhenDriftMeetsThreshold() public {
        // 55/45 by value = 500 bps drift
        // 0.11 WBTC @ $40k = $4,400 (55%)
        // 3,600 USDC = $3,600 (45%)
        vault.depositTokenA(0.11e8);
        vault.depositTokenB(3_600e6);

        vault.rebalance();

        assertEq(vault.lastRebalanceAt(), block.timestamp, "lastRebalanceAt should be updated");
    }

    function test_RebalanceExecutorEnforcesCooldown() public {
        // 60/40 by value
        vault.depositTokenA(0.12e8);
        vault.depositTokenB(3_200e6);

        vault.setExecutor(executorAddr);
        vault.setAutoRebalanceEnabled(true);

        // First rebalance by executor succeeds
        vm.prank(executorAddr);
        vault.rebalance();

        // Immediate second rebalance by executor fails
        vm.prank(executorAddr);
        vm.expectRevert(MeezanVault.CooldownNotElapsed.selector);
        vault.rebalance();

        // After cooldown, executor can rebalance again
        vm.warp(block.timestamp + vault.COOLDOWN_SECONDS());
        // Refresh price feeds after time warp
        priceFeedA.setPrice(BTC_PRICE);
        priceFeedB.setPrice(USDC_PRICE);
        vm.prank(executorAddr);
        vault.rebalance();
    }

    function test_RebalanceOwnerBypassesCooldown() public {
        // 60/40 by value
        vault.depositTokenA(0.12e8);
        vault.depositTokenB(3_200e6);

        // First rebalance
        vault.rebalance();

        // Owner can immediately rebalance again (bypasses cooldown)
        vault.rebalance();

        // And again
        vault.rebalance();
    }

    function test_RebalanceOwnerCannotGriefExecutor() public {
        // Setup: executor should be able to call after cooldown even if owner called recently
        vault.depositTokenA(0.12e8);
        vault.depositTokenB(3_200e6);

        vault.setExecutor(executorAddr);
        vault.setAutoRebalanceEnabled(true);

        // Owner rebalances
        vault.rebalance();

        // Owner rebalances again immediately (bypassing cooldown)
        vault.rebalance();

        // Executor still blocked by cooldown (from owner's rebalance)
        vm.prank(executorAddr);
        vm.expectRevert(MeezanVault.CooldownNotElapsed.selector);
        vault.rebalance();

        // After cooldown from last rebalance, executor can call
        vm.warp(block.timestamp + vault.COOLDOWN_SECONDS());
        // Refresh price feeds after time warp
        priceFeedA.setPrice(BTC_PRICE);
        priceFeedB.setPrice(USDC_PRICE);
        vm.prank(executorAddr);
        vault.rebalance();
    }

    function test_RebalanceEmitsEventSellA() public {
        // 60% A / 40% B => over-allocated to A, should sell A
        vault.depositTokenA(0.12e8);
        vault.depositTokenB(3_200e6);

        vm.expectEmit(true, true, true, true);
        emit MeezanVault.RebalancePlanned(
            owner,
            address(tokenA), // sellToken
            address(tokenB), // buyToken
            1000, // driftBps
            6000, // currentPctA
            5000, // targetPctA
            uint64(block.timestamp)
        );

        vault.rebalance();
    }

    function test_RebalanceEmitsEventSellB() public {
        // 40% A / 60% B => under-allocated to A, should sell B
        vault.depositTokenA(0.08e8);
        vault.depositTokenB(4_800e6);

        vm.expectEmit(true, true, true, true);
        emit MeezanVault.RebalancePlanned(
            owner,
            address(tokenB), // sellToken
            address(tokenA), // buyToken
            1000, // driftBps
            4000, // currentPctA
            5000, // targetPctA
            uint64(block.timestamp)
        );

        vault.rebalance();
    }

    function test_RebalanceOwnerCanAlwaysCall() public {
        vault.depositTokenA(0.12e8);
        vault.depositTokenB(3_200e6);

        // Owner can call even without executor or autoRebalance enabled
        vault.rebalance();

        assertGt(vault.lastRebalanceAt(), 0, "Rebalance should have occurred");
    }

    function test_RebalanceExecutorCannotCallWhenNotEnabled() public {
        vault.depositTokenA(0.12e8);
        vault.depositTokenB(3_200e6);

        vault.setExecutor(executorAddr);
        // autoRebalanceEnabled is still false

        vm.prank(executorAddr);
        vm.expectRevert(MeezanVault.OnlyOwnerOrExecutor.selector);
        vault.rebalance();
    }

    function test_RebalanceExecutorCannotCallWhenNotSet() public {
        vault.depositTokenA(0.12e8);
        vault.depositTokenB(3_200e6);

        vault.setAutoRebalanceEnabled(true);
        // executor is still address(0)

        vm.prank(executorAddr);
        vm.expectRevert(MeezanVault.OnlyOwnerOrExecutor.selector);
        vault.rebalance();
    }

    function test_RebalanceExecutorCanCallWhenEnabledAndSet() public {
        vault.depositTokenA(0.12e8);
        vault.depositTokenB(3_200e6);

        vault.setExecutor(executorAddr);
        vault.setAutoRebalanceEnabled(true);

        vm.prank(executorAddr);
        vault.rebalance();

        assertGt(vault.lastRebalanceAt(), 0, "Rebalance should have occurred");
    }

    function test_RebalanceRandomAddressCannotCall() public {
        vault.depositTokenA(0.12e8);
        vault.depositTokenB(3_200e6);

        vault.setExecutor(executorAddr);
        vault.setAutoRebalanceEnabled(true);

        vm.prank(attacker);
        vm.expectRevert(MeezanVault.OnlyOwnerOrExecutor.selector);
        vault.rebalance();
    }

    // ─────────────────────────────────────────────────────────────────────
    // View Function Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_Holdings() public {
        (uint256 balA, uint256 balB) = vault.holdings();
        assertEq(balA, 0, "Initial balance A should be 0");
        assertEq(balB, 0, "Initial balance B should be 0");

        vault.depositTokenA(0.5e8);
        vault.depositTokenB(7_500e6);

        (balA, balB) = vault.holdings();
        assertEq(balA, 0.5e8, "Balance A after deposit");
        assertEq(balB, 7_500e6, "Balance B after deposit");
    }

    function test_HoldingsReflectsDirectTransfer() public {
        // Direct transfer (not via deposit) should still be reflected
        tokenA.transfer(address(vault), 0.5e8);

        (uint256 balA,) = vault.holdings();
        assertEq(balA, 0.5e8, "Holdings should reflect direct transfer");
    }

    function test_TargetAllocations() public view {
        (uint16 pctA, uint16 pctB) = vault.targetAllocations();
        assertEq(pctA + pctB, 10000, "Allocations should sum to 10000");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Fuzz Tests
    // ─────────────────────────────────────────────────────────────────────

    function testFuzz_DepositAndWithdraw(uint256 amountA, uint256 amountB) public {
        // Bound to reasonable amounts (up to initial balances)
        amountA = bound(amountA, 1, INITIAL_WBTC);
        amountB = bound(amountB, 1, INITIAL_USDC);

        vault.depositTokenA(amountA);
        vault.depositTokenB(amountB);

        (uint256 balA, uint256 balB) = vault.holdings();
        assertEq(balA, amountA);
        assertEq(balB, amountB);

        vault.withdrawAll();

        (balA, balB) = vault.holdings();
        assertEq(balA, 0);
        assertEq(balB, 0);
    }

    function testFuzz_VaultWithAnyRiskLevel(uint8 levelRaw) public {
        // Bound to valid risk levels (0-4)
        uint8 level = uint8(bound(levelRaw, 0, 4));

        MeezanVault v = _createVault(RiskLevel(level));

        (uint16 pctA, uint16 pctB) = v.targetAllocations();
        assertEq(pctA + pctB, 10000, "All risk levels must sum to 10000");
        assertEq(uint8(v.riskLevel()), level, "Risk level should be stored correctly");
    }

    function testFuzz_WithdrawCannotExceedBalance(uint256 depositAmt, uint256 withdrawAmt) public {
        depositAmt = bound(depositAmt, 1, INITIAL_WBTC);
        withdrawAmt = bound(withdrawAmt, depositAmt + 1, type(uint256).max);

        vault.depositTokenA(depositAmt);

        vm.expectRevert(MeezanVault.InsufficientBalance.selector);
        vault.withdrawTokenA(withdrawAmt);
    }

    function testFuzz_CurrentAllocationsSumTo10000(uint256 amountA, uint256 amountB) public {
        // At least some value in each token
        amountA = bound(amountA, 0.001e8, INITIAL_WBTC);
        amountB = bound(amountB, 100e6, INITIAL_USDC);

        vault.depositTokenA(amountA);
        vault.depositTokenB(amountB);

        (uint16 pctA, uint16 pctB) = vault.currentAllocationsBps();
        assertEq(pctA + pctB, 10000, "Current allocations should sum to 10000");
    }
}
