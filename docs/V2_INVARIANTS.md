# Meezan v2 — Formal Invariants

**Status:** Planning Phase
**Last Updated:** 2026-01-21
**Purpose:** Define verifiable security properties for v2 contracts

---

## Overview

This document specifies formal invariants that must hold for MeezanVaultV2. These properties are:
1. Machine-verifiable via Foundry invariant tests
2. Human-auditable via code review
3. Critical for security correctness

Each invariant includes:
- **Property:** Formal statement
- **Rationale:** Why this matters for security
- **Enforcement:** Where/how it's enforced in code
- **Test:** How to verify with Foundry

---

## 1. Allocation Invariants

### INV-01: Weight Sum Integrity

**Property:**
```
∀ vault, at deployment:
  Σ targetWeightsBps[i] for i in [0, assetCount) = 10000
```

**Rationale:** Portfolio weights must sum to 100% (10000 bps). If they don't, the vault has undefined behavior for drift calculation and rebalancing.

**Enforcement:**
```solidity
constructor(AssetConfig[] memory assets, ...) {
    uint256 totalWeight = 0;
    for (uint8 i = 0; i < assets.length; i++) {
        totalWeight += assets[i].targetWeightBps;
    }
    if (totalWeight != BPS_DENOMINATOR) revert InvalidAllocation();
}
```

**Test:**
```solidity
function invariant_weightSumIs10000() public view {
    uint256 total = 0;
    for (uint8 i = 0; i < vault.assetCount(); i++) {
        total += vault.targetWeightsBps(i);
    }
    assertEq(total, 10000);
}
```

---

### INV-02: Minimum Weight Per Asset

**Property:**
```
∀ vault, ∀ i in [0, assetCount):
  targetWeightsBps[i] >= 100  (1%)
```

**Rationale:** Tiny allocations cost more to rebalance than they're worth. They also create precision issues in calculations.

**Enforcement:**
```solidity
constructor(AssetConfig[] memory assets, ...) {
    for (uint8 i = 0; i < assets.length; i++) {
        if (assets[i].targetWeightBps < 100) revert WeightTooSmall();
    }
}
```

**Test:**
```solidity
function invariant_minimumWeight() public view {
    for (uint8 i = 0; i < vault.assetCount(); i++) {
        assertGe(vault.targetWeightsBps(i), 100);
    }
}
```

---

### INV-03: Asset Count Bounds

**Property:**
```
∀ vault:
  2 <= assetCount <= 10
```

**Rationale:**
- Minimum 2: Single asset doesn't need rebalancing
- Maximum 10: Gas costs and complexity bounds

**Enforcement:**
```solidity
constructor(AssetConfig[] memory assets, ...) {
    if (assets.length < 2) revert TooFewAssets();
    if (assets.length > 10) revert TooManyAssets();
    assetCount = uint8(assets.length);
}
```

**Test:**
```solidity
function invariant_assetCountBounds() public view {
    uint8 count = vault.assetCount();
    assertGe(count, 2);
    assertLe(count, 10);
}
```

---

### INV-04: Stablecoin Presence

**Property:**
```
∀ vault:
  ∃ i in [0, assetCount): assets[i] = USDC_ADDRESS
  AND stablecoinIndex = i
```

**Rationale:** All swaps route through USDC. Without it in the portfolio, rebalancing cannot execute.

**Enforcement:**
```solidity
constructor(AssetConfig[] memory assets, address _stablecoin, ...) {
    bool found = false;
    for (uint8 i = 0; i < assets.length; i++) {
        if (assets[i].token == _stablecoin) {
            stablecoinIndex = i;
            found = true;
            break;
        }
    }
    if (!found) revert StablecoinNotInAssets();
}
```

**Test:**
```solidity
function invariant_stablecoinPresent() public view {
    uint8 idx = vault.stablecoinIndex();
    assertLt(idx, vault.assetCount());
    assertEq(vault.assets(idx), address(USDC));
}
```

---

## 2. Access Control Invariants

### INV-05: Owner Exclusivity for Withdrawals

**Property:**
```
∀ withdrawal operations:
  caller = owner
```

**Rationale:** Only the vault owner can remove assets. This is the fundamental security property.

**Enforcement:**
```solidity
function withdrawTokenA(uint256 amount) external onlyOwner { ... }
function withdrawTokenB(uint256 amount) external onlyOwner { ... }
function withdrawAll() external onlyOwner { ... }
function withdraw(uint8 assetIndex, uint256 amount) external onlyOwner { ... }
```

