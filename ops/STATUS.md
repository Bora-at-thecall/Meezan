# Meezan v1 - Deployment Status

**Last Updated:** 2026-01-22
**Status:** DEPLOYED TO BASE MAINNET

---

## Deployed Contracts

| Contract | Address | Verified |
|----------|---------|----------|
| MeezanFactory | `0x9FfD7a7dd2C730f1E85643868B645778feDF4f8b` | Sourcify ✓ |

**Deployment Transaction:** `0xe9d5ec88f0a47a9650f4971879e4dd1680d23e6fa8822f15de49c945a993a555`
**Block:** 40,992,707
**Gas Used:** 3,216,866
**Cost:** 0.000014 ETH

---

## Pre-Deployment Audit Checklist

### 1. Smart Contracts ✓

| Item | Status | Notes |
|------|--------|-------|
| MeezanVault.sol compiles | ✓ PASS | Solc 0.8.33 |
| MeezanFactory.sol compiles | ✓ PASS | Solc 0.8.33 |
| AllocationPresets.sol compiles | ✓ PASS | Neutral naming |
| Unit tests pass | ✓ PASS | 158/158 tests |
| No advisory language in contracts | ✓ PASS | Refactored 2026-01-19 |
| No RiskLevel/Conservative/Aggressive | ✓ PASS | All renamed to AllocationPreset |
| Reentrancy protection | ✓ PASS | nonReentrant on all money-moving functions |
| Ownership model | ✓ PASS | Two-step transfer, single owner |
| Pausable | ✓ PASS | Owner-only emergency pause |
| Slippage protection | ✓ PASS | 1% cap, configurable |
| Oracle staleness check | ✓ PASS | 1-hour max staleness |
| Dust threshold | ✓ PASS | $10 minimum swap |
| Contract size (via_ir optimizer) | ✓ PASS | Factory: 14,737 B, Vault: 11,671 B |

### 2. Addresses & Configuration ✓

| Item | Value | Verified |
|------|-------|----------|
| MeezanFactory | `0x9FfD7a7dd2C730f1E85643868B645778feDF4f8b` | ✓ |
| cbBTC (Token A) | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` | ✓ |
| USDC (Token B) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | ✓ |
| cbBTC/USD Feed | `0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D` | ✓ |
| USDC/USD Feed | `0x7e860098F58bBFC8648a4311b374B1D669a2bc6B` | ✓ |
| Uniswap Router | `0x2626664c2603336E57B271c5C0b26F421741e481` | ✓ |
| Pool Fee | `500` (0.05%) | ✓ |
| Network | Base Mainnet (Chain ID 8453) | ✓ |

### 3. Web Application ✓

| Item | Status | Notes |
|------|--------|-------|
| npm run build | ✓ PASS | 5 routes generated |
| TypeScript compiles | ✓ PASS | No errors |
| No advisory language | ✓ PASS | Neutral terminology throughout |
| No yield/leverage/governance terms | ✓ PASS | Verified via grep |
| Withdraw always visible | ✓ PASS | Portfolio page line 135-141 |
| Technical details hidden by default | ✓ PASS | showTechnical = false |
| Network indicator shows Base | ✓ PASS | details/page.tsx line 199 |
| Basescan link present | ✓ PASS | details/page.tsx line 208 |
| Factory address configured | ✓ DONE | Updated in contracts.ts |

### 4. Documentation ✓

| Item | Status | Notes |
|------|--------|-------|
| README.md | ✓ DONE | Neutral, factual |
| DEPLOY.md | ✓ DONE | Instructions complete |
| ops/DECISIONS.md | ✓ DONE | All decisions logged |
| SECURITY.md | ✓ DONE | Created 2026-01-19 |
| DISCLAIMER.md | ✓ DONE | Created 2026-01-19 |
| LICENSE | ✓ DONE | MIT |

### 5. Security & Compliance ✓

| Item | Status | Notes |
|------|--------|-------|
| No secrets in code | ✓ PASS | Only placeholders |
| No private keys | ✓ PASS | Environment variables only |
| .gitignore complete | ✓ PASS | Excludes broadcast/, .env |
| No admin backdoors | ✓ PASS | Owner-only, no upgrades |
| No proxy patterns | ✓ PASS | Immutable deployment |

---

## Deployment Sequence

1. ✓ **[COMPLETE]** Deploy MeezanFactory to Base mainnet
2. ✓ **[COMPLETE]** Verify contracts on Sourcify
3. ✓ **[COMPLETE]** Update apps/web/lib/contracts.ts with factory address
4. ✓ **[COMPLETE]** Create SECURITY.md
5. ✓ **[COMPLETE]** Create DISCLAIMER.md
6. ⏳ **[PENDING]** Commit all changes
7. ⏳ **[PENDING]** Declare v1 ready

---

## Test Results Summary

```
╭───────────────────┬────────┬────────┬─────────╮
│ Test Suite        │ Passed │ Failed │ Skipped │
╞═══════════════════╪════════╪════════╪═════════╡
│ MeezanFactoryTest │ 14     │ 0      │ 0       │
├───────────────────┼────────┼────────┼─────────┤
│ MeezanVaultTest   │ 144    │ 0      │ 0       │
╰───────────────────┴────────┴────────┴─────────╯

