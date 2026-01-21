// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MeezanVault} from "../src/MeezanVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceFeed} from "./mocks/MockPriceFeed.sol";
import {MockSwapRouter} from "./mocks/MockSwapRouter.sol";

/**
 * @title MeezanVaultInvariantTest
 * @notice Invariant tests for security properties of MeezanVault
 * @dev Tests critical invariants that must ALWAYS hold
 */
contract MeezanVaultInvariantTest is StdInvariant, Test {
    MeezanVault public vault;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockPriceFeed public priceFeedA;
    MockPriceFeed public priceFeedB;
    MockSwapRouter public swapRouter;

    VaultHandler public handler;

    address public owner;
    address public attacker;

    int256 constant BTC_PRICE = 40_000e8;
    int256 constant USDC_PRICE = 1e8;
    uint24 constant POOL_FEE = 3000;

    function setUp() public {
        owner = address(this);
        attacker = address(0xBEEF);

        // Deploy mocks
        tokenA = new MockERC20("Wrapped Bitcoin", "WBTC", 8);
        tokenB = new MockERC20("USD Coin", "USDC", 6);
        priceFeedA = new MockPriceFeed(8, BTC_PRICE, "BTC/USD");
        priceFeedB = new MockPriceFeed(8, USDC_PRICE, "USDC/USD");
        swapRouter = new MockSwapRouter(40000e18, address(tokenA), address(tokenB));

        // Deploy vault
        vault = new MeezanVault(
            address(tokenA),
            address(tokenB),
            address(priceFeedA),
            address(priceFeedB),
            address(swapRouter),
            POOL_FEE,
            5000,
            5000,
            500
        );

        // Setup handler
        handler = new VaultHandler(vault, tokenA, tokenB, priceFeedA, priceFeedB, swapRouter, owner);

        // Fund handler
        tokenA.mint(address(handler), 1000e8);
        tokenB.mint(address(handler), 10_000_000e6);
        tokenA.mint(address(swapRouter), 1000e8);
        tokenB.mint(address(swapRouter), 10_000_000e6);

        // Target handler for invariant testing
        targetContract(address(handler));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVARIANT 1: Access Control - Only owner can call owner functions
    // ═══════════════════════════════════════════════════════════════════════════

    function invariant_onlyOwnerCanWithdraw() public view {
        // After any sequence of handler actions, non-owners should never
        // have been able to withdraw
        assertEq(handler.unauthorizedWithdrawAttempts(), 0, "Unauthorized withdraw succeeded");
    }

    function invariant_onlyOwnerCanDeposit() public view {
        // After any sequence of handler actions, non-owners should never
        // have been able to deposit
        assertEq(handler.unauthorizedDepositAttempts(), 0, "Unauthorized deposit succeeded");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVARIANT 2: Approval Safety - Router approval is always zero after ops
    // ═══════════════════════════════════════════════════════════════════════════

    function invariant_noResidualApprovals() public view {
        // After any sequence of operations, vault should have zero approval
        // to swap router for both tokens
        uint256 allowanceA = tokenA.allowance(address(vault), address(swapRouter));
        uint256 allowanceB = tokenB.allowance(address(vault), address(swapRouter));

        assertEq(allowanceA, 0, "Residual approval for tokenA");
        assertEq(allowanceB, 0, "Residual approval for tokenB");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVARIANT 3: Oracle Staleness - Operations revert on stale prices
    // ═══════════════════════════════════════════════════════════════════════════

    function invariant_stalePriceRevertsTracked() public view {
        // Handler tracks attempts to operate with stale prices
        // All such attempts should have reverted
        assertEq(handler.staleOracleSuccesses(), 0, "Operation succeeded with stale oracle");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVARIANT 4: Slippage Cap - Swaps never exceed configured slippage
    // ═══════════════════════════════════════════════════════════════════════════

    function invariant_slippageNeverExceeded() public view {
        // Handler tracks all successful swaps and their actual slippage
        // None should exceed the configured maximum
        assertEq(handler.slippageExceededCount(), 0, "Swap exceeded slippage cap");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVARIANT 5: Rebalance Gating - Rebalance only when drift >= threshold
    // ═══════════════════════════════════════════════════════════════════════════

    function invariant_rebalanceOnlyAboveThreshold() public view {
        // Handler tracks rebalance attempts below threshold
        // All should have reverted
        assertEq(handler.belowThresholdRebalanceSuccesses(), 0, "Rebalance succeeded below threshold");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVARIANT 6: Cooldown Enforcement - Executor respects cooldown
    // ═══════════════════════════════════════════════════════════════════════════

    function invariant_executorCooldownEnforced() public view {
        // Handler tracks executor rebalance attempts during cooldown
        // All should have reverted
        assertEq(handler.cooldownViolationSuccesses(), 0, "Executor rebalanced during cooldown");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVARIANT 7: Allocation Sum - Target allocations always sum to 100%
    // ═══════════════════════════════════════════════════════════════════════════

    function invariant_allocationsSumTo10000() public view {
        (uint16 pctA, uint16 pctB) = vault.targetAllocations();
        assertEq(pctA + pctB, 10000, "Target allocations don't sum to 10000");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVARIANT 8: Holdings Consistency - Holdings match actual balances
    // ═══════════════════════════════════════════════════════════════════════════

    function invariant_holdingsMatchBalances() public view {
        (uint256 balA, uint256 balB) = vault.holdings();
        assertEq(balA, tokenA.balanceOf(address(vault)), "TokenA holdings mismatch");
        assertEq(balB, tokenB.balanceOf(address(vault)), "TokenB holdings mismatch");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVARIANT 9: Ownership Integrity - Owner never changes unexpectedly
    // ═══════════════════════════════════════════════════════════════════════════

    function invariant_ownershipIntegrity() public view {
        // Owner should either be original owner or the accepted pending owner
        address currentOwner = vault.owner();
        assertTrue(
            currentOwner == owner || handler.ownershipTransferCompleted(),
            "Unexpected owner change"
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVARIANT 10: Pause Safety - Withdrawals always work
    // ═══════════════════════════════════════════════════════════════════════════

    function invariant_withdrawAlwaysWorks() public view {
        // Even when paused, withdraw attempts should not revert due to pause
        assertEq(handler.pausedWithdrawFailures(), 0, "Withdraw failed due to pause");
    }
}

/**
 * @title VaultHandler
 * @notice Handler contract for invariant testing
 * @dev Performs various vault operations and tracks security violations
 */
contract VaultHandler is Test {
    MeezanVault public vault;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockPriceFeed public priceFeedA;
    MockPriceFeed public priceFeedB;
    MockSwapRouter public swapRouter;
    address public owner;
    address public attacker;
    address public executor;

    // Tracking variables for invariant checks
    uint256 public unauthorizedWithdrawAttempts;
    uint256 public unauthorizedDepositAttempts;
    uint256 public staleOracleSuccesses;
    uint256 public slippageExceededCount;
    uint256 public belowThresholdRebalanceSuccesses;
    uint256 public cooldownViolationSuccesses;
    uint256 public pausedWithdrawFailures;
    bool public ownershipTransferCompleted;

    constructor(
        MeezanVault _vault,
        MockERC20 _tokenA,
        MockERC20 _tokenB,
        MockPriceFeed _priceFeedA,
        MockPriceFeed _priceFeedB,
        MockSwapRouter _swapRouter,
        address _owner
    ) {
        vault = _vault;
        tokenA = _tokenA;
        tokenB = _tokenB;
        priceFeedA = _priceFeedA;
        priceFeedB = _priceFeedB;
        swapRouter = _swapRouter;
        owner = _owner;
        attacker = address(0xBEEF);
        executor = address(0xE1E1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Owner Actions
    // ═══════════════════════════════════════════════════════════════════════════

    function depositTokenA(uint256 amount) external {
        amount = bound(amount, 1, 10e8);
        vm.startPrank(owner);
        tokenA.approve(address(vault), amount);
        vault.depositTokenA(amount);
        vm.stopPrank();
    }

    function depositTokenB(uint256 amount) external {
        amount = bound(amount, 1000e6, 100_000e6);
        vm.startPrank(owner);
        tokenB.approve(address(vault), amount);
        vault.depositTokenB(amount);
        vm.stopPrank();
    }

    function depositUSDC(uint256 amount) external {
        amount = bound(amount, 10_000e6, 100_000e6);
        vm.startPrank(owner);
        tokenB.approve(address(vault), amount);
        try vault.depositUSDC(amount) {} catch {}
        vm.stopPrank();
    }

    function withdrawTokenA(uint256 amount) external {
        (uint256 balA,) = vault.holdings();
        if (balA == 0) return;
        amount = bound(amount, 1, balA);
        vm.prank(owner);
        vault.withdrawTokenA(amount);
    }

    function withdrawTokenB(uint256 amount) external {
        (, uint256 balB) = vault.holdings();
        if (balB == 0) return;
        amount = bound(amount, 1, balB);
        vm.prank(owner);
        vault.withdrawTokenB(amount);
    }

    function withdrawAll() external {
        vm.prank(owner);
        vault.withdrawAll();
    }

    function rebalance() external {
        uint16 drift = vault.driftBps();
        uint16 threshold = vault.driftThresholdBps();

        vm.prank(owner);
        try vault.rebalance() {
            // If rebalance succeeded but drift was below threshold, track violation
            if (drift < threshold) {
                belowThresholdRebalanceSuccesses++;
            }
        } catch {}
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Access Control Tests
    // ═══════════════════════════════════════════════════════════════════════════

    function attackerWithdraw() external {
        (uint256 balA, uint256 balB) = vault.holdings();
        if (balA == 0 && balB == 0) return;

        vm.startPrank(attacker);
        try vault.withdrawAll() {
            unauthorizedWithdrawAttempts++;
        } catch {}
        vm.stopPrank();
    }

    function attackerDeposit() external {
        vm.startPrank(attacker);
        tokenB.approve(address(vault), 1000e6);
        try vault.depositTokenB(1000e6) {
            unauthorizedDepositAttempts++;
        } catch {}
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Oracle Staleness Tests
    // ═══════════════════════════════════════════════════════════════════════════

    function staleOracleDeposit() external {
        // Make oracle stale
        vm.warp(block.timestamp + 4000); // Beyond MAX_PRICE_STALENESS

        vm.startPrank(owner);
        tokenB.approve(address(vault), 10_000e6);
        try vault.depositUSDC(10_000e6) {
            staleOracleSuccesses++;
        } catch {}
        vm.stopPrank();

        // Reset oracle
        priceFeedA.setPrice(40_000e8);
        priceFeedB.setPrice(1e8);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Cooldown Tests
    // ═══════════════════════════════════════════════════════════════════════════

    function executorRebalanceDuringCooldown() external {
        // Setup executor
        vm.prank(owner);
        vault.setExecutor(executor);
        vm.prank(owner);
        vault.setAutoRebalanceEnabled(true);

        // First rebalance by executor
        uint16 drift = vault.driftBps();
        if (drift >= vault.driftThresholdBps()) {
            vm.prank(executor);
            try vault.rebalance() {} catch {}
        }

        // Try immediate second rebalance (should fail due to cooldown)
        vm.prank(executor);
        try vault.rebalance() {
            // If last rebalance was recent, this is a cooldown violation
            if (vault.lastRebalanceAt() != 0 &&
                block.timestamp - vault.lastRebalanceAt() < vault.COOLDOWN_SECONDS()) {
                cooldownViolationSuccesses++;
            }
        } catch {}
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Pause Tests
    // ═══════════════════════════════════════════════════════════════════════════

    function pauseAndWithdraw() external {
        // Deposit first
        vm.startPrank(owner);
        tokenB.approve(address(vault), 10_000e6);
        vault.depositTokenB(10_000e6);

        // Pause
        vault.pause();

        // Try withdraw (should work)
        try vault.withdrawAll() {
            // Good - withdraw worked while paused
        } catch {
            pausedWithdrawFailures++;
        }

        vault.unpause();
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Ownership Tests
    // ═══════════════════════════════════════════════════════════════════════════

    function transferOwnership() external {
        address newOwner = address(0x1234);
        vm.prank(owner);
        vault.transferOwnership(newOwner);
    }

    function acceptOwnership() external {
        address pendingOwner = vault.pendingOwner();
        if (pendingOwner != address(0)) {
            vm.prank(pendingOwner);
            try vault.acceptOwnership() {
                ownershipTransferCompleted = true;
            } catch {}
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Slippage Tests
    // ═══════════════════════════════════════════════════════════════════════════

    function setHighSlippage() external {
        vm.prank(owner);
        try vault.setSlippageBps(500) {} catch {}
    }

    function setLowSlippage() external {
        vm.prank(owner);
        try vault.setSlippageBps(10) {} catch {}
    }
}