**Test:**
```solidity
function invariant_onlyOwnerWithdraws() public {
    // Handler tracks all withdrawal callers
    for (uint i = 0; i < handler.withdrawalCount(); i++) {
        assertEq(handler.withdrawalCallers(i), vault.owner());
    }
}
```

---

### INV-06: Executor Rebalance Constraints

**Property:**
```
∀ executor rebalance:
  autoRebalanceEnabled = true
  AND executor != address(0)
  AND msg.sender = executor
  AND (lastRebalanceAt = 0 OR block.timestamp - lastRebalanceAt >= COOLDOWN_SECONDS)
  AND portfolioDriftBps() >= driftThresholdBps
```

**Rationale:** Executor has limited power: can only rebalance (not withdraw), only when drift threshold met, with cooldown between calls.

**Enforcement:**
```solidity
modifier onlyOwnerOrExecutor() {
    bool isOwner = msg.sender == owner;
    bool isAuthorizedExecutor = autoRebalanceEnabled
        && executor != address(0)
        && msg.sender == executor;
    if (!isOwner && !isAuthorizedExecutor) revert OnlyOwnerOrExecutor();
    _;
}

function rebalance() external onlyOwnerOrExecutor ... {
    if (msg.sender != owner) {
        if (lastRebalanceAt != 0 && block.timestamp - lastRebalanceAt < COOLDOWN_SECONDS) {
            revert CooldownNotElapsed();
        }
    }
    if (portfolioDriftBps() < driftThresholdBps) revert DriftBelowThreshold();
    ...
}
```

**Test:**
```solidity
function invariant_executorCooldown() public {
    // If last rebalance was by executor, cooldown was respected
    if (handler.lastRebalancerWasExecutor()) {
        uint64 timeSinceLast = handler.timeSinceLastRebalance();
        assertGe(timeSinceLast, vault.COOLDOWN_SECONDS());
    }
}
```

---

### INV-07: Two-Step Ownership Transfer

**Property:**
```
∀ ownership transfer:
  Step 1: owner calls transferOwnership(newOwner) → pendingOwner = newOwner
  Step 2: pendingOwner calls acceptOwnership() → owner = pendingOwner
```

**Rationale:** Prevents accidental ownership loss to typo addresses. New owner must actively accept.

**Enforcement:**
```solidity
function transferOwnership(address newOwner) external onlyOwner {
    if (newOwner == address(0)) revert ZeroAddress();
    pendingOwner = newOwner;
    emit OwnershipTransferStarted(owner, newOwner);
}

function acceptOwnership() external {
    if (msg.sender != pendingOwner) revert NotPendingOwner();
    owner = pendingOwner;
    pendingOwner = address(0);
    emit OwnershipTransferred(oldOwner, owner);
}
```

**Test:**
```solidity
function invariant_ownershipIntegrity() public view {
    // Owner is never zero (unless contract is destroyed)
    assertTrue(vault.owner() != address(0));
}
```

---

## 3. Approval Safety Invariants

### INV-08: No Residual Router Approvals

**Property:**
```
∀ state where no swap is in progress:
  ∀ i in [0, assetCount):
    IERC20(assets[i]).allowance(vault, swapRouter) = 0
```

**Rationale:** Leftover approvals could be exploited if router is compromised. Zero approval after each swap.

**Enforcement:**
```solidity
function _swapAssetToStablecoin(uint8 assetIndex, uint256 usdValue) internal {
    IERC20(token).forceApprove(address(swapRouter), amountToSell);

    // Execute swap...

    IERC20(token).forceApprove(address(swapRouter), 0);  // CRITICAL
}
```

**Test:**
```solidity
function invariant_noResidualApprovals() public view {
    for (uint8 i = 0; i < vault.assetCount(); i++) {
        address token = vault.assets(i);
        uint256 allowance = IERC20(token).allowance(address(vault), vault.swapRouter());
        assertEq(allowance, 0);
    }
}
```

---

## 4. Oracle Safety Invariants

### INV-09: All Oracles Fresh For Operations

**Property:**
```
∀ operation that reads prices:
  ∀ i in [0, assetCount):
    block.timestamp - oracle[i].updatedAt <= maxStaleness[i]
    AND oracle[i].answer > 0
    AND oracle[i].answeredInRound >= oracle[i].roundId
```

