# Withdraw as USDC — Design Research

## Executive Summary

The safest design for v2 launch is **Option 6: Keep current withdraw + add optional "convert after"**. This preserves the "withdraw always works" invariant by keeping the existing withdrawal path unchanged, while offering a separate, optional conversion step that users can skip if swaps fail.

The atomic approach (Option 1) is attractive for UX but violates the core invariant: if any swap fails, the entire withdrawal reverts, potentially trapping user funds during oracle outages or liquidity crises.

---

## Design Options Analyzed

### Option 1 — Atomic Swap + Withdraw (Single Tx)

**How it works:**
- User calls `withdrawAllToUSDC()`
- Contract sells cbBTC → USDC via Uniswap
- Contract sells WETH → USDC via Uniswap
- Contract transfers all USDC to user
- If any swap reverts, entire transaction reverts

**Risks:**
- **Oracle failure:** Stale Chainlink price → swap reverts → withdrawal blocked
- **Liquidity crisis:** Thin pool liquidity → slippage exceeded → withdrawal blocked
- **Uniswap downtime:** Router unavailable → withdrawal blocked
- **Large positions:** $100K+ withdrawals may exceed pool depth

**Failure modes:**
- Swap slippage exceeded → revert
- Oracle staleness check fails → revert
- Uniswap pool depleted → revert
- User funds remain in vault (not lost, but stuck until conditions improve)

**User experience:**
- Simple: one button, one confirmation
- Failure is confusing: "Why can't I withdraw my money?"

**Security implications:**
- MEV exposure: sandwich attacks on both swaps
- Auditor concern: "Under what conditions can withdrawal fail?"

---

### Option 2 — Two-Step Withdrawal

**How it works:**
- Step 1: User calls `convertToUSDC()` — sells all assets to USDC
- Step 2: User calls `withdrawAll()` — withdraws USDC
- User controls timing between steps

**Risks:**
- Step 1 may fail (same risks as Option 1)
- User may forget to complete step 2
- Price movement between steps

**Failure modes:**
- Step 1 reverts → user still has original assets
- User can always call existing `withdrawAll()` to get assets as-is

**User experience:**
- Two wallet prompts
- Confusing state: "I converted but forgot to withdraw"
- Clear fallback: original withdraw always works

**Security implications:**
- Same MEV exposure as Option 1 for the conversion step
- Audit complexity: two code paths
- But: existing withdraw remains unchanged

---

### Option 3 — Partial Liquidation with Fallback

**How it works:**
- Attempt to sell cbBTC → USDC
- If fails, skip cbBTC (user receives cbBTC directly)
- Attempt to sell WETH → USDC
- If fails, skip WETH (user receives WETH directly)
- Transfer whatever was converted to USDC + unconverted assets

**Risks:**
- Unpredictable output: user doesn't know what they'll receive
- Partial success is confusing

**Failure modes:**
- None that block withdrawal
- Worst case: user receives assets as-is (same as current behavior)

**User experience:**
- Confusing: "I asked for USDC but got ETH too"
- Requires explanation of partial conversion
- Hard to predict gas costs

**Security implications:**
- Complex try/catch logic in Solidity
- Audit concern: edge cases in partial failure
- Lower MEV risk: attacker can't predict exact output

---

### Option 4 — User-Chosen Slippage Tiers

**How it works:**
- User selects slippage tolerance: Tight (0.5%), Standard (1%), Relaxed (3%)
- Higher slippage = higher chance swaps succeed
- Atomic execution with chosen slippage

**Risks:**
- User may not understand slippage
- High slippage = high MEV extraction opportunity
- Even 3% slippage may not be enough in crisis

**Failure modes:**
- Still reverts if slippage exceeded
- Doesn't solve oracle failure
- Doesn't solve liquidity crisis

**User experience:**
- Requires education: "What is slippage?"
- False sense of control
- Relaxed slippage may lose significant value

**Security implications:**
- MEV scales with slippage tolerance
- User may select high slippage and lose 3%+ to MEV
- Audit concern: user-chosen parameters affecting outcomes

---

### Option 5 — Off-Chain Intent + On-Chain Execution

**How it works:**
- User signs off-chain intent: "Withdraw my vault to USDC"
- Executor (keeper/relayer) monitors for optimal execution
- Executor calls on-chain settlement
- User receives USDC

**Risks:**
- Requires trusted executor or complex verification
- MEV risk shifts to executor
- Liveness dependency: executor must be online
- Custodial feel: "Who is executing my transaction?"

**Failure modes:**
- Executor offline → user must manually withdraw
- Intent expires → user must re-sign
- Settlement fails → complex dispute resolution

**User experience:**
- Potentially better execution (executor waits for good conditions)
- But: feels less trustless
- Requires fallback to manual withdrawal

**Security implications:**
- Significant audit complexity
- Trust assumptions about executor
- Cross-domain security (off-chain + on-chain)
- Not suitable for v2 launch

---

### Option 6 — Keep Current Withdraw + Add Optional "Convert After"

**How it works:**
- Existing `withdrawAll()` unchanged: user receives cbBTC + WETH + USDC
- New optional helper: `swapToUSDC()` — user can swap assets in their wallet
- Or: frontend integrates Uniswap/1inch widget for conversion
- Vault contract doesn't change withdrawal path

**Risks:**
- User receives multiple tokens (current behavior)
- Conversion is user's responsibility
- May require multiple transactions

**Failure modes:**
- Withdrawal: none (always works)
- Conversion: if it fails, user still has their assets in wallet

**User experience:**
- Two steps: withdraw, then convert
- But: withdrawal ALWAYS succeeds
- User has full control over conversion timing/method

