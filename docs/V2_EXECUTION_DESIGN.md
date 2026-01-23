# Meezan v2 — Swap Execution Design

**Status:** LOCKED — AUDIT-READY
**Last Updated:** 2026-01-22
**Author:** Engineering
**Scope:** Phase 2 - Money-moving logic
**Security Review:** [V2_EXECUTION_REVIEW_FINAL.md](./V2_EXECUTION_REVIEW_FINAL.md)

> **LOCKED**: This execution strategy has been finalized and security-reviewed.
> Changes require explicit founder decision.

---

## 1. Overview

This document specifies the swap execution logic for MeezanVaultV2 rebalancing. This is **money-moving logic** and requires maximum conservatism.

**Design Principle:** Fail closed. If anything is wrong, revert the entire transaction.

---

## 2. Swap Ordering Rules

### 2.1 Two-Phase Execution

Rebalance executes in two strict phases:

```
PHASE 1: SELL OVERWEIGHT ASSETS → USDC
   For each asset i (excluding USDC):
     If delta[i] > MIN_SWAP_USD:
       Sell asset[i] → USDC

PHASE 2: BUY UNDERWEIGHT ASSETS ← USDC
   For each asset i (excluding USDC):
     If delta[i] < -MIN_SWAP_USD:
       Buy asset[i] ← USDC
```

### 2.2 Rationale

- **USDC accumulation first:** Selling overweight assets accumulates USDC in the vault
- **USDC spending second:** Buying underweight assets spends the accumulated USDC
- **Deterministic order:** Assets processed in index order (0, 1, 2, ...) for reproducibility
- **Skips stablecoin:** USDC (stablecoinIndex) is never swapped with itself

### 2.3 Order Within Phases

Assets are processed in ascending index order within each phase. This ensures:
- Deterministic gas consumption
- Reproducible behaviour in tests
- No priority manipulation

---

## 3. Maximum Swaps Per Rebalance

### 3.1 Hard Bounds

```solidity
uint8 public constant MAX_SWAPS_PER_REBALANCE = 18;
```

**Calculation:**
- Maximum assets: 10
- Maximum non-USDC assets: 9
- Maximum swaps: 9 sells + 9 buys = 18

### 3.2 Enforcement

```solidity
uint8 swapCount = 0;

// In Phase 1 (sells)
if (swapCount >= MAX_SWAPS_PER_REBALANCE) break;
_executeSell(...);
swapCount++;

// In Phase 2 (buys)
if (swapCount >= MAX_SWAPS_PER_REBALANCE) break;
_executeBuy(...);
swapCount++;
```

### 3.3 Behaviour When Cap Reached

If MAX_SWAPS_PER_REBALANCE is reached:
- **Current approach:** Stop processing, emit `RebalancePartial` event
- Remaining assets are not rebalanced in this call
- Owner/executor can call rebalance again if drift still exceeds threshold

---

## 4. USDC Intermediary Flow

### 4.1 Sell Flow (Asset → USDC)

```
Asset[i] Balance ─────┐
                      │
                      ▼
              ┌───────────────┐
              │ Calculate     │
              │ tokens to     │
              │ sell using    │
              │ oracle price  │
              └───────────────┘
                      │
                      ▼
              ┌───────────────┐
              │ Approve       │
              │ swap router   │
              │ (exact amount)│
              └───────────────┘
                      │
                      ▼
              ┌───────────────┐
              │ exactOutput-  │
              │ Single        │
              │ (get USDC)    │
              └───────────────┘
                      │
                      ▼
              ┌───────────────┐
              │ Revoke        │
              │ approval      │
              │ (set to 0)    │
              └───────────────┘
                      │
                      ▼
              USDC Balance Increased
```

### 4.2 Buy Flow (USDC → Asset)

```
USDC Balance ─────────┐
                      │
                      ▼
              ┌───────────────┐
              │ Calculate     │
              │ tokens to     │
              │ buy using     │
              │ oracle price  │
              └───────────────┘
                      │
                      ▼
              ┌───────────────┐
              │ Approve       │
              │ swap router   │
              │ (with slippage│
              │  buffer)      │
              └───────────────┘
                      │
                      ▼
              ┌───────────────┐
              │ exactOutput-  │
              │ Single        │
              │ (get asset)   │
              └───────────────┘
                      │
                      ▼
              ┌───────────────┐
              │ Revoke        │
              │ approval      │
              │ (set to 0)    │
              └───────────────┘
                      │
                      ▼
              Asset[i] Balance Increased
```

### 4.3 Swap Function: exactOutputSingle

We use `exactOutputSingle` (not `exactInputSingle`) because:
- We know the **target allocation** in USD terms
- We want a **precise output amount** (the tokens to acquire)
- We set `amountInMaximum` to enforce slippage

```solidity
ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter.ExactOutputSingleParams({
    tokenIn: sellToken,
    tokenOut: buyToken,
    fee: poolFee,
    recipient: address(this),
    amountOut: targetTokenAmount,
    amountInMaximum: maxInputWithSlippage,
    sqrtPriceLimitX96: 0
});

uint256 actualIn = swapRouter.exactOutputSingle(params);
```

