# Meezan v2 — Multi-Asset Portfolio Balance Engine

**Status:** Design Phase
**Author:** Protocol Architect
**Date:** 2026-01-21
**Version:** Draft 1.0

---

## Executive Summary

Meezan v2 extends the proven v1 two-asset rebalancing engine to support multi-asset portfolios of up to 10 curated institutional-grade digital assets. This document defines the portfolio model, deviation semantics, asset criteria, user experience, and safety boundaries.

**Key Design Principle:** Meezan is a balance engine, not a trading system. Every design decision optimizes for simplicity, predictability, and user sovereignty over their allocation.

---

## 1. Multi-Asset Portfolio Model

### 1.1 Weight Representation

Weights are represented in basis points (bps) summing to 10,000 (100%).

```
Portfolio = {
  asset[0]: weight_bps[0],  // e.g., BTC: 4000 (40%)
  asset[1]: weight_bps[1],  // e.g., ETH: 3000 (30%)
  asset[2]: weight_bps[2],  // e.g., USDC: 2000 (20%)
  asset[3]: weight_bps[3],  // e.g., SOL: 1000 (10%)
}

Invariant: Σ weight_bps[i] = 10000
```

**Minimum weight per asset:** 100 bps (1%)
**Maximum assets per portfolio:** 10 (initial launch), expandable to 15

**Rationale:**
- Basis points provide sufficient granularity without floating-point complexity
- 1% minimum prevents dust positions that cost more to rebalance than they're worth
- 10-asset limit bounds gas costs and rebalance complexity

### 1.2 Drift Calculation

**Per-asset drift** is the absolute deviation from target:

```
drift_bps[i] = |current_weight_bps[i] - target_weight_bps[i]|
```

**Portfolio drift** is defined as the **maximum per-asset drift**:

```
portfolio_drift_bps = max(drift_bps[i]) for all i
```

**Alternative considered:** Average drift (Σ drift_bps[i] / n)
- Rejected because average masks severe single-asset deviations
- A 50% BTC drift averaged with nine 0% drifts = 5% average, but portfolio is severely unbalanced

**Alternative considered:** Sum of absolute deviations
- Rejected because it scales with asset count
- A 10-asset portfolio with 1% drift each = 10% total, but each asset is fine

**Decision:** Max-drift is the clearest, most intuitive measure. "Your portfolio is 7% off target" means at least one asset is 7% off.

### 1.3 Rebalance Trigger

A rebalance is triggered when:

```
portfolio_drift_bps >= user_threshold_bps
```

**Default threshold:** 500 bps (5%)
**Minimum threshold:** 200 bps (2%)
**Maximum threshold:** 2000 bps (20%)

**Additional trigger constraints:**
- Cooldown period: 12 hours (executor) / none (owner)
- Oracle health: All required feeds must be fresh
- Minimum rebalance value: $10 USD equivalent per trade

### 1.4 Rebalance Execution Model

**Strategy: Incremental Multi-Trade Rebalance**

Each rebalance executes a sequence of swaps to restore target weights. The algorithm:

```
1. Calculate current USD value of each asset
2. Calculate target USD value of each asset
3. Identify overweight assets (sell candidates)
4. Identify underweight assets (buy candidates)
5. Execute swaps from overweight → underweight via stablecoin intermediary
```

**Trade Routing:**
- All swaps route through USDC as the intermediary
- Example: BTC overweight, SOL underweight
  - Trade 1: Sell excess BTC → USDC
  - Trade 2: Buy SOL deficit ← USDC

**Rationale for USDC intermediary:**
- Deepest liquidity pairs on DEXs are X/USDC
- Avoids needing liquidity for every asset pair (n² problem)
- Simplifies slippage calculation
- USDC provides stable reference for value calculations

**Maximum trades per rebalance:** 2 × (n-1) where n = number of assets
- Worst case: Every asset except one is off-target
- Realistic case: 2-4 trades per rebalance

**Gas budget:** Configurable, default 500,000 gas units
- If estimated gas exceeds budget, rebalance is deferred
- User can increase gas budget for complex portfolios

---

## 2. Deviation Semantics

### 2.1 What Does "3% Drift" Mean?

**Definition:** At least one asset is 3 percentage points away from its target weight.

**Example:**
```
Target:  BTC 40%, ETH 30%, USDC 20%, SOL 10%
Current: BTC 43%, ETH 30%, USDC 17%, SOL 10%

BTC drift: |43 - 40| = 3%
ETH drift: |30 - 30| = 0%
USDC drift: |20 - 17| = 3%
SOL drift: |10 - 10| = 0%

Portfolio drift = max(3, 0, 3, 0) = 3%
```

