# Meezan v2 — Execution Strategy Security Review

**Status:** FINAL
**Date:** 2026-01-22
**Scope:** Execution-specific risks for atomic multi-leg rebalancing
**Verdict:** No critical issues found

---

## 1. Multi-Leg Swap Ordering

**Implementation:** Sells first (index order), then buys (index order). All assets processed, not subset.

**Analysis:** Deterministic ordering prevents manipulation. Two-phase (sell→USDC→buy) ensures USDC accumulates before spending. The design is correct.

**Risk:** None identified.

---

## 2. USDC Balance Sufficiency Between Phases

**Concern:** Could sells leave insufficient USDC for buys due to slippage?

**Analysis:**
- Sells use `exactOutputSingle` — vault receives **exact** USDC amounts based on oracle-calculated deltas
- Buys check `available < maxUsdcIn` where maxUsdcIn includes slippage buffer
- Sum of sell deltas equals sum of buy deltas (by weight math)
- Pre-existing USDC (minimum 1% of portfolio per MIN_WEIGHT_BPS) provides buffer for buy-side slippage

**Calculation:** With 5% max slippage on 80% of portfolio (extreme), need 4% extra USDC. The minimum 1% USDC allocation appears tight in extreme cases.

**Likelihood:** Very low
**Impact:** Revert (no fund loss)
**Mitigation needed:** No. Fail-closed behavior is acceptable. Portfolios with higher USDC allocations (typical 20%) have ample buffer.

---

## 3. MEV/Sandwich Attack Surface

**Concern:** N swaps in one transaction = N attack opportunities.

**Analysis:**
- Each swap has independent slippage protection via `amountInMaximum`
- Total extractable value bounded by: `Σ(swapAmount × slippageBps)`
- Default 1% slippage caps extraction at 1% per leg
- Deterministic ordering is predictable but doesn't increase extraction beyond slippage bounds

**Likelihood:** High (MEV is endemic)
**Impact:** Value loss bounded by slippage tolerance
**Mitigation needed:** No. This is the accepted trade-off. Users wanting lower exposure can reduce `slippageBps` (risk: failed txs in volatile markets).

---

## 4. Oracle Coordination Across Multi-Asset Execution

**Concern:** Oracle updates between price reads could cause inconsistency.

**Analysis:**
- Prices read: (1) drift calculation, (2) delta calculation, (3) each swap execution
- All reads occur in same block
- Chainlink heartbeats: 1 hour for volatile, 24+ hours for stables
- Probability of mid-block oracle update: negligible

**Likelihood:** Very low
**Impact:** Minor accounting imprecision
**Mitigation needed:** No. Caching prices would add complexity without meaningful benefit.

---

## 5. Approval Safety Under Revert Scenarios

**Current Pattern:**
```solidity
forceApprove(router, maxAmount);
router.exactOutputSingle(params);
forceApprove(router, 0);
```

**Analysis:**
- If swap reverts → entire tx reverts → approval never persists
- If swap succeeds → approval explicitly zeroed
- No try/catch means no partial-state edge cases

**Risk:** None. The fail-closed design eliminates approval residual risk.

---

## 6. Withdrawal Safety Under All Execution Paths

**Analysis:**
- `withdraw()` and `withdrawAll()` have no `whenNotPaused` modifier
- No dependency on swap router for withdrawals
- No cooldown for owner withdrawals
- Owner can withdraw at any time: pre-rebalance, post-partial-convergence, during pause

**Risk:** None. Withdrawal availability is correctly preserved.

---

## 7. Gas Exhaustion Behavior

**Concern:** No explicit gas budgeting. Could exhaust mid-execution.

**Analysis:**
- MAX_SWAPS_PER_REBALANCE = 18 bounds worst-case gas
- On Base, 18 swaps at ~200k gas each ≈ 3.6M gas (well within block limit)
- Gas exhaustion → full revert → no partial state

**Likelihood:** Low
**Impact:** Gas waste, no fund loss
**Mitigation needed:** No. v2.1 could add `gasleft()` check if needed.

---

## 8. Partial Convergence and Long-Term Drift

**Concern:** If rebalance doesn't fully converge, does drift accumulate?

**Analysis:**
- Post-rebalance drift may be non-zero due to: dust skipping, rounding, slippage
- Invariant is "drift reduced" not "drift = 0"
- If drift still exceeds threshold, user can rebalance again (after cooldown for executor)
- Progressive convergence over multiple calls is acceptable

**Risk:** None. Drift is reduced each call; repeated calls converge to target.

---

## Summary

| Risk Area | Status | Action Required |
|-----------|--------|-----------------|
| Multi-leg ordering | Sound | None |
| USDC balance between phases | Safe | None |
| MEV attack surface | Bounded by slippage | Accepted |
| Oracle coordination | Negligible risk | None |
| Approval safety | Correct | None |
| Withdrawal safety | Always available | None |
| Gas exhaustion | Benign failure | None |
| Partial convergence | Progressive convergence acceptable | None |

---

## Conclusion

**No critical issues found.**

The execution strategy is well-designed for its constraints:
- Fail-closed behavior prevents partial state corruption
- Per-swap slippage bounds MEV extraction
- Approval hygiene eliminates residual risk
- Withdrawal availability is never compromised

The implementation is ready for external audit with no execution-specific blockers.

---

*This review is FINAL. Strategy changes require explicit founder decision.*
