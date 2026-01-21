# Meezan v2 — Audit Scope

**Status:** Planning Phase
**Last Updated:** 2026-01-21
**Target Audit:** Q2 2026

---

## 1. Executive Summary

Meezan v2 extends v1 from 2-asset to multi-asset (up to 10) portfolio management. This document defines the scope for a security audit of the v2 contracts.

**Key changes from v1:**
- Variable asset count (2-10 vs fixed 2)
- Multi-swap rebalancing (up to 18 swaps vs 1)
- All swaps route through USDC intermediary
- New drift calculation (max per-asset vs single comparison)
- Larger approval surface (10 tokens vs 2)

---

## 2. Contracts In Scope

### 2.1 New Contracts (Full Audit Required)

| Contract | LOC (est.) | Complexity | Description |
|----------|------------|------------|-------------|
| `MeezanVaultV2.sol` | ~900 | High | Multi-asset vault with rebalancing |
| `MeezanFactoryV2.sol` | ~150 | Medium | Factory for deploying v2 vaults |

**Total new code:** ~1,050 lines

### 2.2 Unchanged Contracts (Audit Not Required)

| Contract | Status | Notes |
|----------|--------|-------|
| `MeezanVault.sol` | Unchanged | v1 contract, previously reviewed |
| `MeezanFactory.sol` | Unchanged | v1 factory, previously reviewed |

### 2.3 Dependencies (Out of Scope)

| Dependency | Version | Notes |
|------------|---------|-------|
| OpenZeppelin | 5.0.x | Industry standard, audited |
| Chainlink | Latest | Aggregator interface only |
| Uniswap V3 | Deployed | ISwapRouter interface only |

---

## 3. Areas Requiring Audit Focus

### 3.1 CRITICAL: Multi-Swap Execution

**Location:** `MeezanVaultV2.sol::rebalance()`, `_executeRebalanceSwaps()`

**Risk:** Multi-swap introduces ordering attacks, intermediary manipulation, and approval residual risks.

**Audit Questions:**
1. Can swap ordering be manipulated to extract value?
2. Are all approvals zeroed after each swap (not just at end)?
3. Is the USDC intermediary balance protected between phases?
4. Can a failed swap leave the contract in a bad state?
5. Is reentrancy possible between swaps?

**Expected test coverage:** 100+ tests on rebalance logic

### 3.2 CRITICAL: Approval Safety

**Location:** `MeezanVaultV2.sol::_swapAssetToStablecoin()`, `_swapStablecoinToAsset()`

**Risk:** With 10 assets, there are 10 potential approval residuals instead of 2.

**Audit Questions:**
1. Is `forceApprove(0)` called unconditionally after every swap?
2. If a swap reverts, does the approval get cleaned up?
3. Are there any code paths that leave approvals non-zero?
4. Can an attacker force a specific approval to persist?

**Expected test coverage:** Invariant test for zero approvals post-operation

### 3.3 HIGH: Drift Calculation

**Location:** `MeezanVaultV2.sol::portfolioDriftBps()`, `assetDriftBps()`

**Risk:** Incorrect drift calculation could trigger unnecessary rebalances or prevent needed ones.

**Audit Questions:**
1. Is max-drift correctly calculated across all assets?
2. Are edge cases handled (empty vault, single asset dominant)?
3. Is rounding handled correctly for weight calculations?
4. Can drift be manipulated to trigger/prevent rebalancing?

**Expected test coverage:** Fuzz tests on weight combinations

### 3.4 HIGH: Oracle Coordination

**Location:** `MeezanVaultV2.sol::_getPrice()`, `_assetUsdValue()`

**Risk:** With multiple oracles, partial staleness or desync is more likely.

**Audit Questions:**
1. Are all oracles validated before any swap?
2. Is the staleness threshold appropriate per asset type?
3. Can an operation proceed with one stale oracle?
4. Are prices cached correctly (single read per rebalance)?

**Expected test coverage:** Tests for mixed oracle states

### 3.5 HIGH: Gas Exhaustion

**Location:** `MeezanVaultV2.sol::rebalance()`, `_executeRebalanceSwaps()`

**Risk:** Complex portfolios could exceed gas limits.

**Audit Questions:**
1. Is there a gas budget check before execution?
2. Does partial execution leave a valid state?
3. Can an attacker craft a portfolio that's impossible to rebalance?
4. Are gas costs documented for max-asset scenarios?

**Expected test coverage:** Gas benchmarks for 2, 5, 10 assets

### 3.6 MEDIUM: Constructor Validation

**Location:** `MeezanVaultV2.sol::constructor()`

**Risk:** Misconfigured deployment could create permanently broken vaults.

**Audit Questions:**
1. Are all asset addresses validated (non-zero, unique)?
2. Is weight sum enforced to be exactly 10000?
3. Is stablecoin presence verified?
4. Are pool fee tiers validated per asset?
5. Are oracle feed decimals validated?

**Expected test coverage:** Constructor fuzzing

### 3.7 MEDIUM: Partial Rebalance Handling

**Location:** `MeezanVaultV2.sol::_executeRebalanceSwaps()`

**Risk:** Partial completion could leave worse state than before.

**Audit Questions:**
1. Are swaps prioritized by deviation size?
2. Is the skip logic correct (MIN_SWAP_USD)?
3. Are events emitted for skipped swaps?
4. Can partial completion be exploited?

**Expected test coverage:** Tests with forced partial scenarios

---

## 4. What Can Be Reused from v1 Audit

### 4.1 Directly Reusable

| Component | Notes |
|-----------|-------|
| Access control pattern | Same onlyOwner, onlyOwnerOrExecutor |
| Two-step ownership | Identical implementation |
| Pause mechanism | Identical (deposits/rebalance blocked, withdrawals always work) |
| Slippage calculation | Same formula, applied per-swap |
| Oracle validation | Same checks, different staleness per asset type |
| SafeERC20 usage | Same patterns |