---

## 5. Slippage Policy Per Leg

### 5.1 Per-Swap Slippage Calculation

Each swap enforces slippage independently:

```solidity
// Oracle-based expected cost
uint256 oracleBasedInput = _usdToTokenAmount(usdValue, assetIndex);

// Maximum input with slippage tolerance
uint256 maxInput = Math.mulDiv(oracleBasedInput, BPS_DENOMINATOR + slippageBps, BPS_DENOMINATOR);

// Execute swap with amountInMaximum = maxInput
// Router will revert if actual input exceeds maxInput
```

### 5.2 Slippage Bounds

```solidity
uint16 public constant MIN_SLIPPAGE_BPS = 10;   // 0.1%
uint16 public constant MAX_SLIPPAGE_BPS = 500;  // 5%
uint16 public constant DEFAULT_SLIPPAGE_BPS = 100; // 1%
```

### 5.3 No Aggregate Slippage Tracking

**Decision:** We do NOT track aggregate slippage across swaps.

**Rationale:**
- Each swap is independent
- Aggregate tracking adds complexity without clear benefit
- Per-swap limits are sufficient protection
- If one swap has high slippage, it reverts that swap (and entire tx)

---

## 6. Oracle Sanity Checks Per Leg

### 6.1 Pre-Swap Validation

Before each swap, we verify the oracle for that asset:

```solidity
function _executeSellToUsdc(uint8 assetIndex, uint256 usdValue) internal {
    // This call validates oracle freshness (reverts if stale)
    uint256 price = _getPrice(_priceFeeds[assetIndex], _getStalenessForAsset(assetIndex));

    // Calculate amounts using validated price
    uint256 tokensToSell = _usdToTokenAmount(usdValue, assetIndex, price);

    // ... execute swap
}
```

### 6.2 Staleness Thresholds

```solidity
uint32 public constant MAX_PRICE_STALENESS = 3600;        // 1 hour for volatile assets
uint32 public constant MAX_PRICE_STALENESS_STABLE = 90000; // 25 hours for USDC

function _getStalenessForAsset(uint8 index) internal view returns (uint32) {
    if (index == stablecoinIndex) {
        return MAX_PRICE_STALENESS_STABLE;
    }
    return MAX_PRICE_STALENESS;
}
```

### 6.3 Oracle Validation Checks

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

---

## 7. Gas Cap Behaviour

### 7.1 No Explicit Gas Cap

**Decision:** We do NOT implement explicit gas budgeting.

**Rationale:**
- Solidity's gas mechanics handle this automatically
- If gas runs out mid-transaction, entire tx reverts
- This is the "fail closed" behaviour we want
- Complex gas budgeting adds attack surface

### 7.2 Implicit Gas Protection

- Maximum 18 swaps bounds worst-case gas
- Each swap is bounded by router's gas requirements
- Out-of-gas reverts entire transaction (no partial state)

### 7.3 Future Consideration

If gas costs become problematic:
- Consider `gasleft()` check before each swap
- Emit `RebalancePartial` event if stopping early
- This is NOT implemented in v2.0

---

## 8. Partial Rebalance Semantics

### 8.1 Definition

**Partial rebalance** occurs when:
1. Some swaps complete but not all, OR
2. Some swaps are skipped due to dust threshold

### 8.2 Current Design: No Partial State

**In v2.0, partial rebalance means full revert.**

If any swap fails (slippage, oracle, balance), the entire transaction reverts.

### 8.3 Dust Threshold Handling

Swaps below MIN_SWAP_USD are **skipped**, not reverted:

```solidity
uint256 public constant MIN_SWAP_USD = 1e18; // $1 minimum

function _executeRebalanceSwaps(int256[] memory deltas) internal {
    // Phase 1: Sells
    for (uint8 i = 0; i < assetCount; i++) {
        if (i == stablecoinIndex) continue;

        // Skip dust (but don't revert)
        if (deltas[i] <= int256(MIN_SWAP_USD)) continue;

        _executeSellToUsdc(i, uint256(deltas[i]));
    }

    // Phase 2: Buys
    for (uint8 i = 0; i < assetCount; i++) {
        if (i == stablecoinIndex) continue;

        // Skip dust (but don't revert)
        if (deltas[i] >= -int256(MIN_SWAP_USD)) continue;

        _executeBuyFromUsdc(i, uint256(-deltas[i]));
    }
}
```

### 8.4 Post-Rebalance Drift

After rebalance, drift may not be zero due to:
1. Dust amounts skipped
2. Rounding in calculations
3. Price movement during execution

This is acceptable. The invariant is: **drift is reduced**, not **drift is zero**.

---

## 9. Failure Modes and Fail-Closed Behaviour

### 9.1 Failure Mode Table

| Failure | Detection | Response |
|---------|-----------|----------|
| Stale oracle (any asset) | `_getPrice()` reverts | Entire tx reverts |
| Invalid price (≤0) | `_getPrice()` reverts | Entire tx reverts |
| Incomplete round | `_getPrice()` reverts | Entire tx reverts |
| Slippage exceeded | Router reverts OR post-check | Entire tx reverts |
| Insufficient balance | Balance check before swap | Entire tx reverts |
| Approval failure | SafeERC20 reverts | Entire tx reverts |
| Swap router failure | Router reverts | Entire tx reverts |
| Out of gas | EVM reverts | Entire tx reverts |

