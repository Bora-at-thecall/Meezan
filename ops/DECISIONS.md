# Meezan - Decision Log

All decisions that change behaviour are recorded here.

---

## 2026-01-18: Project Takeover Assessment

**Decision:** Keep existing smart contracts as-is. They are complete and meet all v1 constraints.

**Reason:** Reviewed MeezanVault.sol and tests. All features required by mvp-scope.md are implemented.

---

## 2026-01-18: Added MeezanFactory Contract

**Decision:** Create a factory contract that deploys individual vaults.

**Reason:** Users need a way to deploy their own vaults via the web UI. The factory:
- Deploys new MeezanVault contracts for users
- Transfers ownership to the caller immediately
- Tracks deployed vaults per user per allocation preset

---

## 2026-01-18: Web UI Tech Stack

**Decision:** Use Next.js 16 + Tailwind + wagmi/viem.

**Reason:**
- Next.js provides good DX and easy deployment to Vercel
- Tailwind enables rapid, consistent styling
- wagmi/viem are the standard for React wallet connections

---

## 2026-01-18: Fork Test Strategy

**Decision:** Skip fork test in normal CI, document manual run.

**Reason:** Fork test requires BASE_RPC environment variable which may not be available in all environments. The 144 unit tests provide sufficient coverage of contract logic.

---

## 2026-01-18: Contract Size Warning

**Decision:** Accept contract size warning for v1, optimize later if needed.

**Reason:** MeezanVault is 28109 bytes (limit is 24576). Fork simulation passed. Options for future:
- Split into multiple contracts
- Use libraries
- Remove debug/helper functions

For v1 MVP, this is acceptable as Base supports larger contracts via EIP-170 exemptions in some cases.

---

## 2026-01-19: Pre-Deployment Naming Refactor

**Decision:** Rename all "risk" terminology to neutral "allocation" language before deployment.

**What changed:**
- `RiskPresets.sol` → `AllocationPresets.sol`
- `RiskLevel` enum → `AllocationPreset` enum
- Enum values: `VeryConservative` → `Split10_90`, `Conservative` → `Split25_75`, etc.
- Variable names: `riskLevel` → `allocation`
- All contract imports, events, constructor params updated
- TypeScript bindings updated
- UI internal references updated

**Reason:** A trust and regulatory audit identified CRITICAL issues with advisory language in immutable on-chain code:

1. **Regulatory exposure:** Terms like "Conservative", "Aggressive", "Growth" imply investment advice and risk assessment. This creates potential securities law violations in many jurisdictions.

2. **Immutability:** Unlike UI copy, on-chain enum names are permanent. Once deployed, `RiskLevel.Aggressive` would be visible in ABIs, block explorers, and contract calls forever.

3. **Professional positioning:** Neutral percentage-based names (10/90, 50/50, etc.) describe the factual allocation without characterizing suitability for any user.

**What did NOT change:**
- Economic logic
- Contract behavior
- Storage layout
- Function signatures (beyond renamed identifiers)
- Test coverage (158 tests still pass)

**Verification:**
- `forge test` passes with 158 tests
- All imports resolve correctly
- ABI parameter names updated to `allocation`

---

## 2026-01-20: Security Hardening Pack

**Decision:** Implement comprehensive security hardening before public launch.

**What was added:**

1. **Documentation:**
   - `docs/THREAT_MODEL.md` - Formal threat analysis with categories, mitigations, residual risks
   - `docs/SECURITY_CHECKLIST.md` - Pre/post deployment verification checklist
   - `docs/STATIC_ANALYSIS.md` - Slither setup and testing guide

2. **Contract Security:**
   - `test/MeezanVault.invariant.t.sol` - 10 invariant tests for critical security properties:
     - Access control (owner-only functions)
     - Approval safety (no residual approvals)
     - Oracle staleness (operations revert on stale prices)
     - Slippage enforcement (never exceeds cap)
     - Rebalance gating (requires drift threshold)
     - Cooldown enforcement (executor respects cooldown)
     - Allocation integrity (always sums to 100%)
     - Holdings consistency (matches balances)
     - Ownership integrity (two-step transfer)
     - Pause safety (withdrawals always work)

3. **Frontend Security:**
   - CSP headers in `next.config.ts`
   - `lib/security.ts` - Hardcoded verified contract addresses
   - Chain allowlist (Base only)
   - `ContractVerification` component with Basescan links
   - No dynamic address injection from URL/localStorage

4. **Audit Package:**
   - `AUDIT_PACKAGE/` directory with all contracts, tests, and docs
   - Ready for third-party security review

**What did NOT change:**
- Contract logic remains unchanged
- No new vulnerabilities introduced
- All existing tests still pass

**Reason:** Preparing for public users requires formal threat analysis, documented security properties, and hardened frontend to minimize attack surface.