Total: 158 tests passed
```

---

## UX State Diagram

### Onboarding Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Welcome   │ ──▶ │    Learn    │ ──▶ │   Connect   │
│  (Explain)  │     │ (Allocations│     │   Wallet    │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Connected  │
                                        │   (Home)    │
                                        └─────────────┘
```

### Deposit Flow (Chain-Verified)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Choose    │ ──▶ │   Enter     │ ──▶ │   Review    │
│ Allocation  │     │   Amount    │     │   Details   │
└─────────────┘     └─────────────┘     └─────────────┘
      │                   │                    │
      │ Progress: ████░░░░│ Progress: ████████░│ Progress: ████████████
      │                   │                    │
      ▼                   ▼                    ▼
                                        ┌─────────────┐
                                        │  Confirm    │
                                        └─────────────┘
                                               │
                                               ▼
                                  ┌───────────────────────┐
                                  │   Processing Screen   │
                                  │  (Live Step Status)   │
                                  └───────────────────────┘
```

### Transaction State Machine (Chain-Verified)

Each transaction step follows this strict sub-state sequence:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP: CREATE_VAULT | APPROVE_USDC | DEPOSIT                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────┐│
│  │  awaiting_   │───▶│ tx_submitted │───▶│ confirming_  │───▶│confirm-││
│  │   wallet     │    │   (hash)     │    │   onchain    │    │  ed    ││
│  └──────────────┘    └──────────────┘    └──────────────┘    └────────┘│
│        │                    │                   │                       │
│        │ User rejects       │ Tx fails          │ Verification fails   │
│        ▼                    ▼                   ▼                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                          ERROR                                   │   │
│  │  - Human-readable title                                          │   │
│  │  - Explanation message                                           │   │
│  │  - Suggested action                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Chain Verification Sequence

```
STEP 1: CREATE VAULT (if no existing vault)
  ├─ Check on-chain: factory.getVault(owner, allocation)
  ├─ If exists → skip to STEP 2
  ├─ If not exists:
  │     ├─ awaiting_wallet: "Confirm in your wallet"
  │     ├─ tx_submitted: writeContractAsync(factory.createVault)
  │     ├─ confirming_onchain: waitForTransactionReceipt
  │     ├─ VERIFY: Extract vault address from VaultDeployed event logs
  │     ├─ VERIFY: factory.getVault(owner, allocation) matches extracted
  │     └─ confirmed: vaultVerified = true
  │
  ▼
STEP 2: APPROVE USDC (if insufficient allowance)
  ├─ Check on-chain: usdc.allowance(owner, vault) >= depositAmount
  ├─ If sufficient → skip to STEP 3
  ├─ If insufficient:
  │     ├─ awaiting_wallet: "Confirm in your wallet"
  │     ├─ tx_submitted: writeContractAsync(usdc.approve)
  │     ├─ confirming_onchain: waitForTransactionReceipt
  │     ├─ VERIFY: usdc.allowance(owner, vault) >= depositAmount
  │     └─ confirmed: allowanceVerified = true
  │
  ▼
STEP 3: DEPOSIT
  ├─ awaiting_wallet: "Confirm in your wallet"
  ├─ tx_submitted: writeContractAsync(vault.depositUSDC)
  ├─ confirming_onchain: waitForTransactionReceipt
  ├─ VERIFY: vault.holdings() shows balances > 0
  └─ confirmed: depositVerified = true
  │
  ▼
SUCCESS → Store vault in localStorage → Redirect to /portfolio
```

**Critical Rules:**
- NEVER advance UI without chain verification
- NEVER assume transaction success without receipt
- NEVER skip allowance check even if approval was just submitted
- Extract vault address from VaultDeployed event logs, not localStorage
- All verification uses on-chain reads, not local state

### Error States

All transaction states can transition to error:

```
┌─────────────┐
│  Any State  │
└─────────────┘
       │
       │ Error occurs
       ▼