**User-facing language:** "Your BTC allocation has drifted 3% above target"

### 2.2 Per-Asset vs Portfolio Threshold

**Design Decision:** Single portfolio-level threshold (user-configurable)

**Why not per-asset thresholds?**
- Increases complexity exponentially
- Users struggle to reason about 10 separate thresholds
- Creates race conditions (which asset rebalances first?)
- Gas-inefficient (multiple partial rebalances vs one comprehensive one)

**Exception for v2.1+:** Allow users to mark specific assets as "strict" (tighter threshold) or "flexible" (looser threshold) as multipliers on the portfolio threshold.

### 2.3 Minimum Meaningful Deviation

**Minimum drift threshold:** 200 bps (2%)

**Below 2% is impractical because:**
- Gas costs exceed rebalancing benefit
- Slippage may exceed the drift being corrected
- Oracle precision limits meaningful sub-2% measurements
- Creates churn without improving portfolio health

**Recommended defaults by portfolio size:**
- 2-3 assets: 3% threshold (more volatile)
- 4-6 assets: 5% threshold (balanced)
- 7-10 assets: 7% threshold (allow more variance)

---

## 3. Asset Inclusion Criteria

### 3.1 Curated Asset Universe

Meezan v2 launches with a **curated whitelist** of 10-15 assets. Users cannot add arbitrary tokens.

**Rationale:**
- Ensures oracle availability and reliability
- Guarantees DEX liquidity for rebalancing
- Prevents scam tokens, rug pulls, low-quality assets
- Enables institutional adoption (compliance teams can review the list)
- Simplifies UX (users choose from vetted options)

### 3.2 Liquidity Requirements

**Minimum DEX liquidity:** $5M USD in primary pool
**Minimum daily volume:** $1M USD (30-day average)
**Pool depth test:** $100K swap must have <2% slippage

**Measurement methodology:**
- Aggregate across Uniswap, Aerodrome, and other major Base DEXs
- Monthly review of liquidity conditions
- Automatic circuit breaker if liquidity drops below 50% of threshold

### 3.3 Oracle Requirements

**Primary oracle:** Chainlink price feed on Base
- Must exist and be actively maintained
- Heartbeat: ≤1 hour for volatile assets, ≤24 hours for stablecoins
- Minimum 3 data sources aggregated

**Fallback oracle:** Uniswap TWAP (30-minute window)
- Used only for price verification, not primary pricing
- Triggers alert if >5% deviation from Chainlink

**No oracle = No inclusion**

### 3.4 Institutional Adoption Signals

**Required (at least 2 of 4):**
1. Spot ETF approved or pending in major jurisdiction (US, EU, HK)
2. Custody support by 2+ qualified custodians (Coinbase, Anchorage, BitGo, etc.)
3. Listed on 3+ regulated exchanges (Coinbase, Kraken, Gemini, etc.)
4. Market cap > $10B USD

**Excluded regardless of adoption:**
- Algorithmic stablecoins
- Rebasing tokens
- Governance tokens with <2 year track record
- Memecoins (even high market cap)

### 3.5 Initial Asset Universe (Proposed)

| Tier | Assets | Rationale |
|------|--------|-----------|
| Core | BTC, ETH | Institutional bedrock, ETF-approved |
| Stable | USDC, USDT | Liquidity, USD exposure |
| L1 | SOL | Institutional adoption, ETF pending |
| L2/Ecosystem | (deferred) | Wait for Base-native tokens |
| DeFi Blue Chips | (deferred) | Governance token complexity |

**v2.0 Launch Universe:** BTC, ETH, SOL, USDC (4 assets)
**v2.1 Expansion:** Add 2-3 more based on market conditions

### 3.6 Correlation Considerations

**Advisory only, not enforced:**
- UI shows correlation matrix to users
- Warns if portfolio is >80% correlated assets
- Suggests diversification, does not prevent allocation

**Rationale:** Meezan does not give investment advice. Showing correlation data is educational; blocking user choices is paternalistic.

---

## 4. User Experience Rules

### 4.1 Portfolio Selection

**Primary flow: Template Selection**