**Rationale:** Stale or invalid oracle data causes mispricing. All oracles must be healthy for any operation.

**Enforcement:**
```solidity
function _getPrice(address feed, uint32 maxStaleness) internal view returns (uint256) {
    (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
        AggregatorV3Interface(feed).latestRoundData();

    if (answer <= 0) revert InvalidPrice();
    if (updatedAt == 0) revert StalePrice();
    if (block.timestamp - updatedAt > maxStaleness) revert StalePrice();
    if (answeredInRound < roundId) revert IncompleteRound();

    return uint256(answer);
}
```

**Test:**
```solidity
function invariant_oraclesChecked() public {
    // Any successful operation means all oracles passed validation
    // Verify by attempting operation with one stale oracle → should revert
}
```

---

### INV-10: Appropriate Staleness Thresholds

**Property:**
```
∀ asset i:
  if isStablecoin(i): maxStaleness[i] = 90000  (25 hours)
  else: maxStaleness[i] = 3600  (1 hour)
```

**Rationale:** Stablecoins update less frequently (daily). Volatile assets need fresher prices.

**Enforcement:**
```solidity
function _getStalenessForAsset(uint8 assetIndex) internal view returns (uint32) {
    if (assetIndex == stablecoinIndex) {
        return MAX_PRICE_STALENESS_STABLE;  // 25 hours
    }
    return MAX_PRICE_STALENESS;  // 1 hour
}
```

**Test:**
```solidity
function invariant_stalenessThresholds() public view {
    assertEq(vault.MAX_PRICE_STALENESS(), 3600);
    assertEq(vault.MAX_PRICE_STALENESS_STABLE(), 90000);
}
```

---

## 5. Rebalance Safety Invariants

### INV-11: Drift Threshold Gating

**Property:**
```
∀ rebalance execution:
  portfolioDriftBps() >= driftThresholdBps at call time
```

**Rationale:** Prevents unnecessary rebalancing that wastes gas and incurs slippage.

**Enforcement:**
```solidity
function rebalance() external ... {
    uint16 drift = portfolioDriftBps();
    if (drift < driftThresholdBps) revert DriftBelowThreshold();
    ...
}
```

**Test:**
```solidity
function invariant_driftThresholdRespected() public {
    // Track all successful rebalances and verify drift was above threshold
    for (uint i = 0; i < handler.rebalanceCount(); i++) {
        assertGe(handler.rebalanceDrift(i), vault.driftThresholdBps());
    }
}
```

---

### INV-12: Slippage Bounds Per Swap

**Property:**
```
∀ swap in rebalance:
  |actualPrice - oraclePrice| / oraclePrice <= slippageBps / 10000
```

**Rationale:** Each individual swap must respect slippage tolerance. Prevents execution at unfavorable prices.

**Enforcement:**
```solidity
// Using exactOutputSingle with amountInMaximum
uint256 maxIn = oracleBasedAmount * (BPS_DENOMINATOR + slippageBps) / BPS_DENOMINATOR;
params.amountInMaximum = maxIn;
uint256 actualIn = swapRouter.exactOutputSingle(params);
if (actualIn > maxIn) revert SlippageExceeded();

// Or using exactInputSingle with amountOutMinimum
uint256 minOut = oracleBasedAmount * (BPS_DENOMINATOR - slippageBps) / BPS_DENOMINATOR;
params.amountOutMinimum = minOut;
```

**Test:**
```solidity
function invariant_slippageBounds() public view {
    // Verify slippage setting is within allowed range
    uint16 slip = vault.slippageBps();
    assertGe(slip, vault.MIN_SLIPPAGE_BPS());  // 0.1%
    assertLe(slip, vault.MAX_SLIPPAGE_BPS());  // 5%
}
```

---

### INV-13: Minimum Swap Value

**Property:**
```
∀ swap in rebalance:
  usdValue(swap) >= MIN_SWAP_USD OR swap is skipped
```

**Rationale:** Tiny swaps waste gas and create dust. Skip swaps below threshold.

**Enforcement:**
```solidity
uint256 public constant MIN_SWAP_USD = 1e18;  // $1

function _executeRebalanceSwaps(...) internal {
    for (uint8 i = 0; i < assetCount; i++) {
        if (abs(deltas[i]) < int256(MIN_SWAP_USD)) continue;  // Skip
        // Execute swap
    }
}
```

