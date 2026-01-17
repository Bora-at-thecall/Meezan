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

    uint256 constant INITIAL_BALANCE = 1000 ether;

    function setUp() public {
        // Deploy mock tokens
        tokenA = new MockERC20("Wrapped Bitcoin", "WBTC", 8);
        tokenB = new MockERC20("USD Coin", "USDC", 6);

        // Deploy vault with Balanced risk level
        vault = new MeezanVault(address(tokenA), address(tokenB), RiskLevel.Balanced);

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

        MeezanVault v = new MeezanVault(address(tokenA), address(tokenB), RiskLevel(level));

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
}
