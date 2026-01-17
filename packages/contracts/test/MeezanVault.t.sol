// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MeezanVault} from "../src/MeezanVault.sol";
import {RiskLevel, getTargetAllocations} from "../src/RiskPresets.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/**
 * @title MeezanVaultTest
 * @notice Test suite for MeezanVault core functionality
 */
contract MeezanVaultTest is Test {
    MeezanVault public vault;
    MockERC20 public tokenA; // WBTC mock
    MockERC20 public tokenB; // USDC mock

    address public owner = address(this);
    address public attacker = address(0xBEEF);
    address public executorAddr = address(0xE1E1);

    uint256 constant INITIAL_BALANCE = 1000 ether;

    function setUp() public {
        // Deploy mock tokens (same decimals for simpler allocation math)
        tokenA = new MockERC20("Wrapped Bitcoin", "WBTC", 18);
        tokenB = new MockERC20("USD Coin", "USDC", 18);

        // Deploy vault with Balanced risk level (50/50)
        vault = new MeezanVault(
            address(tokenA),
            address(tokenB),
            RiskLevel.Balanced
        );

        // Mint tokens to owner
        tokenA.mint(owner, INITIAL_BALANCE);
        tokenB.mint(owner, INITIAL_BALANCE);

        // Approve vault to spend tokens
        tokenA.approve(address(vault), type(uint256).max);
        tokenB.approve(address(vault), type(uint256).max);
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
        MeezanVault v = new MeezanVault(address(tokenA), address(tokenB), RiskLevel.VeryConservative);
        assertEq(uint8(v.riskLevel()), uint8(RiskLevel.VeryConservative));
        (uint16 pctA, uint16 pctB) = v.targetAllocations();
        assertEq(pctA, 1000);
        assertEq(pctB, 9000);
    }

    function test_VaultWithConservative() public {
        MeezanVault v = new MeezanVault(address(tokenA), address(tokenB), RiskLevel.Conservative);
        assertEq(uint8(v.riskLevel()), uint8(RiskLevel.Conservative));
        (uint16 pctA, uint16 pctB) = v.targetAllocations();
        assertEq(pctA, 2500);
        assertEq(pctB, 7500);
    }

    function test_VaultWithGrowth() public {
        MeezanVault v = new MeezanVault(address(tokenA), address(tokenB), RiskLevel.Growth);
        assertEq(uint8(v.riskLevel()), uint8(RiskLevel.Growth));
        (uint16 pctA, uint16 pctB) = v.targetAllocations();
        assertEq(pctA, 7500);
        assertEq(pctB, 2500);
    }

    function test_VaultWithAggressive() public {
        MeezanVault v = new MeezanVault(address(tokenA), address(tokenB), RiskLevel.Aggressive);
        assertEq(uint8(v.riskLevel()), uint8(RiskLevel.Aggressive));
        (uint16 pctA, uint16 pctB) = v.targetAllocations();
        assertEq(pctA, 9000);
        assertEq(pctB, 1000);
    }

    function test_RevertZeroAddressTokenA() public {
        vm.expectRevert(MeezanVault.ZeroAddress.selector);
        new MeezanVault(address(0), address(tokenB), RiskLevel.Balanced);
    }

    function test_RevertZeroAddressTokenB() public {
        vm.expectRevert(MeezanVault.ZeroAddress.selector);
        new MeezanVault(address(tokenA), address(0), RiskLevel.Balanced);
    }

    function test_RevertIdenticalTokens() public {
        vm.expectRevert(MeezanVault.IdenticalTokens.selector);
        new MeezanVault(address(tokenA), address(tokenA), RiskLevel.Balanced);
    }

    function test_ConstantsSetCorrectly() public view {
        assertEq(vault.MIN_DRIFT_BPS(), 300, "MIN_DRIFT_BPS should be 300");
        assertEq(vault.DEFAULT_DRIFT_BPS(), 500, "DEFAULT_DRIFT_BPS should be 500");
        assertEq(vault.COOLDOWN_SECONDS(), 43200, "COOLDOWN_SECONDS should be 43200");
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
        uint256 depositAmount = 100 ether;
        
        vault.depositTokenA(depositAmount);
        
        (uint256 balA, uint256 balB) = vault.holdings();
        assertEq(balA, depositAmount, "Balance A should match deposit");
        assertEq(balB, 0, "Balance B should be zero");
    }

    function test_DepositTokenB() public {
        uint256 depositAmount = 200 ether;
        
        vault.depositTokenB(depositAmount);
        
        (uint256 balA, uint256 balB) = vault.holdings();
        assertEq(balA, 0, "Balance A should be zero");
        assertEq(balB, depositAmount, "Balance B should match deposit");
    }

    function test_DepositBothTokens() public {
        vault.depositTokenA(100 ether);
        vault.depositTokenB(200 ether);

        (uint256 balA, uint256 balB) = vault.holdings();
        assertEq(balA, 100 ether, "Balance A mismatch");
        assertEq(balB, 200 ether, "Balance B mismatch");
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
        vault.depositTokenA(100 ether);

        vm.prank(attacker);
        vm.expectRevert(MeezanVault.OnlyOwner.selector);
        vault.depositTokenB(100 ether);
    }

    function test_DepositEmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit MeezanVault.Deposit(owner, address(tokenA), 100 ether);
        vault.depositTokenA(100 ether);

        vm.expectEmit(true, true, false, true);
        emit MeezanVault.Deposit(owner, address(tokenB), 200 ether);
        vault.depositTokenB(200 ether);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Withdraw Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_WithdrawTokenA() public {
        vault.depositTokenA(100 ether);
        
        uint256 balanceBefore = tokenA.balanceOf(owner);
        vault.withdrawTokenA(40 ether);
        uint256 balanceAfter = tokenA.balanceOf(owner);

        assertEq(balanceAfter - balanceBefore, 40 ether, "Should receive 40 tokens");
        
        (uint256 balA,) = vault.holdings();
        assertEq(balA, 60 ether, "Vault should have 60 remaining");
    }

    function test_WithdrawTokenB() public {
        vault.depositTokenB(100 ether);
        
        uint256 balanceBefore = tokenB.balanceOf(owner);
        vault.withdrawTokenB(30 ether);
        uint256 balanceAfter = tokenB.balanceOf(owner);

        assertEq(balanceAfter - balanceBefore, 30 ether, "Should receive 30 tokens");
        
        (, uint256 balB) = vault.holdings();
        assertEq(balB, 70 ether, "Vault should have 70 remaining");
    }

    function test_RevertWithdrawZeroAmount() public {
        vault.depositTokenA(100 ether);

        vm.expectRevert(MeezanVault.ZeroAmount.selector);
        vault.withdrawTokenA(0);

        vm.expectRevert(MeezanVault.ZeroAmount.selector);
        vault.withdrawTokenB(0);
    }

    function test_RevertWithdrawNotOwner() public {
        vault.depositTokenA(100 ether);
        vault.depositTokenB(100 ether);

        vm.prank(attacker);
        vm.expectRevert(MeezanVault.OnlyOwner.selector);
        vault.withdrawTokenA(50 ether);

        vm.prank(attacker);
        vm.expectRevert(MeezanVault.OnlyOwner.selector);
        vault.withdrawTokenB(50 ether);
    }

    function test_RevertWithdrawMoreThanBalance() public {
        vault.depositTokenA(100 ether);

        vm.expectRevert(MeezanVault.InsufficientBalance.selector);
        vault.withdrawTokenA(101 ether);
    }

    function test_WithdrawEmitsEvent() public {
        vault.depositTokenA(100 ether);
        vault.depositTokenB(100 ether);

        vm.expectEmit(true, true, false, true);
        emit MeezanVault.Withdraw(owner, address(tokenA), 50 ether);
        vault.withdrawTokenA(50 ether);

        vm.expectEmit(true, true, false, true);
        emit MeezanVault.Withdraw(owner, address(tokenB), 50 ether);
        vault.withdrawTokenB(50 ether);
    }

    // ─────────────────────────────────────────────────────────────────────
    // WithdrawAll Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_WithdrawAll() public {
        vault.depositTokenA(100 ether);
        vault.depositTokenB(200 ether);

        uint256 balABefore = tokenA.balanceOf(owner);
        uint256 balBBefore = tokenB.balanceOf(owner);

        (uint256 amountA, uint256 amountB) = vault.withdrawAll();

        assertEq(amountA, 100 ether, "Should return amount A");
        assertEq(amountB, 200 ether, "Should return amount B");

        assertEq(tokenA.balanceOf(owner) - balABefore, 100 ether, "Owner should receive A");
        assertEq(tokenB.balanceOf(owner) - balBBefore, 200 ether, "Owner should receive B");

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
        // Only deposit token A
        vault.depositTokenA(100 ether);

        (uint256 amountA, uint256 amountB) = vault.withdrawAll();

        assertEq(amountA, 100 ether, "Should return 100 for A");
        assertEq(amountB, 0, "Should return 0 for B");
    }

    function test_RevertWithdrawAllNotOwner() public {
        vault.depositTokenA(100 ether);

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
    // View Function Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_Holdings() public {
        (uint256 balA, uint256 balB) = vault.holdings();
        assertEq(balA, 0, "Initial balance A should be 0");
        assertEq(balB, 0, "Initial balance B should be 0");

        vault.depositTokenA(50 ether);
        vault.depositTokenB(75 ether);

        (balA, balB) = vault.holdings();
        assertEq(balA, 50 ether, "Balance A after deposit");
        assertEq(balB, 75 ether, "Balance B after deposit");
    }

    function test_HoldingsReflectsDirectTransfer() public {
        // Direct transfer (not via deposit) should still be reflected
        tokenA.transfer(address(vault), 50 ether);

        (uint256 balA,) = vault.holdings();
        assertEq(balA, 50 ether, "Holdings should reflect direct transfer");
    }

    function test_TargetAllocations() public view {
        (uint16 pctA, uint16 pctB) = vault.targetAllocations();
        assertEq(pctA + pctB, 10000, "Allocations should sum to 10000");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Current Allocations & Drift Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_CurrentAllocationsEmpty() public view {
        (uint16 pctA, uint16 pctB) = vault.currentAllocationsBps();
        assertEq(pctA, 0, "Empty vault pctA should be 0");
        assertEq(pctB, 0, "Empty vault pctB should be 0");
    }

    function test_CurrentAllocationsBalanced() public {
        // 50/50 deposit
        vault.depositTokenA(100 ether);
        vault.depositTokenB(100 ether);

        (uint16 pctA, uint16 pctB) = vault.currentAllocationsBps();
        assertEq(pctA, 5000, "50/50 should give pctA = 5000");
        assertEq(pctB, 5000, "50/50 should give pctB = 5000");
    }

    function test_CurrentAllocationsSkewed() public {
        // 80/20 deposit (80% token A)
        vault.depositTokenA(80 ether);
        vault.depositTokenB(20 ether);

        (uint16 pctA, uint16 pctB) = vault.currentAllocationsBps();
        assertEq(pctA, 8000, "80/20 should give pctA = 8000");
        assertEq(pctB, 2000, "80/20 should give pctB = 2000");
    }

    function test_CurrentAllocationsOnlyTokenA() public {
        vault.depositTokenA(100 ether);

        (uint16 pctA, uint16 pctB) = vault.currentAllocationsBps();
        assertEq(pctA, 10000, "100% A should give pctA = 10000");
        assertEq(pctB, 0, "100% A should give pctB = 0");
    }

    function test_CurrentAllocationsOnlyTokenB() public {
        vault.depositTokenB(100 ether);

        (uint16 pctA, uint16 pctB) = vault.currentAllocationsBps();
        assertEq(pctA, 0, "100% B should give pctA = 0");
        assertEq(pctB, 10000, "100% B should give pctB = 10000");
    }

    function test_DriftBpsZeroWhenEmpty() public view {
        uint16 drift = vault.driftBps();
        // Empty vault: currentPctA = 0, targetPctA = 5000, drift = 5000
        assertEq(drift, 5000, "Empty vault drift should be 5000 (target is 50%)");
    }

    function test_DriftBpsZeroWhenBalanced() public {
        // Balanced vault matches target (50/50)
        vault.depositTokenA(100 ether);
        vault.depositTokenB(100 ether);

        uint16 drift = vault.driftBps();
        assertEq(drift, 0, "Balanced vault should have 0 drift");
    }

    function test_DriftBpsWhenOverAllocatedToA() public {
        // 60% A / 40% B, target is 50/50
        vault.depositTokenA(60 ether);
        vault.depositTokenB(40 ether);

        uint16 drift = vault.driftBps();
        assertEq(drift, 1000, "60/40 should have drift of 1000 bps (10%)");
    }

    function test_DriftBpsWhenUnderAllocatedToA() public {
        // 40% A / 60% B, target is 50/50
        vault.depositTokenA(40 ether);
        vault.depositTokenB(60 ether);

        uint16 drift = vault.driftBps();
        assertEq(drift, 1000, "40/60 should have drift of 1000 bps (10%)");
    }

    function test_DriftBpsExactlyAtThreshold() public {
        // 55% A / 45% B = 500 bps drift
        vault.depositTokenA(55 ether);
        vault.depositTokenB(45 ether);

        uint16 drift = vault.driftBps();
        assertEq(drift, 500, "55/45 should have drift of 500 bps (5%)");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Rebalance Tests
    // ─────────────────────────────────────────────────────────────────────

    function test_RebalanceRevertsIfDriftTooLow() public {
        // 50/50 deposit matches target exactly
        vault.depositTokenA(100 ether);
        vault.depositTokenB(100 ether);

        vm.expectRevert(MeezanVault.DriftTooLow.selector);
        vault.rebalance();
    }

    function test_RebalanceRevertsIfDriftJustBelowThreshold() public {
        // 54/46 = 400 bps drift (below 500 threshold)
        vault.depositTokenA(54 ether);
        vault.depositTokenB(46 ether);

        assertEq(vault.driftBps(), 400, "Should be 400 bps drift");

        vm.expectRevert(MeezanVault.DriftTooLow.selector);
        vault.rebalance();
    }

    function test_RebalanceSucceedsWhenDriftMeetsThreshold() public {
        // 55/45 = 500 bps drift (exactly at threshold)
        vault.depositTokenA(55 ether);
        vault.depositTokenB(45 ether);

        vault.rebalance();

        assertEq(vault.lastRebalanceAt(), block.timestamp, "lastRebalanceAt should be updated");
    }

    function test_RebalanceEnforcesCooldown() public {
        // Create enough drift (60/40 = 1000 bps)
        vault.depositTokenA(60 ether);
        vault.depositTokenB(40 ether);

        // First rebalance succeeds
        vault.rebalance();

        // Immediate second rebalance fails
        vm.expectRevert(MeezanVault.CooldownNotElapsed.selector);
        vault.rebalance();

        // After cooldown, it should work
        vm.warp(block.timestamp + vault.COOLDOWN_SECONDS());
        vault.rebalance();
    }

    function test_RebalanceEmitsEventSellA() public {
        // 60% A / 40% B => over-allocated to A, should sell A
        vault.depositTokenA(60 ether);
        vault.depositTokenB(40 ether);

        vm.expectEmit(true, true, true, true);
        emit MeezanVault.RebalancePlanned(
            owner,
            address(tokenA), // sellToken
            address(tokenB), // buyToken
            1000,            // driftBps
            6000,            // currentPctA
            5000,            // targetPctA
            uint64(block.timestamp)
        );

        vault.rebalance();
    }

    function test_RebalanceEmitsEventSellB() public {
        // 40% A / 60% B => under-allocated to A, should sell B
        vault.depositTokenA(40 ether);
        vault.depositTokenB(60 ether);

        vm.expectEmit(true, true, true, true);
        emit MeezanVault.RebalancePlanned(
            owner,
            address(tokenB), // sellToken
            address(tokenA), // buyToken
            1000,            // driftBps
            4000,            // currentPctA
            5000,            // targetPctA
            uint64(block.timestamp)
        );

        vault.rebalance();
    }

    function test_RebalanceOwnerCanAlwaysCall() public {
        vault.depositTokenA(60 ether);
        vault.depositTokenB(40 ether);

        // Owner can call even without executor or autoRebalance enabled
        vault.rebalance();

        assertGt(vault.lastRebalanceAt(), 0, "Rebalance should have occurred");
    }

    function test_RebalanceExecutorCannotCallWhenNotEnabled() public {
        vault.depositTokenA(60 ether);
        vault.depositTokenB(40 ether);

        vault.setExecutor(executorAddr);
        // autoRebalanceEnabled is still false

        vm.prank(executorAddr);
        vm.expectRevert(MeezanVault.OnlyOwnerOrExecutor.selector);
        vault.rebalance();
    }

    function test_RebalanceExecutorCannotCallWhenNotSet() public {
        vault.depositTokenA(60 ether);
        vault.depositTokenB(40 ether);

        vault.setAutoRebalanceEnabled(true);
        // executor is still address(0)

        vm.prank(executorAddr);
        vm.expectRevert(MeezanVault.OnlyOwnerOrExecutor.selector);
        vault.rebalance();
    }

    function test_RebalanceExecutorCanCallWhenEnabledAndSet() public {
        vault.depositTokenA(60 ether);
        vault.depositTokenB(40 ether);

        vault.setExecutor(executorAddr);
        vault.setAutoRebalanceEnabled(true);

        vm.prank(executorAddr);
        vault.rebalance();

        assertGt(vault.lastRebalanceAt(), 0, "Rebalance should have occurred");
    }

    function test_RebalanceRandomAddressCannotCall() public {
        vault.depositTokenA(60 ether);
        vault.depositTokenB(40 ether);

        vault.setExecutor(executorAddr);
        vault.setAutoRebalanceEnabled(true);

        vm.prank(attacker);
        vm.expectRevert(MeezanVault.OnlyOwnerOrExecutor.selector);
        vault.rebalance();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Fuzz Tests
    // ─────────────────────────────────────────────────────────────────────

    function testFuzz_DepositAndWithdraw(uint256 amountA, uint256 amountB) public {
        // Bound to reasonable amounts
        amountA = bound(amountA, 1, INITIAL_BALANCE);
        amountB = bound(amountB, 1, INITIAL_BALANCE);

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
        
        MeezanVault v = new MeezanVault(
            address(tokenA),
            address(tokenB),
            RiskLevel(level)
        );

        (uint16 pctA, uint16 pctB) = v.targetAllocations();
        assertEq(pctA + pctB, 10000, "All risk levels must sum to 10000");
        assertEq(uint8(v.riskLevel()), level, "Risk level should be stored correctly");
    }

    function testFuzz_WithdrawCannotExceedBalance(uint256 depositAmt, uint256 withdrawAmt) public {
        depositAmt = bound(depositAmt, 1, INITIAL_BALANCE);
        withdrawAmt = bound(withdrawAmt, depositAmt + 1, type(uint256).max);

        vault.depositTokenA(depositAmt);

        vm.expectRevert(MeezanVault.InsufficientBalance.selector);
        vault.withdrawTokenA(withdrawAmt);
    }

    function testFuzz_CurrentAllocationsSumTo10000(uint256 amountA, uint256 amountB) public {
        // At least 1 wei in each to avoid division issues
        amountA = bound(amountA, 1, INITIAL_BALANCE);
        amountB = bound(amountB, 1, INITIAL_BALANCE);

        vault.depositTokenA(amountA);
        vault.depositTokenB(amountB);

        (uint16 pctA, uint16 pctB) = vault.currentAllocationsBps();
        assertEq(pctA + pctB, 10000, "Current allocations should sum to 10000");
    }

    function testFuzz_DriftIsSymmetric(uint256 amountA, uint256 amountB) public {
        amountA = bound(amountA, 1 ether, INITIAL_BALANCE);
        amountB = bound(amountB, 1 ether, INITIAL_BALANCE);

        vault.depositTokenA(amountA);
        vault.depositTokenB(amountB);

        uint16 drift = vault.driftBps();
        
        // Drift should be <= 5000 (max 50% deviation from 50% target)
        assertLe(drift, 5000, "Drift should be <= 5000 bps");
    }
}
