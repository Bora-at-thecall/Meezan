// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MeezanVault} from "../src/MeezanVault.sol";
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

        // Deploy vault with 50/50 allocation
        vault = new MeezanVault(
            address(tokenA),
            address(tokenB),
            5000, // 50% token A
            5000 // 50% token B
        );

        // Mint tokens to owner
        tokenA.mint(owner, INITIAL_BALANCE);
        tokenB.mint(owner, INITIAL_BALANCE);

        // Approve vault to spend tokens
        tokenA.approve(address(vault), type(uint256).max);
        tokenB.approve(address(vault), type(uint256).max);
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

    function test_AllocationSetCorrectly() public view {
        (uint16 pctA, uint16 pctB) = vault.targetAllocations();
        assertEq(pctA, 5000, "Target pct A should be 5000");
        assertEq(pctB, 5000, "Target pct B should be 5000");
    }

    function test_RevertInvalidAllocation() public {
        vm.expectRevert(MeezanVault.InvalidAllocation.selector);
        new MeezanVault(address(tokenA), address(tokenB), 5000, 4000);
    }

    function test_RevertZeroAddressTokenA() public {
        vm.expectRevert(MeezanVault.ZeroAddress.selector);
        new MeezanVault(address(0), address(tokenB), 5000, 5000);
    }

    function test_RevertZeroAddressTokenB() public {
        vm.expectRevert(MeezanVault.ZeroAddress.selector);
        new MeezanVault(address(tokenA), address(0), 5000, 5000);
    }

    function test_RevertIdenticalTokens() public {
        vm.expectRevert(MeezanVault.IdenticalTokens.selector);
        new MeezanVault(address(tokenA), address(tokenA), 5000, 5000);
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

    function testFuzz_AllocationMustSumTo10000(uint16 pctA) public {
        // Skip invalid allocations
        vm.assume(pctA <= 10000);
        uint16 pctB = 10000 - pctA;

        MeezanVault newVault = new MeezanVault(address(tokenA), address(tokenB), pctA, pctB);

        (uint16 retA, uint16 retB) = newVault.targetAllocations();
        assertEq(retA + retB, 10000);
    }

    function testFuzz_WithdrawCannotExceedBalance(uint256 depositAmt, uint256 withdrawAmt) public {
        depositAmt = bound(depositAmt, 1, INITIAL_BALANCE);
        withdrawAmt = bound(withdrawAmt, depositAmt + 1, type(uint256).max);

        vault.depositTokenA(depositAmt);

        vm.expectRevert(MeezanVault.InsufficientBalance.selector);
        vault.withdrawTokenA(withdrawAmt);
    }
}
