# Launch Checklist

**Version:** v1
**Last Updated:** 2026-01-19

---

## 1. Contract Deployment Verification

### 1.1 Factory Contract

- [ ] Factory address matches: `0x9FfD7a7dd2C730f1E85643868B645778feDF4f8b`
- [ ] Verified on Sourcify or Basescan
- [ ] Read `tokenA()` returns cbBTC: `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf`
- [ ] Read `tokenB()` returns USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- [ ] Read `priceFeedA()` returns: `0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D`
- [ ] Read `priceFeedB()` returns: `0x7e860098F58bBFC8648a4311b374B1D669a2bc6B`
- [ ] Read `swapRouter()` returns: `0x2626664c2603336E57B271c5C0b26F421741e481`
- [ ] Read `poolFee()` returns: `500`

### 1.2 Verification Commands

```bash
# Using cast (Foundry)
cast call 0x9FfD7a7dd2C730f1E85643868B645778feDF4f8b "tokenA()" --rpc-url https://mainnet.base.org
cast call 0x9FfD7a7dd2C730f1E85643868B645778feDF4f8b "tokenB()" --rpc-url https://mainnet.base.org
cast call 0x9FfD7a7dd2C730f1E85643868B645778feDF4f8b "poolFee()" --rpc-url https://mainnet.base.org
```

---

## 2. UI Configuration

### 2.1 Factory Address

- [ ] `apps/web/lib/contracts.ts` contains correct factory address
- [ ] No placeholder addresses remain (no `0x000...000`)

### 2.2 Network Configuration

- [ ] Web app connects to Base mainnet (Chain ID 8453)
- [ ] Wallet prompts show "Base" network
- [ ] Basescan links point to `basescan.org` (not testnet)

### 2.3 Build Verification

```bash
cd apps/web
npm run build
# Should complete with no errors
```

---

## 3. Micro Real-Funds Test

**Use a small amount (e.g., $10-50 USDC) for initial verification.**

### 3.1 Vault Creation

- [ ] Connect wallet with USDC on Base
- [ ] Select an allocation (e.g., 50/50)
- [ ] Create vault transaction succeeds
- [ ] Vault address appears in UI
- [ ] Vault visible on Basescan

### 3.2 Deposit

- [ ] Approve USDC spending
- [ ] Deposit small amount (e.g., 10 USDC)
- [ ] Transaction succeeds
- [ ] Vault shows cbBTC and USDC balances
- [ ] Allocation percentages display correctly

### 3.3 Rebalance (if applicable)

- [ ] Wait for price movement or use a high-drift vault
- [ ] Click rebalance
- [ ] Transaction succeeds (or correctly skipped if drift < 5%)
- [ ] Balances update

### 3.4 Withdraw

- [ ] Click withdraw
- [ ] Transaction succeeds
- [ ] cbBTC and USDC returned to wallet
- [ ] Vault balances show zero

### 3.5 Record Results

| Step | Result | Tx Hash | Notes |
|------|--------|---------|-------|
| Create Vault | | | |
| Deposit | | | |
| Rebalance | | | |
| Withdraw | | | |

---

## 4. Rollback / Pause Procedures

### 4.1 Individual Vault Pause

If a user reports an issue with their vault:

```solidity
// Only vault owner can pause
vault.pause()
```

This stops all deposits, withdrawals, and rebalances until unpaused.

### 4.2 Factory Pause

The factory has no pause function by design. Each vault is independent.

To prevent new vault creation, the factory would need to be replaced (requires new deployment).

### 4.3 Emergency User Actions

Users can always:
1. **Pause their vault**: `vault.pause()`
2. **Withdraw everything**: `vault.withdrawAll()` (if not paused)
3. **Transfer ownership**: Two-step process via `transferOwnership()` + `acceptOwnership()`

### 4.4 Web App Rollback

If the web app has issues:
1. Revert to previous deployment
2. Or take app offline temporarily
3. Users can still interact directly via Basescan

---

## 5. Daily Monitoring

### 5.1 Automated Checks

The `/api/status` endpoint monitors:

| Check | Threshold | Action if Failed |
|-------|-----------|------------------|
| BTC/USD feed age | < 1 hour | Investigate Chainlink status |
| USDC/USD feed age | < 1 hour | Investigate Chainlink status |
| Factory readable | Must respond | Check Base RPC / network |
| Base RPC | Must respond | Switch RPC provider |

### 5.2 Manual Daily Checks

- [ ] Visit status page, confirm "Operational"
- [ ] Check Basescan for factory activity (new vaults)
- [ ] Review any user-reported issues
- [ ] Check Base network status: https://status.base.org

### 5.3 Weekly Checks

- [ ] Review total vaults created
- [ ] Check Uniswap cbBTC/USDC pool liquidity
- [ ] Review Chainlink feed performance
- [ ] Check for any contract interactions anomalies on Basescan

---

## 6. Incident Response

### 6.1 Severity Levels

| Level | Description | Response |
|-------|-------------|----------|
| Low | UI bug, display issue | Fix in next release |
| Medium | Transaction failures, RPC issues | Investigate within 24h |
| High | Fund loss, contract bug | Immediate response |

### 6.2 High Severity Response

1. **Communicate**: Post status update if public
2. **Assess**: Determine scope and affected users
3. **Mitigate**: Guide users to pause vaults if needed
4. **Resolve**: Deploy fix or provide workaround
5. **Document**: Record incident details

### 6.3 Contact

For security issues, see SECURITY.md.

---

## 7. Launch Sign-Off