### 4.2 Modified (Requires Re-Audit)

| Component | v1 | v2 | Change |
|-----------|----|----|--------|
| Asset storage | 2 immutables | Array of 10 | Structure change |
| Drift calculation | Single comparison | Max across array | Algorithm change |
| Rebalance | 1 swap | Up to 18 swaps | Significant change |
| Approval pattern | 2 tokens | 10 tokens | Surface increase |

### 4.3 New (Full Audit)

| Component | Notes |
|-----------|-------|
| Array iteration | All asset loops |
| Phase separation | Sell phase / Buy phase |
| USDC intermediary | Central to all swaps |
| Partial execution | Skip logic |

---

## 5. Threat Model Coverage

The audit should verify mitigations for all threats in `docs/THREAT_MODEL.md`, particularly section 7 (v2 Specific Threats):

| Threat ID | Threat | Audit Focus |
|-----------|--------|-------------|
| 7.1.1 | Swap ordering attacks | Code review + testing |
| 7.1.2 | Intermediary manipulation | Reentrancy analysis |
| 7.1.3 | Swap count explosion | Gas analysis |
| 7.2.1 | Incomplete state | State machine analysis |
| 7.2.2 | Skipped swap exploit | Logic review |
| 7.3.1 | Partial oracle staleness | Oracle handling review |
| 7.3.2 | Oracle desync | Timing analysis |
| 7.4.1 | Gas limit exceeded | Gas benchmarking |
| 7.6.1 | Multiple approval residuals | **CRITICAL** - approval audit |
| 7.6.2 | Partial failure residual | Exception handling review |

---

## 6. Invariant Verification

The audit should verify all invariants in `docs/V2_INVARIANTS.md`:

### 6.1 CRITICAL Invariants (Must Verify)

| ID | Property |
|----|----------|
| INV-05 | Owner-only withdrawals |
| INV-08 | No residual approvals |
| INV-12 | Slippage bounds per swap |
| INV-14 | Withdrawals always work |
| INV-15 | No asset leakage |

### 6.2 HIGH Priority Invariants

| ID | Property |
|----|----------|
| INV-01 | Weight sum = 10000 |
| INV-03 | Asset count 2-10 |
| INV-04 | Stablecoin present |
| INV-06 | Executor constraints |
| INV-09 | All oracles fresh |
| INV-11 | Drift threshold gating |
| INV-20 | Immutable params |

---

## 7. Deliverables Expected

### 7.1 From Development Team (Pre-Audit)

- [ ] Complete `MeezanVaultV2.sol` source code
- [ ] Complete `MeezanFactoryV2.sol` source code
- [ ] 300+ unit tests (all passing)
- [ ] 20+ invariant tests (10,000 runs each)
- [ ] Gas benchmark report
- [ ] NatSpec documentation on all public functions
- [ ] Updated THREAT_MODEL.md
- [ ] Updated SECURITY_CHECKLIST.md
- [ ] Slither report (clean or documented exceptions)

### 7.2 From Audit Firm (Post-Audit)

- [ ] Full audit report with severity classifications
- [ ] Line-by-line code annotations
- [ ] Specific vulnerability findings with PoC
- [ ] Gas optimization recommendations
- [ ] Best practice recommendations
- [ ] Re-audit after fixes (if needed)

---

## 8. Audit Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Pre-Audit | 2 weeks | Final code freeze, documentation |
| Initial Audit | 3-4 weeks | Code review, testing, analysis |
| Fix Period | 1-2 weeks | Address findings |
| Re-Audit | 1 week | Verify fixes |
| Final Report | 1 week | Report finalization |

**Total estimated time:** 8-10 weeks

---

## 9. Audit Firm Selection Criteria

### 9.1 Required Experience

- [ ] DeFi vault/portfolio protocol audits
- [ ] Uniswap V3 integration audits
- [ ] Chainlink oracle integration audits
- [ ] Multi-swap/aggregator protocol audits
- [ ] Solidity 0.8.x experience

### 9.2 Preferred Auditors

| Firm | Notes |
|------|-------|
| Trail of Bits | Top tier, DeFi experience |
| OpenZeppelin | Library authors, deep Solidity knowledge |
| Spearbit | Strong researcher network |
| Consensys Diligence | Established, thorough |
| Code4rena | Competition-style, broad coverage |

---

## 10. Budget Estimate

| Item | Cost Range |
|------|------------|
| Initial audit (1,050 LOC) | $30,000 - $60,000 |
| Re-audit (fix verification) | $5,000 - $10,000 |
| Competition bonus (Code4rena) | $10,000 - $30,000 |
| **Total** | **$45,000 - $100,000** |

*Note: Costs vary significantly by firm and market conditions.*

---

## 11. Risk Acceptance

### 11.1 Acceptable Residual Risks (Post-Audit)

- MEV within slippage tolerance (inherent to DEX swaps)
- Oracle manipulation requiring significant capital
- User key compromise (self-custody responsibility)
- L2/bridge risks (external to Meezan)

### 11.2 Unacceptable Risks (Must Fix Before Launch)

- Any approval residual vulnerability
- Any access control bypass
- Any arithmetic overflow/underflow
- Any reentrancy vulnerability
- Any way to lock user funds

---

## 12. Post-Audit Actions

1. **Fix all CRITICAL findings** before any deployment
2. **Fix all HIGH findings** before mainnet
3. **Document all MEDIUM/LOW** findings with rationale if not fixed
4. **Publish audit report** on documentation site
5. **Bug bounty program** for ongoing security

---

*This document defines the audit scope. Actual audit engagement may adjust scope based on auditor recommendations.*