**Test:**
```solidity
function invariant_minSwapValue() public view {
    assertEq(vault.MIN_SWAP_USD(), 1e18);
}
```

---

## 6. Withdrawal Safety Invariants

### INV-14: Withdrawals Always Available

**Property:**
```
∀ state:
  owner can call withdrawAll() successfully
  (regardless of pause state)
```

**Rationale:** User must always be able to exit. Pause blocks deposits/rebalance but never withdrawals.

**Enforcement:**
```solidity
// Note: NO whenNotPaused modifier
function withdrawAll() external onlyOwner returns (uint256[] memory amounts) {
    amounts = new uint256[](assetCount);
    for (uint8 i = 0; i < assetCount; i++) {
        amounts[i] = IERC20(_assets[i]).balanceOf(address(this));
        if (amounts[i] > 0) {
            IERC20(_assets[i]).safeTransfer(owner, amounts[i]);
        }
    }
}
```

**Test:**
```solidity
function invariant_withdrawalAlwaysWorks() public {
    // Even when paused, owner can withdraw
    vault.pause();
    vm.prank(vault.owner());
    vault.withdrawAll();  // Should not revert
}
```

---

### INV-15: No Asset Leakage

**Property:**
```
∀ asset transfer out of vault:
  destination = owner OR destination = swapRouter (during swap)
```

**Rationale:** Assets only leave via owner withdrawal or DEX swap. No other exit paths.

**Enforcement:**
```solidity
// Only these functions transfer assets out:
// 1. withdraw* functions → transfer to owner
// 2. _swap* functions → transfer to swapRouter (gets asset back in return)
```

**Test:**
```solidity
function invariant_noLeakage() public {
    // Track all transfers out and verify destinations
    // This requires a comprehensive handler
}
```

---

## 7. Holdings Consistency Invariants

### INV-16: Holdings Match Balances

**Property:**
```
∀ state, ∀ i in [0, assetCount):
  holdings()[i] = IERC20(assets[i]).balanceOf(vault)
```

**Rationale:** Reported holdings must match actual token balances. No shadow accounting.

**Enforcement:**
```solidity
function holdings() external view returns (uint256[] memory balances) {
    balances = new uint256[](assetCount);
    for (uint8 i = 0; i < assetCount; i++) {
        balances[i] = IERC20(_assets[i]).balanceOf(address(this));
    }
}
```

**Test:**
```solidity
function invariant_holdingsMatchBalances() public view {
    uint256[] memory reported = vault.holdings();
    for (uint8 i = 0; i < vault.assetCount(); i++) {
        uint256 actual = IERC20(vault.assets(i)).balanceOf(address(vault));
        assertEq(reported[i], actual);
    }
}
```

---

### INV-17: Current Weights Sum to 100%

**Property:**
```
∀ state where totalValue > 0:
  Σ currentWeightsBps[i] for i in [0, assetCount) = 10000 (±1 for rounding)
```

**Rationale:** Current allocation percentages must sum to 100%.

**Enforcement:**
```solidity
function currentWeightsBps() public view returns (uint16[] memory weights) {
    weights = new uint16[](assetCount);
    uint256 totalValue = _totalUsdValue();
    if (totalValue == 0) return weights;  // All zeros

    uint256 sum = 0;
    for (uint8 i = 0; i < assetCount - 1; i++) {
        weights[i] = uint16((_assetUsdValue(i) * BPS_DENOMINATOR) / totalValue);
        sum += weights[i];
    }
    weights[assetCount - 1] = uint16(BPS_DENOMINATOR - sum);  // Remainder to last
}
```

**Test:**
```solidity
function invariant_currentWeightsSum() public view {
    uint16[] memory weights = vault.currentWeightsBps();
    uint256 sum = 0;
    for (uint8 i = 0; i < weights.length; i++) {
        sum += weights[i];
    }
    assertEq(sum, 10000);
}
```

---

## 8. Drift Calculation Invariants

### INV-18: Portfolio Drift is Maximum Asset Drift

**Property:**
```
∀ state:
  portfolioDriftBps() = max(assetDriftBps(i)) for all i
```

**Rationale:** Portfolio drift is defined as the maximum single-asset drift, not average or sum.

