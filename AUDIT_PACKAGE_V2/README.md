# Meezan v2 Audit Package

**Version:** 2.0.0
**Date:** 2026-01-22
**Contact:** [engineering@meezan.io]

---

## Overview

Meezan v2 is a non-custodial multi-asset portfolio rebalancing vault for Base L2. Users deploy personal vaults via a factory contract, deposit multiple crypto assets, and can trigger rebalancing to maintain target allocation weights.

**Key changes from v1:**
- Variable asset count (2-10 vs fixed 2)
- Multi-swap rebalancing (up to 18 swaps vs 1)
- All swaps route through USDC intermediary
- New drift calculation (max per-asset deviation)

---

## Contracts in Scope

| Contract | Location | LOC | Description |
|----------|----------|-----|-------------|
| `MeezanVaultV2.sol` | `src/` | ~800 | Multi-asset vault with swap execution |
| `MeezanFactoryV2.sol` | `src/` | ~160 | Factory for deploying v2 vaults |

**Out of scope:** MeezanVault.sol (v1), MeezanFactory.sol (v1), interfaces, mocks

---

## Quick Start

```bash
# Install dependencies
forge install

# Run all tests
forge test

# Run v2 tests only
forge test --match-contract MeezanVaultV2

# Run with verbose output
forge test -vvv

# Run fork tests (requires BASE_RPC)
export BASE_RPC=https://mainnet.base.org
forge test --match-path test/ForkProofV2.t.sol -vvv
```

---

## Test Coverage

| Test Suite | Tests | Status |
|------------|-------|--------|
| MeezanVaultV2Test | 49 | PASS |
| MeezanVaultV2SwapTest | 17 | PASS |
| MeezanFactoryV2Test | 20 | PASS |
| MeezanVaultInvariantTest | 11 | PASS |
| ForkProofV2 | 7 | PASS (with RPC) |
| **Total** | **104+** | PASS |

---

## Key Documentation

| Document | Purpose |
|----------|---------|
| `docs/V2_AUDIT_SCOPE.md` | Audit focus areas and priorities |
| `docs/V2_INVARIANTS.md` | 20 formal invariants to verify |
| `docs/V2_EXECUTION_DESIGN.md` | Swap execution specification (LOCKED) |
| `docs/V2_EXECUTION_REVIEW_FINAL.md` | Internal security review |
| `docs/THREAT_MODEL.md` | Threat analysis and mitigations |

---

## Critical Audit Focus Areas

### 1. Multi-Swap Execution (CRITICAL)

**Location:** `MeezanVaultV2.sol::rebalance()`, `_executeRebalanceSwaps()`

Questions:
- Can swap ordering be manipulated?
- Is USDC balance protected between sell/buy phases?
- Can a failed swap leave bad state?

### 2. Approval Safety (CRITICAL)

**Location:** `_executeSellToUsdc()`, `_executeBuyFromUsdc()`

Questions:
- Is `forceApprove(0)` called after every swap?
- Are there any code paths leaving approvals non-zero?

### 3. Withdrawal Safety (CRITICAL)

**Location:** `withdraw()`, `withdrawAll()`

Verify: Owner can always withdraw, even when paused.

---

## Architecture

```
User
  │
  ▼
MeezanFactoryV2 ─────► MeezanVaultV2 (user's vault)
                           │
                           ├── deposit(assetIndex, amount)
                           ├── withdraw(assetIndex, amount)
                           ├── rebalance()
                           │      │
                           │      ├── Phase 1: Sell overweight → USDC
                           │      │      └── exactOutputSingle (Uniswap V3)
                           │      │
                           │      └── Phase 2: Buy underweight ← USDC
                           │             └── exactOutputSingle (Uniswap V3)
                           │
                           └── Oracle reads (Chainlink)
```

---

## Execution Strategy (LOCKED)

The swap execution strategy has been finalized and security-reviewed:

| Component | Design |
|-----------|--------|
| Execution | Atomic all-or-nothing |
| Ordering | Sells first (index order), then buys |
| Intermediary | All swaps route through USDC |
| Failure mode | Fail-closed (any error reverts entire tx) |
| Max swaps | 18 (hard bound) |
| Dust threshold | $1 minimum swap |
| Slippage | Per-swap enforcement via amountInMaximum |

**No design changes allowed without explicit approval.**

---

## External Dependencies

| Dependency | Address (Base) | Usage |
|------------|----------------|-------|
| Uniswap V3 SwapRouter | `0x2626664c2603336E57B271c5C0b26F421741e481` | Swap execution |
| Chainlink BTC/USD | `0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D` | Price oracle |
| Chainlink ETH/USD | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` | Price oracle |
| Chainlink USDC/USD | `0x7e860098F58bBFC8648a4311b374B1D669a2bc6B` | Price oracle |

---

## Known Issues / Accepted Risks

1. **MEV within slippage tolerance** - Sandwich attacks bounded by per-swap slippage
2. **Oracle heartbeat delays** - Mitigated by staleness checks (1h volatile, 25h stable)
3. **Gas exhaustion** - Bounded by MAX_SWAPS_PER_REBALANCE = 18

---

## Contact

For questions during the audit:
- Technical: [engineering@meezan.io]
- Security: [security@meezan.io]

---

*This package contains all materials needed for a comprehensive security audit.*