| Item | Status | Verified By | Date |
|------|--------|-------------|------|
| Contract deployment verified | | | |
| UI configuration correct | | | |
| Real-funds test complete | | | |
| Monitoring operational | | | |
| Documentation complete | | | |

**Launch Approved:** [ ] Yes / [ ] No

**Approved By:** _________________

**Date:** _________________

---

## 8. v2 Integration Test Plan

**Version:** v2
**Last Updated:** 2026-01-22

### 8.1 Prerequisites

- [ ] MeezanFactoryV2 deployed to Base
- [ ] Factory address updated in `lib/contracts-v2.ts`
- [ ] All contract tests passing (280+)
- [ ] Web build passes (`npm run build`)

### 8.2 Frontend-to-Contract Flow Test

#### Step 1: Vault Creation Flow

| Test | Expected Result | Status |
|------|-----------------|--------|
| Navigate to `/setup-v2` | Shows portfolio templates | [ ] |
| Select "Balanced" template | Pre-fills 40% BTC, 30% ETH, 10% SOL, 20% USDC | [ ] |
| Proceed to weight screen | Shows allocation bar totaling 100% | [ ] |
| Set drift threshold to "Standard" (5%) | 500 bps selected | [ ] |
| Enter deposit amount | Amount validates against USDC balance | [ ] |
| Click "Create portfolio vault" | Processing screen appears | [ ] |

#### Step 2: Transaction Sequence

| Transaction | Expected Behavior | Status |
|-------------|-------------------|--------|
| Factory.createVault | Wallet prompts for confirmation | [ ] |
| | Transaction confirmed on-chain | [ ] |
| | VaultV2Deployed event emitted | [ ] |
| | Vault address extracted from event | [ ] |
| Vault.acceptOwnership | Wallet prompts for confirmation | [ ] |
| | User becomes vault owner | [ ] |
| USDC.approve | Wallet prompts for confirmation | [ ] |
| | Allowance set to deposit amount | [ ] |
| Vault.deposit(stablecoinIndex, amount) | Wallet prompts for confirmation | [ ] |
| | USDC transferred to vault | [ ] |
| Vault.rebalance | Wallet prompts for confirmation | [ ] |
| | Swaps executed | [ ] |
| | Assets allocated to target weights | [ ] |

#### Step 3: Portfolio View Verification

| Check | Expected Result | Status |
|-------|-----------------|--------|
| Redirect to `/portfolio-v2?vault=0x...` | Portfolio page shows vault address | [ ] |
| Total value displayed | Matches deposit amount (minus fees) | [ ] |
| Allocation bar | Shows colors for each asset | [ ] |
| Per-asset holdings | BTC, ETH, SOL, USDC values displayed | [ ] |
| System status | "Max drift: X% · Threshold: 5% · No action needed" | [ ] |

#### Step 4: Details View Verification

| Check | Expected Result | Status |
|-------|-----------------|--------|
| Click "Details" | Navigates to `/details-v2?vault=0x...` | [ ] |
| Per-asset cards | Target %, Current %, Drift % displayed | [ ] |
| Max drift asset | Highlighted with warning color if > threshold | [ ] |
| Visual weight bars | Show current vs target position | [ ] |
| Rebalance status | "No action needed" if below threshold | [ ] |

### 8.3 Rebalance Test

| Test | Expected Result | Status |
|------|-----------------|--------|
| Wait for price movement (or simulate) | Portfolio drift increases | [ ] |
| Drift exceeds threshold | "Rebalance available" appears | [ ] |
| Click "Rebalance now" | Confirmation dialog shows fee estimate | [ ] |
| Confirm rebalance | Transaction sequence executes | [ ] |
| Post-rebalance | Drift returns to near-zero | [ ] |

### 8.4 Withdraw Test

| Test | Expected Result | Status |
|------|-----------------|--------|
| Click "Withdraw" on portfolio | Confirmation dialog appears | [ ] |
| Shows total value and asset count | Accurate values displayed | [ ] |
| Confirm withdrawal | Transaction executes | [ ] |
| All assets returned | BTC, ETH, SOL, USDC in wallet | [ ] |
| Vault balance | Zero for all assets | [ ] |

### 8.5 Edge Cases

| Test | Expected Result | Status |
|------|-----------------|--------|
| Attempt create with existing config | Redirects to existing vault | [ ] |
| Insufficient USDC balance | Error shown, button disabled | [ ] |
| Transaction rejection | Error screen with retry option | [ ] |
| Network disconnect mid-flow | Graceful error handling | [ ] |
| Wrong network connected | Network switch prompt | [ ] |

### 8.6 Security Verification

| Check | Expected Result | Status |
|-------|-----------------|--------|
| Factory address hardcoded | Not from URL params | [ ] |
| All addresses from security.ts | Verified in code | [ ] |
| Chain locked to Base (8453) | Rejects other chains | [ ] |
| Transaction hashes linkable | Basescan links work | [ ] |
| Approval cleared after use | No residual allowances | [ ] |

### 8.7 Test Results Summary

| Phase | Passed | Failed | Notes |
|-------|--------|--------|-------|
| Vault Creation | / | / | |
| Transaction Flow | / | / | |
| Portfolio View | / | / | |
| Details View | / | / | |
| Rebalance | / | / | |
| Withdraw | / | / | |
| Edge Cases | / | / | |
| Security | / | / | |

**v2 Integration Test Sign-Off:**

- [ ] All frontend tests passing
- [ ] Real funds test complete (small amount)
- [ ] No security issues identified

**Tester:** _________________
**Date:** _________________