**Enforcement:**
```solidity
function portfolioDriftBps() public view returns (uint16) {
    uint16 maxDrift = 0;
    for (uint8 i = 0; i < assetCount; i++) {
        uint16 drift = assetDriftBps(i);
        if (drift > maxDrift) maxDrift = drift;
    }
    return maxDrift;
}
```

**Test:**
```solidity
function invariant_driftIsMax() public view {
    uint16 portfolio = vault.portfolioDriftBps();
    uint16 maxFound = 0;
    for (uint8 i = 0; i < vault.assetCount(); i++) {
        uint16 drift = vault.assetDriftBps(i);
        if (drift > maxFound) maxFound = drift;
    }
    assertEq(portfolio, maxFound);
}
```

---

### INV-19: Drift Threshold Bounds

**Property:**
```
∀ vault:
  MIN_DRIFT_BPS <= driftThresholdBps <= MAX_DRIFT_BPS
  (200 <= threshold <= 2000, i.e., 2% to 20%)
```

**Rationale:** Threshold must be within sensible bounds. Too low = excessive rebalancing. Too high = never rebalances.

**Enforcement:**
```solidity
constructor(..., uint16 _driftThresholdBps) {
    if (_driftThresholdBps < MIN_DRIFT_BPS || _driftThresholdBps > MAX_DRIFT_BPS) {
        revert InvalidDriftThreshold();
    }
    driftThresholdBps = _driftThresholdBps;
}
```

**Test:**
```solidity
function invariant_driftThresholdBounds() public view {
    uint16 threshold = vault.driftThresholdBps();
    assertGe(threshold, 200);   // 2%
    assertLe(threshold, 2000);  // 20%
}
```

---

## 9. Immutability Invariants

### INV-20: Critical Parameters Immutable

**Property:**
```
∀ vault, ∀ time t1, t2 where t2 > t1:
  assets[i](t1) = assets[i](t2)
  targetWeightsBps[i](t1) = targetWeightsBps[i](t2)
  priceFeeds[i](t1) = priceFeeds[i](t2)
  swapRouter(t1) = swapRouter(t2)
  driftThresholdBps(t1) = driftThresholdBps(t2)
```

**Rationale:** Critical configuration cannot change after deployment. Prevents owner from manipulating parameters.

**Enforcement:**
```solidity
// All declared as immutable
address[10] internal immutable _assets;
uint16[10] internal immutable _targetWeightsBps;
address[10] internal immutable _priceFeeds;
ISwapRouter public immutable swapRouter;
uint16 public immutable driftThresholdBps;
```

**Test:**
```solidity
function invariant_immutableParams() public view {
    // Solidity enforces immutability at compile time
    // Test verifies values match deployment config
}
```

---

## Summary

| ID | Property | Critical | Test Priority |
|----|----------|----------|---------------|
| INV-01 | Weight sum = 10000 | Yes | HIGH |
| INV-02 | Min weight >= 100 | No | MEDIUM |
| INV-03 | Asset count 2-10 | Yes | HIGH |
| INV-04 | Stablecoin present | Yes | HIGH |
| INV-05 | Owner-only withdrawals | Yes | CRITICAL |
| INV-06 | Executor constraints | Yes | HIGH |
| INV-07 | Two-step ownership | No | MEDIUM |
| INV-08 | No residual approvals | Yes | CRITICAL |
| INV-09 | All oracles fresh | Yes | HIGH |
| INV-10 | Staleness thresholds | No | LOW |
| INV-11 | Drift threshold gating | Yes | HIGH |
| INV-12 | Slippage bounds | Yes | CRITICAL |
| INV-13 | Minimum swap value | No | LOW |
| INV-14 | Withdrawals always work | Yes | CRITICAL |
| INV-15 | No asset leakage | Yes | CRITICAL |
| INV-16 | Holdings match balances | No | MEDIUM |
| INV-17 | Current weights sum 100% | No | MEDIUM |
| INV-18 | Portfolio drift = max | No | MEDIUM |
| INV-19 | Drift threshold bounds | No | LOW |
| INV-20 | Immutable params | Yes | HIGH |

---

## Implementation Notes

1. **All CRITICAL invariants** must have corresponding Foundry invariant tests
2. **HIGH priority invariants** should have both unit and invariant tests
3. **MEDIUM/LOW priority** can be unit tests only
4. Invariant test runs: 10,000+ per property
5. Handler contract should simulate realistic user behavior

---

*This document is a specification. Tests must be written to verify these properties.*