**Security implications:**
- No new vault code for withdrawal
- Conversion happens outside vault (user's wallet)
- Minimal audit surface
- MEV happens outside our contracts (user's choice)

---

## Design Comparison Table

| Criterion | Opt 1: Atomic | Opt 2: Two-Step | Opt 3: Partial | Opt 4: Slippage | Opt 5: Intent | Opt 6: Convert After |
|-----------|---------------|-----------------|----------------|-----------------|---------------|---------------------|
| **Loss-of-funds risk** | Medium | Low | Low | Medium | Medium | **Low** |
| **MEV exposure** | High | High | Medium | High | Medium | **Low** (external) |
| **Likelihood of revert** | Medium | Medium | **Low** | Medium | Low | **None** |
| **UX simplicity** | High | Medium | Low | Medium | Medium | Medium |
| **Audit complexity** | Medium | Medium | High | Medium | **Very High** | **Low** |
| **"Withdraw always works"** | **NO** | YES (fallback) | YES | **NO** | YES (manual) | **YES** |
| **Suitable for v2 launch** | No | Maybe | No | No | No | **YES** |
| **Suitable for v3+** | Maybe | Yes | No | Maybe | Yes | N/A |

---

## Recommendation for v2 Launch

### Recommended Design: Option 6 — Keep Current Withdraw + Add Optional "Convert After"

**Rationale:**

1. **Preserves core invariant:** Withdrawal ALWAYS works. No swap failure can block access to funds.

2. **Zero new withdrawal code:** Existing `withdrawAll()` is unchanged. No audit risk on the critical path.

3. **Conversion is optional and external:** User receives their assets, then converts in their own wallet using Uniswap/1inch/Coinbase. Failure at this stage doesn't affect Meezan.

4. **Understandable to users:** "Withdraw gives you your assets. Convert them separately if you want USDC."

5. **Auditable:** Auditor only needs to verify `withdrawAll()` still works. No new failure modes.

6. **Fail-closed:** If anything unexpected happens, user has their assets.

**Implementation approach (frontend only, no contract change):**
- Withdrawal dialog says: "You will receive: 0.001 cbBTC, 0.05 WETH, 50 USDC"
- After withdrawal success: "Convert to USDC?" button opens Uniswap widget
- User does conversion in their wallet, not in vault

---

### Designs Acceptable for v3+

| Design | When to Consider |
|--------|------------------|
| Option 2 (Two-Step) | After audit, with explicit "I understand conversion may fail" checkbox |
| Option 5 (Intent) | After ERC-4337 adoption, with trusted relayer infrastructure |
| Option 1 (Atomic) | Only if we add a MANDATORY fallback: "If swap fails, return assets as-is" |

### Designs to NEVER Implement

| Design | Reason |
|--------|--------|
| Option 1 without fallback | Violates "withdraw always works" |
| Option 4 (user slippage) | Invites user error, high MEV exposure |
| Option 3 (partial) | Too unpredictable, confusing UX |
| Any design requiring external executor without manual fallback | Trust assumption |

---

## UX Copy Requirements

### For Option 6 (Recommended Design)

**Before user confirms withdrawal:**

```
Withdraw all funds

You will receive:
- 0.00123 cbBTC (~$120)
- 0.0456 WETH (~$150)
- 52.34 USDC

Total: ~$322

These assets will be sent directly to your wallet.

[Withdraw]
```

**After successful withdrawal:**

```
Withdrawal complete

Your assets are now in your wallet:
- 0.00123 cbBTC
- 0.0456 WETH
- 52.34 USDC

Want USDC only?
[Convert on Uniswap] <- Opens Uniswap in new tab

Your funds are safe in your wallet.
You can convert them anytime.
```

**If conversion is offered in-app (Uniswap widget):**

```
Convert to USDC (optional)

This will swap your cbBTC and WETH to USDC.
- Estimated output: ~$270 USDC
- Slippage: up to 1%
- Network fee: ~$0.50

If this fails, your assets remain in your wallet.
You can always convert later on Uniswap.

[Convert now]  [Skip]
```

**Required warnings:**

1. "Conversion may fail if market conditions change. Your assets will remain in your wallet."
2. "Conversion is optional. You can keep your assets or convert later."
3. No mention of "stuck" or "locked" — assets are always accessible.

**Fallback action always visible:**

Every screen must have: `[View assets in wallet]` link that opens wallet or Basescan.

**Explaining failure without panic:**

If conversion fails:
```
Conversion didn't complete

Market conditions changed. Your assets are safe in your wallet.

What you can do:
- Try again later when markets are calmer
- Convert manually on Uniswap
- Keep your assets as they are

[View wallet]  [Try again]
```

---

## Do NOT Do List

1. **Do NOT implement atomic withdraw-to-USDC without a fallback** — violates core invariant
2. **Do NOT let swap failure block withdrawal** — funds must always be accessible
3. **Do NOT expose user-selectable slippage for withdrawals** — invites errors and MEV
4. **Do NOT add complex try/catch partial liquidation** — unpredictable, hard to audit
5. **Do NOT require off-chain infrastructure for withdrawals** — liveness dependency
6. **Do NOT use language like "stuck" or "locked"** — causes panic
7. **Do NOT hide the fallback option** — manual asset withdrawal must always be visible

---

## Final Decision

**For v2 launch:**
- Keep `withdrawAll()` unchanged (returns assets as-is)
- Add frontend-only "Convert on Uniswap" button after withdrawal
- No contract changes for this feature
- Zero audit risk for withdrawal path

**Core principle:** The user's ability to withdraw their funds must never depend on external conditions (oracle health, pool liquidity, swap success). Conversion to USDC is a convenience feature, not a requirement.
