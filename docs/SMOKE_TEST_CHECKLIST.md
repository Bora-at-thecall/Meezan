# Real-Funds Smoke Test Checklist

**Factory V2:** `0xc24F363E8F1Df37AEBfb50366118DfafF21983CA`
**Network:** Base Mainnet (Chain ID 8453)
**Test Amount:** $20-50 USDC

---

## Pre-Test Verification (2026-01-24)

| Item | Method | Status |
|------|--------|--------|
| TypeScript build | `npm run build` | PASS |
| Contract tests | `forge test` | PASS (verified earlier) |
| Network check UI | Code review | VERIFIED - blocks on wrong chain |
| Tx hash visibility | Code review | VERIFIED - Basescan links added |
| Quote API integrity | Code review | VERIFIED - QuoterV2 fallback, no hardcoded prices |
| Gas warning | Code review | VERIFIED - shows on low ETH |
| Safe vault cleanup | Code review | VERIFIED - retry with backoff |

---

## Prerequisites

- [ ] Wallet with $20-50 USDC on Base
- [ ] Small amount of ETH for gas (~$2)
- [ ] Browser with MetaMask or Coinbase Wallet
- [ ] Dev server running: `cd apps/web && npm run dev`

---

## Test Steps

### Step 1: Create Portfolio

1. [ ] Go to `http://localhost:3000`
2. [ ] Connect wallet
3. [ ] Click "Create portfolio"
4. [ ] Select "Balanced" template (40% BTC, 40% ETH, 20% USDC)
5. [ ] Keep default 5% drift threshold
6. [ ] Enter deposit amount (e.g., $25)
7. [ ] Click "Create portfolio"

### Step 2: Confirm Transactions (3 wallet prompts)

| # | Prompt | What to verify |
|---|--------|----------------|
| 1 | Create vault | Gas ~$0.05-0.15 |
| 2 | Approve USDC | Exact amount you entered |
| 3 | Fund portfolio | This buys BTC & ETH |

- [ ] All 3 transactions confirmed
- [ ] UI shows "Portfolio ready!"
- [ ] Redirected to portfolio page

### Step 3: Verify Holdings

On portfolio page, verify:
- [ ] cbBTC balance > 0
- [ ] WETH balance > 0
- [ ] USDC balance > 0
- [ ] Total value approximately matches deposit amount (minus gas + slippage)
- [ ] Allocation percentages near 40/40/20

### Step 4: Withdraw All

1. [ ] Click "Withdraw" button
2. [ ] Confirm withdrawal dialog shows all 3 assets
3. [ ] Confirm transaction in wallet
4. [ ] Wait for confirmation

### Step 5: Verify Funds Returned

- [ ] cbBTC received in wallet
- [ ] WETH received in wallet
- [ ] USDC received in wallet
- [ ] Vault shows $0 balance
- [ ] Home page shows "Create portfolio" (not "View portfolio")

---

## Basescan Verification

After test completion, verify on Basescan:

### 1. Factory Contract
https://basescan.org/address/0xc24F363E8F1Df37AEBfb50366118DfafF21983CA

- [ ] "Contract" tab shows verified source code
- [ ] Recent transactions show your `createVault` call

### 2. Your Vault Contract
`https://basescan.org/address/<YOUR_VAULT_ADDRESS>`

- [ ] Contract exists (not empty)
- [ ] Owner matches your wallet address
- [ ] Token balances tab shows transfers in/out
- [ ] Internal transactions show swaps to Uniswap

### 3. Transaction Hashes to Record

| Transaction | Hash | Status |
|-------------|------|--------|
| Create vault | | [ ] Success |
| Approve USDC | | [ ] Success |
| Fund portfolio | | [ ] Success |
| Withdraw all | | [ ] Success |

### 4. Token Balance Checks

After withdraw, verify in your wallet:
- [ ] cbBTC balance increased
- [ ] WETH balance increased
- [ ] USDC balance approximately (deposit - gas - slippage)

---

## Pass/Fail Criteria

**PASS if all true:**
- All 4 transactions succeeded
- Holdings appeared after funding
- Funds returned after withdrawal
- No console errors (check browser dev tools)
- UI state matched chain state at every step

**FAIL if any:**
- Transaction reverted
- UI showed "failed" but chain succeeded
- Funds stuck in vault
- Holdings didn't appear
- Phantom vault created

---

## If Test Fails

1. Note the exact step that failed
2. Copy full console output (F12 > Console)
3. Record all transaction hashes
4. Screenshot the UI state
5. Do NOT retry until root cause identified

---

## Test Completed

Date: _______________
Tester: _______________
Vault Address: _______________
Result: [ ] PASS / [ ] FAIL
Notes: _______________

---

## Verification Notes

**Items verified via build/tests (automated):**
- TypeScript compilation: PASS
- Contract unit tests: PASS
- Static analysis (Slither): 0 high/medium in Meezan code

**Items verified via code review:**
- Network validation on all V2 pages
- Basescan links during transaction processing
- Quote API uses real on-chain/API data only
- Gas warning appears on low ETH
- Vault cleanup handles RPC failures safely

**Items requiring manual verification:**
- All steps in "Test Steps" section above
- Wallet interaction and transaction signing
- Basescan contract verification
- End-to-end fund flow

**Last pre-test verification:** 2026-01-24