┌─────────────┐
│   Error     │  Shows:
│   Display   │  - Human-readable title
│             │  - Explanation
│             │  - Suggested action
└─────────────┘
       │
       │ User acknowledges
       ▼
┌─────────────┐
│   Review    │  (Retry from here)
└─────────────┘
```

### Portfolio Actions

```
┌─────────────────────────────────────────────────────┐
│                    Portfolio                         │
│  ┌─────────────────────────────────────────────┐    │
│  │              Total Value                     │    │
│  │              BTC / USDC split               │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │          [WITHDRAW ALL] ← Primary            │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ Deposit More │  │   Details    │ ← Secondary    │
│  └──────────────┘  └──────────────┘                 │
└─────────────────────────────────────────────────────┘
```

---

## Security Hardening (2026-01-20)

### Documentation

| Document | Status | Location |
|----------|--------|----------|
| THREAT_MODEL.md | COMPLETE | `/docs/` |
| SECURITY_CHECKLIST.md | COMPLETE | `/docs/` |
| STATIC_ANALYSIS.md | COMPLETE | `/docs/` |
| AUDIT_PACKAGE/ | COMPLETE | Root directory |

### Contract Security

| Item | Status | Notes |
|------|--------|-------|
| Invariant tests added | COMPLETE | 10 security properties |
| Access control verified | PASS | Owner-only functions protected |
| Approval safety verified | PASS | Zero approvals after ops |
| Oracle staleness verified | PASS | Reverts on stale prices |
| Slippage cap verified | PASS | Never exceeds configured limit |
| Rebalance gating verified | PASS | Requires drift >= threshold |

### Frontend Security

| Item | Status | Notes |
|------|--------|-------|
| Chain allowlist | COMPLETE | Base only (chain ID 8453) |
| CSP headers | COMPLETE | Added to next.config.ts |
| Hardcoded addresses | COMPLETE | In lib/security.ts |
| Basescan links | COMPLETE | ContractVerification component |
| No dynamic address injection | VERIFIED | Addresses from security.ts only |

---

## v1 Ready

Meezan v1 is deployed and operational on Base mainnet.

---

## v2 Implementation Planning (2026-01-21)

### Documentation Status

| Document | Status | Location |
|----------|--------|----------|
| V2_DESIGN.md | COMPLETE | `/docs/` |
| V2_IMPLEMENTATION_PLAN.md | COMPLETE | `/docs/` |
| V2_INVARIANTS.md | COMPLETE | `/docs/` |
| V2_AUDIT_SCOPE.md | COMPLETE | `/docs/` |
| V2_ROLLOUT_PLAN.md | COMPLETE | `/docs/` |
| THREAT_MODEL.md (v2 section) | COMPLETE | `/docs/` |
| V2_EXECUTION_DESIGN.md | **LOCKED** | `/docs/` |
| V2_EXECUTION_REVIEW_FINAL.md | **FINAL** | `/docs/` |

### v2 Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Drift metric | Max per-asset | Clearest, no masking of single-asset issues |
| Swap routing | All via USDC | Deepest liquidity, avoids n² pair problem |
| Asset universe | Curated whitelist | Oracle/liquidity safety, institutional trust |
| Initial assets | 3 (BTC, ETH, USDC) | Available on Base with deep liquidity |
| Threshold model | Single portfolio | Simplicity, defer per-asset to v2.1 |
| Audit strategy | Separate v2 audit required | New attack surface |
| Multi-chain | Deferred to v3 | Ship single-chain first, add Solana/Arbitrum later |

### Phase 1 Implementation (2026-01-21) ✅

**Commit:** `73d075b` on branch `v2-engine-phase1`

| Deliverable | Status | Notes |
|-------------|--------|-------|
| `MeezanVaultV2.sol` | COMPLETE | Multi-asset vault (2-10 assets) |
| `MeezanVaultV2.t.sol` | COMPLETE | 49 tests, all passing |
| Invariant coverage | COMPLETE | INV-01 through INV-19 tested |
| Stub rebalance | COMPLETE | Computes deltas, emits intent, no swaps |

**Test Results:**
```
MeezanVaultV2Test: 49 tests passed
All v1 tests: 194 tests passed
Total: 243 tests passed (fork test excluded - requires RPC)
```

### Phase 2 Implementation (2026-01-22) ✅

**Branch:** `master`

| Deliverable | Status | Notes |
|-------------|--------|-------|
| `V2_EXECUTION_DESIGN.md` | COMPLETE | Swap ordering, slippage, oracle checks, failure modes |
| Swap execution | COMPLETE | Two-phase: sells to USDC, then buys from USDC |
| `MockSwapRouterV2.sol` | COMPLETE | Conserving mock, supports multi-token pairs |
| Swap tests | COMPLETE | 17 new tests covering all swap scenarios |
| Approval safety | COMPLETE | forceApprove before, forceApprove(0) after each swap |
| Slippage protection | COMPLETE | Per-swap amountInMaximum enforcement |
| Oracle checks | COMPLETE | Freshness validated before each swap |
| Dust threshold | COMPLETE | MIN_SWAP_USD = $1, swaps below are skipped |
| Max swaps | COMPLETE | MAX_SWAPS_PER_REBALANCE = 18 (hard bound) |

**Key Implementation Details:**
- `exactOutputSingle` used for precise target amounts
- All swaps route through USDC intermediary
- Fail-closed design: any failure reverts entire transaction
- nonReentrant on rebalance()
- Emits `Rebalanced` and `SwapExecuted` events

**Test Results:**
```
MeezanVaultV2Test: 49 tests passed
MeezanVaultV2SwapTest: 17 tests passed
All v1 tests: 194 tests passed
Total: 260 tests passed (fork test excluded - requires RPC)
```

### Execution Strategy (2026-01-22) — FINALIZED ✅

| Component | Status |
|-----------|--------|
| Execution model | **LOCKED** — Atomic all-or-nothing |
| Swap ordering | **LOCKED** — Two-phase (sells then buys) |
| Security review | **FINAL** — No critical issues found |
| Audit readiness | **READY** — Execution strategy cleared for external audit |

**Change Control:** Further execution strategy changes require explicit founder decision.

### Phase 3 Implementation (2026-01-22) ✅

**Branch:** `master`

| Deliverable | Status | Notes |
|-------------|--------|-------|
| `MeezanFactoryV2.sol` | COMPLETE | Factory for deploying v2 vaults |
| `MeezanFactoryV2.t.sol` | COMPLETE | 20 tests, all passing |
| `ForkProofV2.t.sol` | COMPLETE | 7 fork tests for Base mainnet |
| `V2_AUDIT_SCOPE.md` | UPDATED | Marked READY FOR AUDIT |
| `AUDIT_PACKAGE_V2/` | COMPLETE | Audit materials prepared |

**Key Features:**
- Factory validates all inputs (weights, stablecoin presence, thresholds)
- Two-step ownership transfer (user must accept)
- Config hash tracking prevents duplicate vaults
- Comprehensive test coverage

**Test Results:**
```
MeezanVaultV2Test: 49 tests passed
MeezanVaultV2SwapTest: 17 tests passed
MeezanFactoryV2Test: 20 tests passed
All v1 tests: 194 tests passed
Total: 280 tests passed (fork tests excluded - requires RPC)
```

### Audit Readiness Summary

| Component | Status |
|-----------|--------|
| MeezanVaultV2.sol | ✅ Complete, tested |
| MeezanFactoryV2.sol | ✅ Complete, tested |
| Execution design | ✅ LOCKED |
| Security review | ✅ FINAL |
| Fork tests | ✅ Ready (7 tests) |
| Audit package | ✅ Prepared |
| Documentation | ✅ Complete |

**v2 is ready for external security audit.**

### Phase 4: Frontend Integration (2026-01-22) ✅

**Branch:** `master`

| Deliverable | Status | Notes |
|-------------|--------|-------|
| `lib/assets.ts` | COMPLETE | Asset universe, portfolio templates, drift presets |
| `lib/contracts-v2.ts` | COMPLETE | V2 ABIs, config builders, vault discovery |
| `lib/hooks-v2.ts` | COMPLETE | Multi-asset vault state hooks |
| `lib/tx-orchestrator-v2.ts` | COMPLETE | 5-step transaction state machine |
| `/setup-v2` | COMPLETE | 5-screen portfolio construction flow |
| `/portfolio-v2` | COMPLETE | Multi-asset holdings display |
| `/details-v2` | COMPLETE | Per-asset drift, rebalance action |
| Build passes | COMPLETE | `npm run build` successful |

**V2 Frontend Transaction Flow:**
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Create     │───▶│   Accept    │───▶│   Approve   │───▶│   Deposit   │───▶│  Rebalance  │
│   Vault     │    │  Ownership  │    │    USDC     │    │    USDC     │    │  (Allocate) │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
     10%                30%                50%                70%                90%
```

