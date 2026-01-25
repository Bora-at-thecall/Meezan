# V3 Post-Launch Soak Checklist (72 Hours)

**Launch Date:** 2026-01-25
**Factory Address:** `0x4194376c40a80cbeb2d0e37be9083307c05010f7`
**TX Hash:** `0x9b266c00a1299d379592214608ecc67855b1ac98b648bfad02bbf3fae98a6fc9`

---

## Monitoring Targets

### Critical (Check Every 4 Hours)

| Metric | Where to Check | Alert If |
|--------|----------------|----------|
| Factory events | [Basescan](https://basescan.org/address/0x4194376c40a80cbeb2d0e37be9083307c05010f7#events) | Any unexpected events |
| Vault creations | `VaultV3Deployed` events | Track count |
| Withdrawal failures | Support/logs | Any reports |
| User funds at risk | Support tickets | ANY report = immediate action |

### Important (Check Every 12 Hours)

| Metric | Where to Check | Expected |
|--------|----------------|----------|
| convertAndWithdraw success rate | Analytics | >90% |
| Slippage rejections | Analytics | <20% of attempts |
| Gas costs per withdrawal | Basescan TX | <$10 typical |
| Average slippage realized | Analytics | <1% |

### Informational (Check Daily)

| Metric | Where to Check | Notes |
|--------|----------------|-------|
| Total V3 vaults created | Factory vaultCount() | Baseline |
| V3 vs V2 usage ratio | Analytics | Adoption trend |
| Support tickets | Queue | Track V3-specific issues |

---

## Daily Log

### Day 1 (Hours 0-24)

**Time:** _______________

| Check | Status | Notes |
|-------|--------|-------|
| Factory deployed | ✅ | 0x4194376c40a80cbeb2d0e37be9083307c05010f7 |
| Frontend updated | ✅ | factoryV3 address set |
| Build passes | ✅ | All pages compile |
| Vaults created | ___ | Count: ___ |
| Withdrawals completed | ___ | Count: ___ |
| Issues reported | ___ | List: ___ |

**Day 1 Sign-off:** _________________ (name) at _________________ (time)

---

### Day 2 (Hours 24-48)

**Time:** _______________

| Check | Status | Notes |
|-------|--------|-------|
| Vaults created (cumulative) | ___ | |
| Withdrawals completed | ___ | |
| Conversion success rate | ___ | Target: >90% |
| Issues reported | ___ | |
| Gas costs normal | ___ | |

**Day 2 Sign-off:** _________________ (name) at _________________ (time)

---

### Day 3 (Hours 48-72)

**Time:** _______________

| Check | Status | Notes |
|-------|--------|-------|
| Vaults created (cumulative) | ___ | |
| Withdrawals completed | ___ | |
| Conversion success rate | ___ | |
| Support tickets resolved | ___ | |
| No critical issues | ___ | |

**Day 3 Sign-off:** _________________ (name) at _________________ (time)

---

## Quick Commands

### Check vault count
```bash
cast call 0x4194376c40a80cbeb2d0e37be9083307c05010f7 "vaultCount()" --rpc-url https://mainnet.base.org
```

### Check swapRouter
```bash
cast call 0x4194376c40a80cbeb2d0e37be9083307c05010f7 "swapRouter()" --rpc-url https://mainnet.base.org
```

### Check conversionExecutor (should be 0x0 for V3 Lite)
```bash
cast call 0x4194376c40a80cbeb2d0e37be9083307c05010f7 "conversionExecutor()" --rpc-url https://mainnet.base.org
```

### View recent events
```bash
cast logs --from-block -1000 --address 0x4194376c40a80cbeb2d0e37be9083307c05010f7 --rpc-url https://mainnet.base.org
```

---

## Rollback Triggers

### Immediate Rollback (Do Now)

- [ ] User reports funds lost or stuck
- [ ] Critical vulnerability discovered
- [ ] Multiple failed withdrawals reported

**Rollback action:** Set `factoryV3: null` in contracts-v3.ts, redeploy frontend

### Investigate First

- [ ] >30% conversion failure rate
- [ ] >50% slippage rejections
- [ ] Gas costs >$50 per withdrawal
- [ ] Multiple similar support tickets

---

## V3 Lite Limitations (Expected)

These are NOT bugs:

1. **Background conversion disabled** - Executor is 0x0, by design for V3 Lite
2. **Only instant conversion available** - Use convertAndWithdraw or withdrawAll
3. **2% slippage ceiling** - Transactions revert if slippage exceeds 2%
4. **Dust may remain** - Amounts <$1 not converted (gas optimization)

---

## Contacts

| Role | Contact |
|------|---------|
| Lead | _______ |
| On-call | _______ |
| Support | _______ |

---

## Soak Test Complete Criteria

After 72 hours, sign off if:

- [ ] No critical issues
- [ ] No funds at risk reports
- [ ] Conversion success rate >90%
- [ ] Support tickets manageable
- [ ] No security concerns

**Final Sign-off:** _________________ (name) at _________________ (date/time)

**Status:** SOAK TEST PASSED / FAILED / EXTENDED

---

*V3 Lite launched 2026-01-25*