```
┌─────────────────────────────────────────────────────────┐
│  Choose your starting point                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ○ Conservative                                         │
│    70% Stablecoins / 20% BTC / 10% ETH                 │
│                                                         │
│  ○ Balanced                                             │
│    40% BTC / 30% ETH / 20% Stablecoins / 10% SOL       │
│                                                         │
│  ○ Growth                                               │
│    50% BTC / 30% ETH / 15% SOL / 5% Stablecoins        │
│                                                         │
│  ○ Custom                                               │
│    Design your own allocation                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**IMPORTANT:** Template names are descriptive, not advisory. Copy is:
- "Conservative" → "Higher stablecoin allocation"
- "Growth" → "Higher volatile asset allocation"
- Never: "Recommended for risk-averse investors"

### 4.2 Default Presentation

**Defaults are suggestions, not recommendations:**

```
┌─────────────────────────────────────────────────────────┐
│  Allocation                                             │
│  ──────────────────────────────────────                │
│  BTC        [====40%====]  ▾                           │
│  ETH        [===30%===]    ▾                           │
│  USDC       [==20%==]      ▾                           │
│  SOL        [=10%=]        ▾                           │
│                                                         │
│  Rebalance when drift exceeds: [5%] ▾                  │
│                                                         │
│  [Continue]                                             │
└─────────────────────────────────────────────────────────┘
```

**All values are editable from the start.** No "advanced mode" toggle required.

### 4.3 Advanced User Controls

**Accessible via single tap/click, not hidden:**

| Control | Default | Range | Location |
|---------|---------|-------|----------|
| Drift threshold | 5% | 2-20% | Main allocation screen |
| Slippage tolerance | 1% | 0.1-5% | Settings |
| Gas budget | Auto | Manual override | Settings |
| Auto-rebalance | Off | On/Off | Settings |
| Executor address | None | User wallet | Settings |

### 4.4 Rule Explanation

**Every rule has a one-sentence explanation:**

- "Drift threshold: Meezan will suggest a rebalance when any asset is this far from its target."
- "Slippage tolerance: Maximum price impact allowed when swapping. Lower = better price, higher = more likely to succeed."
- "Auto-rebalance: If enabled, an authorized address can trigger rebalances without your signature."

**No jargon. No financial advice. Just mechanics.**

---

## 5. Safety and Complexity Boundaries

### 5.1 Explicitly Out of Scope for v2

| Feature | Reason for Exclusion |
|---------|---------------------|
| Arbitrary token addition | Oracle/liquidity risk |
| Cross-chain rebalancing | Bridge risk, complexity |
| Yield optimization | Meezan is not a yield aggregator |
| Leverage | Meezan is not a margin system |
| Token-weighted voting | Meezan is not a DAO |
| Social/copy portfolios | Meezan is not a social platform |
| Limit orders | Meezan is not a trading system |
| Stop losses | Meezan is not a trading system |
| Tax-loss harvesting | Meezan does not give tax advice |

### 5.2 Deferred to v2.1+

| Feature | Prerequisite |
|---------|--------------|
| >10 assets | Gas optimization, UI refinement |
| Per-asset thresholds | User research on demand |
| Time-weighted rebalancing | Executor infrastructure |
| Rebalance simulation | Subgraph integration |
| Portfolio history | Event indexing |
| Mobile app | Web app stability |

### 5.3 Gas Boundaries

**Maximum gas per rebalance:** 1,000,000 units (configurable)
**Estimated gas per swap:** ~150,000 units
**Maximum swaps per rebalance:** 6 (covers most 10-asset rebalances)

**If gas estimate exceeds limit:**
1. Rebalance the largest deviations first
2. Defer remaining to next rebalance
3. Emit partial rebalance event

### 5.4 Slippage Boundaries

**Per-swap slippage cap:** User-configured (default 1%, max 5%)
**Aggregate slippage tracking:** Sum across all swaps in rebalance

**If slippage would exceed tolerance:**
1. Reduce trade size to fit within tolerance
2. If still exceeds, skip that trade
3. Emit slippage-limited event

### 5.5 Failure Modes

| Failure | Behavior |
|---------|----------|
| Oracle stale | Revert entire rebalance |
| Insufficient liquidity | Skip that swap, continue others |
| Slippage exceeded | Skip that swap, continue others |
| Gas exceeded | Execute partial, emit event |
| Contract paused | All swaps blocked, withdrawals allowed |

**Invariant:** User can always withdraw all assets, regardless of system state.

---

## 6. Recommendation

### 6.1 Is v2 Feasible Without Compromising Safety?

**Yes, with constraints:**

1. **Limit initial asset count to 4-5** (BTC, ETH, SOL, USDC + 1 optional)
2. **Use USDC as swap intermediary** (simplifies routing)
3. **Keep single drift threshold** (defer per-asset thresholds)
4. **Curated asset list only** (no arbitrary tokens)

The core rebalancing logic is a natural extension of v1. The complexity is bounded by:
- Fixed asset universe (no arbitrary oracle/liquidity discovery)
- Single routing path (via USDC)
- Single threshold model
- Maximum 6 swaps per rebalance

### 6.2 Should v2 Be Audited Separately?

**Yes, absolutely.**

**Reasons:**
1. New swap routing logic (multi-hop)
2. New slippage aggregation logic
3. New partial rebalance handling
4. Larger attack surface (more tokens, more approvals)
5. Different gas cost profile

**Audit scope for v2:**
- Full re-audit of rebalance logic
- Focus on: swap ordering, approval safety, slippage accumulation
- Gas optimization review
- Invariant testing with 10-asset portfolios

**Do not deploy v2 to mainnet without independent audit.**

### 6.3 Recommended Initial Scope

**v2.0 Launch:**
- 4 assets: BTC, ETH, SOL, USDC
- Single drift threshold (5% default)
- USDC routing for all swaps
- Max 4 swaps per rebalance
- Same ownership/pause model as v1

**v2.1 (post-launch):**
- Add 2-3 assets based on liquidity/oracle availability
- Portfolio history and simulation
- Gas optimization based on mainnet data

**v2.2 (if demand):**
- Per-asset threshold multipliers
- Time-weighted rebalancing
- Executor improvements

---

## 7. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Meezan v2 Architecture                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐│
│  │   User Wallet   │────▶│  Meezan Vault   │────▶│  Asset Tokens   ││
│  │                 │     │   (per-user)    │     │  BTC,ETH,SOL,   ││
│  │                 │◀────│                 │◀────│  USDC           ││
│  └─────────────────┘     └────────┬────────┘     └─────────────────┘│
│                                   │                                  │
│                    ┌──────────────┼──────────────┐                  │
│                    │              │              │                  │
│                    ▼              ▼              ▼                  │
│          ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│          │  Chainlink  │  │  Uniswap    │  │  Factory    │         │
│          │  Oracles    │  │  Router     │  │  Contract   │         │
│          │  (n feeds)  │  │  (swaps)    │  │  (deploy)   │         │
│          └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Rebalance Flow:
───────────────
1. Check drift: max(|current[i] - target[i]|) >= threshold
2. Identify overweight assets (sell candidates)
3. Identify underweight assets (buy candidates)
4. For each overweight asset:
   a. Calculate excess USD value
   b. Swap excess → USDC
5. For each underweight asset:
   a. Calculate deficit USD value
   b. Swap USDC → asset
6. Emit Rebalanced event with all trade details
```