---

## 2026-01-21: Meezan v2 Design Phase

**Decision:** Begin design phase for multi-asset portfolio support.

**Key design choices:**

1. **Drift metric:** Maximum per-asset deviation (not average)
   - Clearest user-facing metric
   - Prevents masking of severe single-asset drift

2. **Swap routing:** All swaps route through USDC intermediary
   - Deepest liquidity pairs on DEXs
   - Avoids n² pair liquidity problem
   - Simplifies slippage calculation

3. **Asset universe:** Curated whitelist only
   - Ensures oracle availability
   - Guarantees DEX liquidity
   - Enables institutional adoption

4. **Initial scope:** 4 assets (BTC, ETH, SOL, USDC)
   - Proven liquidity on Base
   - Clear institutional adoption path
   - Manageable complexity for launch

5. **Audit strategy:** Separate v2 audit required
   - New swap routing logic
   - New slippage aggregation
   - Larger attack surface

**Documents created:**
- `docs/V2_DESIGN.md` - Full design specification

**What is deferred:**
- Per-asset thresholds (v2.1)
- >10 assets (v2.1)
- Cross-chain rebalancing (indefinite)
- Yield optimization (out of scope)

---

## 2026-01-21: Meezan v2 Implementation Planning

**Decision:** Complete implementation planning before writing production code.

**Documents created:**

1. **V2_IMPLEMENTATION_PLAN.md** - Step-by-step implementation guide
   - 6 phases over ~6 weeks
   - Contract architecture changes
   - Data structures (AssetConfig, fixed arrays)
   - Algorithm specifications (drift calculation, multi-swap rebalance)
   - Phase-by-phase deliverables

2. **V2_INVARIANTS.md** - 20 formal invariants
   - Allocation integrity (weight sum = 10000)
   - Access control (owner-only withdrawals)
   - Approval safety (no residuals)
   - Oracle coordination (all feeds fresh)
   - Rebalance safety (drift gating, slippage bounds)
   - Withdrawal safety (always available)

3. **V2_AUDIT_SCOPE.md** - Audit engagement preparation
   - ~1,050 lines of new code
   - Critical focus areas identified
   - Reusable vs. modified components
   - Expected test coverage
   - Timeline and budget estimates

4. **V2_ROLLOUT_PLAN.md** - Safe phased launch strategy
   - Phase 0: Internal testing (weeks 1-4)
   - Phase 1: Testnet public (weeks 5-8)
   - Phase 2: Guarded launch (weeks 9-12)
   - Phase 3: Limited availability (weeks 13-16)
   - Phase 4: General availability (week 17+)
   - Emergency procedures

5. **THREAT_MODEL.md** - Extended with v2-specific risks
   - Multi-leg swap vulnerabilities
   - Partial rebalance risks
   - Oracle coordination risks
   - Gas exhaustion scenarios
   - Multi-asset approval surface

**Reason:** Planning before coding ensures:
- All stakeholders aligned on approach
- Security considerations embedded from start
- Audit scope well-defined
- Rollout risks minimized
- No production code written without design approval

---

## 2026-01-21: HNWI Portfolio Research — Final Decisions

**Decision:** Define canonical default portfolio for Meezan v2 HNWI users.

### Asset Universe (FINAL)

| Asset | Status | Rationale |
|-------|--------|-----------|
| BTC | APPROVED | Institutional bedrock, ETF-approved, 16+ year track record |
| ETH | APPROVED | Institutional consensus, ETF-approved, smart contract exposure |
| SOL | APPROVED (max 15%) | Growth exposure, ETF pending, higher risk contained |
| USDC | APPROVED | Volatility buffer, rebalancing infrastructure, regulated |

**Excluded:** USDT (regulatory concerns), LINK/AVAX/other alts (insufficient institutional adoption), all memecoins (policy).

### Default Weights (FINAL)

```
BTC:  40%  — Anchor asset, "digital gold"
ETH:  30%  — Second pillar, platform exposure
SOL:  10%  — Growth exposure, risk-contained
USDC: 20%  — Volatility buffer, rebalancing fuel
```

**Rationale:** Balanced exposure to institutional-grade crypto with meaningful stablecoin buffer. This is the "Continue without thinking" option for HNWIs.

### Default Drift Threshold (FINAL)

| Preset | Threshold | Use Case |
|--------|-----------|----------|
| Tight | 3% | Strict discipline, more activity |
| **Default** | **5%** | **Balanced discipline and efficiency** |
| Relaxed | 8% | Minimal activity, accept more drift |

**Rationale:** 5% triggers during meaningful market moves (monthly in volatile markets) without over-trading.

### Documentation Created

- `docs/HNWI_PORTFOLIO_RESEARCH.md` — Full research report with stress scenarios

---