### 9.2 Fail-Closed Principle

**Every failure mode results in full reversion.**

No partial state is ever committed. If the transaction succeeds, ALL of the following are true:
- All intended swaps executed
- All approvals are zero
- Portfolio is closer to target weights
- `lastRebalanceAt` is updated

### 9.3 Revert Hierarchy

```
rebalance()
├── portfolioDriftBps() < threshold → DriftBelowThreshold
├── totalUsdValue() == 0 → EmptyVault
├── cooldown check (executor) → CooldownNotElapsed
├── _executeRebalanceSwaps()
│   ├── _executeSellToUsdc() [per asset]
│   │   ├── _getPrice() → StalePrice/InvalidPrice/IncompleteRound
│   │   ├── balance check → InsufficientBalance
│   │   ├── forceApprove() → (SafeERC20 handles)
│   │   ├── router.exactOutputSingle() → SlippageExceeded (from router)
│   │   └── forceApprove(0) → (SafeERC20 handles)
│   └── _executeBuyFromUsdc() [per asset]
│       └── (same checks as sell)
└── SUCCESS: emit Rebalanced, update lastRebalanceAt
```

---

## 10. Approval Safety

### 10.1 Approval Pattern

```solidity
// BEFORE swap
IERC20(token).forceApprove(address(swapRouter), amount);

// EXECUTE swap
uint256 actualIn = swapRouter.exactOutputSingle(params);

// AFTER swap (ALWAYS, even if swap reverts it won't reach here)
IERC20(token).forceApprove(address(swapRouter), 0);
```

### 10.2 Why forceApprove?

`forceApprove` (from OpenZeppelin SafeERC20) handles:
- Tokens that require approval to be 0 before changing (USDT)
- Race condition protection
- Reverts on failure

### 10.3 Invariant: No Residual Approvals

After ANY operation (success or revert-and-catch), approvals must be zero.

Since we use revert-on-failure (no try/catch), this is guaranteed:
- If swap succeeds → approval set to 0 after
- If swap reverts → entire tx reverts, approval never persists

---

## 11. Event Emission

### 11.1 Success Event

```solidity
event Rebalanced(
    address indexed caller,
    uint16 preDriftBps,
    uint8 swapsExecuted,
    uint64 timestamp
);
```

### 11.2 Per-Swap Event

```solidity
event SwapExecuted(
    uint8 indexed assetIndex,
    bool isSell,  // true = sold to USDC, false = bought from USDC
    uint256 assetAmount,
    uint256 usdcAmount
);
```

---

## 12. Implementation Constraints

### 12.1 Must Have

- [x] nonReentrant on rebalance()
- [x] whenNotPaused on rebalance()
- [x] All oracle checks before each swap
- [x] Approval revocation after each swap
- [x] Slippage enforcement per swap
- [x] Dust threshold skipping

### 12.2 Must Not Have

- [ ] No try/catch around swaps (fail closed)
- [ ] No partial state commits
- [ ] No aggregate slippage tracking
- [ ] No explicit gas budgeting (v2.0)
- [ ] No swap ordering manipulation

---

## 13. Test Requirements

### 13.1 Deterministic Mock Router

The mock router must:
- Conserve value (output = input / exchange rate)
- Support multiple token pairs
- Track all swap calls for assertions
- Respect amountInMaximum (revert if exceeded)

### 13.2 Test Scenarios

1. **Basic multi-leg rebalance**
   - 4 assets, 2 overweight, 2 underweight
   - Verify sells before buys
   - Verify no asset leakage

2. **Dust threshold**
   - Small deltas below MIN_SWAP_USD
   - Verify swaps are skipped, not reverted

3. **Slippage enforcement**
   - Configure mock router with unfavorable rate
   - Verify revert on slippage exceeded

4. **Oracle staleness**
   - Set one oracle stale
   - Verify revert before any swaps

5. **Approval safety**
   - Verify all approvals are 0 after rebalance
   - Verify all approvals are 0 after reverted rebalance

6. **Partial drift reduction**
   - Verify drift decreases after rebalance
   - Verify weights move toward target

---

## 14. Security Considerations

### 14.1 Reentrancy

Protected by:
- `nonReentrant` modifier on rebalance()
- No external calls except to swap router
- No callbacks expected from router

### 14.2 Price Manipulation

Protected by:
- Chainlink oracle prices (not DEX prices)
- Staleness checks
- Per-swap slippage limits

### 14.3 Sandwich Attacks

Partially protected by:
- Per-swap slippage limits
- Exact output (not exact input)

Not protected against:
- Multi-block sandwich (oracle manipulation)
- This is accepted risk for v2.0

### 14.4 Approval Exploitation

Protected by:
- Approval revocation after every swap
- No residual approvals in any state

---

*This document is the implementation specification. Code must match this design.*
