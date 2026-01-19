# Next Action Required

**Status:** ACTION REQUIRED - Micro Real-Funds Test

**Last Updated:** 2026-01-19

---

## Action: Complete Micro Real-Funds Test

Before declaring launch-ready, verify the system with a small real deposit.

### Prerequisites

1. Wallet connected to Base mainnet
2. Small amount of USDC (e.g., $10-50)
3. Small amount of ETH for gas (~$1)

### Test Steps

1. **Deploy Web App** (if not already running)
   ```bash
   cd apps/web
   npm run dev
   ```

2. **Create Vault**
   - Connect wallet
   - Select 50/50 allocation
   - Create vault
   - Record vault address: _______________

3. **Deposit**
   - Approve USDC spending
   - Deposit 10 USDC
   - Verify balances show in UI

4. **Verify on Basescan**
   - Check vault contract holds cbBTC + USDC
   - Confirm allocation roughly matches 50/50

5. **Withdraw**
   - Click withdraw
   - Confirm both tokens returned to wallet

6. **Record Results**

   | Step | Pass/Fail | Tx Hash |
   |------|-----------|---------|
   | Create Vault | | |
   | Deposit | | |
   | Withdraw | | |

---

## After Test Passes

1. Update ops/LAUNCH_CHECKLIST.md with test results
2. Sign off on launch readiness
3. Push changes: `git push origin master`

---

## Deployment Summary

| Item | Value |
|------|-------|
| MeezanFactory | `0x9FfD7a7dd2C730f1E85643868B645778feDF4f8b` |
| Network | Base Mainnet (8453) |
| Status Page | `/status` |
| API Endpoint | `/api/status` |

---

## Checklist Progress

- [x] Factory deployed to Base mainnet
- [x] Contract verified on Sourcify
- [x] Web app configured with factory address
- [x] Status monitoring implemented
- [x] Launch checklist created
- [ ] **Micro real-funds test** ← NEXT
- [ ] Launch sign-off
