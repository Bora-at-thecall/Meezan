# Meezan v1 - Deployment Status

**Last Updated:** 2026-01-19
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

## v1 Ready

Meezan v1 is deployed and operational on Base mainnet.