---

## 8. Open Questions for Discussion

1. **Should users be able to exclude assets from rebalancing?**
   - Use case: "Never sell my BTC, only rebalance other assets"
   - Risk: Creates asymmetric portfolios that can't fully rebalance

2. **Should there be a maximum portfolio value for v2 launch?**
   - Large portfolios may have liquidity impact
   - Could cap at $1M initially, remove after liquidity data

3. **How should rebalancing fees be handled for multi-swap?**
   - v1: Single swap fee
   - v2: Aggregate fee display before confirm

4. **Should partial rebalances be transparent or hidden?**
   - Transparent: User sees "Rebalanced 4/5 assets, 1 skipped due to slippage"
   - Hidden: User sees "Rebalanced successfully" (simpler, less accurate)

---

## 9. Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Drift metric | Max per-asset | Clearest, no masking of single-asset issues |
| Swap routing | Via USDC | Deepest liquidity, avoids n² pair problem |
| Asset universe | Curated | Oracle/liquidity safety, institutional trust |
| Initial assets | 4 (BTC,ETH,SOL,USDC) | Proven liquidity, clear institutional path |
| Threshold model | Single portfolio | Simplicity, defer per-asset to v2.1 |
| Audit strategy | Separate v2 audit | New attack surface, different complexity |

---

## 10. Next Steps

1. **Review this design with stakeholders**
2. **Validate liquidity assumptions on Base mainnet**
3. **Prototype swap routing logic in Foundry**
4. **Design invariant tests for multi-asset scenarios**
5. **Engage audit firm for v2 scope estimation**

---

*This document is a design proposal. No production code should be written until design is approved and audit scope is confirmed.*