**Key Features:**
- USDC-only deposits (simplicity, auditability)
- Portfolio templates: Balanced, Conservative, Growth, BTC/ETH Focused
- Custom portfolio builder with asset selection and weight assignment
- Drift threshold presets: Tight (3%), Standard (5%), Relaxed (10%)
- Real-time gas estimates for all operations
- On-chain data only (no demo values)
- Confirmation dialogs for destructive actions

**Routes:**
| Route | Purpose |
|-------|---------|
| `/setup-v2` | Create new v2 vault with multi-step flow |
| `/portfolio-v2?vault=0x...` | View multi-asset holdings |
| `/details-v2?vault=0x...` | Per-asset details, rebalance action |

---

## Product Roadmap (2026-01-22) — LOCKED

### Strategic Decision: Base First, Multi-Chain Later

**Rationale:**
- Base has native Coinbase assets (cbBTC, USDC)
- Existing v1 infrastructure on Base
- 3 solid assets (BTC, ETH, USDC) cover 90% of institutional demand
- Multi-chain adds complexity without proportional value for launch

### Phase 1: Base Launch (Current)

**Assets:** BTC, ETH, USDC
**Chain:** Base mainnet
**Status:** Frontend complete, contract deployment pending

| Asset | Token | Chainlink Feed | Pool Fee |
|-------|-------|----------------|----------|
| BTC | cbBTC `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` | `0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D` | 0.05% |
| ETH | WETH `0x4200000000000000000000000000000000000006` | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` | 0.05% |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `0x7e860098F58bBFC8648a4311b374B1D669a2bc6B` | — |

**Portfolio Templates:**
- Balanced: 40% BTC, 40% ETH, 20% USDC
- Conservative: 25% BTC, 25% ETH, 50% USDC
- Growth: 50% BTC, 50% ETH
- BTC Heavy: 60% BTC, 20% ETH, 20% USDC
- ETH Heavy: 20% BTC, 60% ETH, 20% USDC

### Phase 2: Solana Vault (Future)

**Timeline:** 3-6 months after Base launch
**Assets:** SOL, USDC
**Architecture:** Native Solana vault (Anchor/Rust)

**Why native Solana:**
- SOL cannot be safely included on EVM chains (no native token, bridge risk)
- Native vault = no bridge dependency
- Pyth oracle for pricing
- Raydium/Orca for swaps

**Frontend Integration:**
- Unified portfolio view showing both Base and Solana holdings
- User deposits USDC, system routes to appropriate chain
- Withdrawal consolidates from both vaults

### Phase 3: Arbitrum Expansion (Future)

**Timeline:** 6-12 months after Base launch
**Assets:** LINK, UNI, ARB
**Architecture:** Deploy existing V2 contract to Arbitrum

**Why Arbitrum:**
- Deepest L2 liquidity ($75M ETH/USDC)
- Full Chainlink coverage (LINK, UNI, ARB feeds exist)
- Mature Uniswap V3 infrastructure

### Phase 4: Chain Abstraction (Future)

**Timeline:** 12-18 months
**Architecture:**
- ERC-4337 smart accounts
- Across Protocol for cross-chain intents
- One-button UX hiding multi-chain complexity

**User Experience:**
- User sees unified portfolio across all chains
- User deposits from any chain
- System routes to optimal execution venue
- User never knows which chain holds which asset

### Assets NOT Included (and Why)

| Asset | Reason |
|-------|--------|
| SOL | No native token on EVM; requires Solana-native vault |
| LINK (Base) | Chainlink feed exists but liquidity too thin |
| UNI (Base) | No Chainlink feed on Base |
| AAVE | Thin liquidity on L2s |
| AVAX | No native token on L2s |

---

## Current State Summary

| Component | Status |
|-----------|--------|
| V1 Contracts | ✅ Deployed to Base |
| V2 Contracts | ✅ Complete, audit-ready |
| V2 Frontend | ✅ Complete (BTC, ETH, USDC) |
| FactoryV2 Deployment | ⏳ Pending |
| Security Audit | ⏳ Pending |
| Solana Vault | 📋 Planned |
| Arbitrum Vault | 📋 Planned |

### Next Steps

1. ✅ Phase 1-4 implementation complete (contracts + frontend)
2. ✅ Asset universe finalized (BTC, ETH, USDC on Base)
3. ✅ Roadmap locked
4. ⏳ Deploy MeezanFactoryV2 to Base
5. ⏳ Update CONTRACTS_V2.factoryV2 address
6. ⏳ Real-funds testing ($50-100)
7. ⏳ Audit firm engagement
8. ⏳ Public launch
