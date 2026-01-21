# Meezan v2 — Safe Rollout Plan

**Status:** Planning Phase
**Last Updated:** 2026-01-21
**Target Launch:** Q3 2026

---

## 1. Overview

This document outlines the phased rollout strategy for Meezan v2 multi-asset portfolios. The goal is to minimize risk while gaining confidence through progressive exposure.

**Principles:**
1. **No shortcuts** — Every phase must pass before proceeding
2. **User funds first** — Any doubt → pause and investigate
3. **Incremental exposure** — Start small, scale gradually
4. **Transparent communication** — Users know it's new

---

## 2. Rollout Phases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Meezan v2 Rollout Timeline                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase 0        Phase 1        Phase 2        Phase 3        Phase 4       │
│  Internal       Testnet        Guarded        Limited        General       │
│  Testing        Public         Launch         Availability   Availability  │
│                                                                             │
│  ────●──────────●──────────────●──────────────●──────────────●────────▶    │
│       │          │              │              │              │             │
│      W1-4       W5-8          W9-12         W13-16         W17+           │
│                                                                             │
│  - Unit tests   - Base Sepolia  - Mainnet      - $100K cap    - No caps     │
│  - Invariants   - Bug bounty    - $10K cap     - 100 users    - Open        │
│  - Fork tests   - Community     - 10 users     - Bug bounty   - Full UI     │
│  - Audit        - Feedback      - Team only    - Monitoring                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Phase 0: Internal Testing (Weeks 1-4)

### 3.1 Goals

- Verify all functionality works correctly
- Validate gas costs and limits
- Confirm invariants hold under stress
- Prepare for external audit

### 3.2 Activities

| Week | Activity | Exit Criteria |
|------|----------|---------------|
| 1 | Unit tests (300+) | All pass, 100% branch coverage |
| 2 | Invariant tests (10K runs each) | No violations |
| 3 | Fork tests (Base mainnet) | Real DEX/oracle interaction works |
| 4 | Audit preparation | All documentation complete |

### 3.3 Test Scenarios

**Required scenarios (must all pass):**

1. **Basic lifecycle**
   - Deploy vault with 4 assets
   - Deposit USDC
   - Verify allocation
   - Trigger rebalance
   - Withdraw all

2. **Edge cases**
   - Empty vault operations
   - Single asset dominant (90%+)
   - Minimum threshold drift
   - Maximum assets (10)

3. **Failure modes**
   - Stale oracle → revert
   - Insufficient liquidity → slippage revert
   - Gas budget exceeded → partial execution
   - Paused → deposits blocked, withdrawals work

4. **Stress tests**
   - 100 consecutive rebalances
   - 10 assets with random weights
   - Simulated price volatility

### 3.4 Go/No-Go Criteria

- [ ] All 300+ unit tests pass
- [ ] All invariant tests pass (10K runs)
- [ ] Fork tests pass on Base mainnet fork
- [ ] Gas costs documented and acceptable
- [ ] Slither clean (or documented exceptions)
- [ ] All documentation complete
- [ ] Audit firm engaged

**If ANY criteria fails:** Do not proceed. Fix and retest.

---

## 4. Phase 1: Testnet Public (Weeks 5-8)

### 4.1 Goals

- Get real user feedback on UX
- Discover edge cases in wild usage
- Validate monitoring infrastructure
- Start bug bounty program

### 4.2 Deployment

**Network:** Base Sepolia (testnet)

**Contracts deployed:**
- MeezanFactoryV2
- Test ERC20 tokens (mBTC, mETH, mSOL, mUSDC)
- Mock price feeds (controllable for testing)

### 4.3 Activities

| Week | Activity | Notes |
|------|----------|-------|
| 5 | Deploy to Sepolia | Announce in Discord |
| 6 | Community testing | Incentivize with NFTs or points |
| 7 | Bug bounty (testnet) | $500-$2K for valid bugs |
| 8 | Iterate on feedback | Fix UX issues, add monitoring |

### 4.4 Monitoring Setup

Deploy monitoring for:
- All contract events (deposits, withdrawals, rebalances)
- Oracle staleness alerts
- Failed transaction patterns
- Gas cost trends
- Vault TVL tracking

**Tools:**
- Tenderly for transaction monitoring
- Custom Dune dashboard
- PagerDuty for critical alerts

### 4.5 Go/No-Go Criteria

- [ ] 2+ weeks on testnet without critical bugs
- [ ] Audit report received and all CRITICAL fixed
- [ ] Monitoring infrastructure operational
- [ ] Bug bounty running (no critical submissions)
- [ ] Community feedback incorporated
- [ ] Emergency procedures documented and tested

**If ANY criteria fails:** Extend Phase 1. Do not proceed.

---

## 5. Phase 2: Guarded Launch (Weeks 9-12)

### 5.1 Goals

- First mainnet deployment with real funds
- Extremely limited exposure
- Team-only users initially
- Validate everything works with real DEXs/oracles

### 5.2 Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Max TVL per vault | $10,000 | Limit exposure |
| Max users | 10 | Team + advisors only |
| Asset universe | 4 (BTC, ETH, SOL, USDC) | Proven liquidity |
| Factory allowlist | Enabled | Only whitelisted can deploy |

### 5.3 Deployment

**Network:** Base Mainnet

**Factory configuration:**
```solidity
// Factory has allowlist mode
bool public allowlistEnabled = true;
mapping(address => bool) public allowlist;

function createVault(...) external {
    if (allowlistEnabled && !allowlist[msg.sender]) {
        revert NotAllowlisted();
    }
    ...
}
```

### 5.4 Activities

| Week | Activity | Notes |
|------|----------|-------|
| 9 | Deploy to mainnet | Team only, small amounts |
| 10 | Daily rebalances | Test with real prices |
| 11 | Monitor patterns | Gas, slippage, drift accuracy |
| 12 | Security review | Post-launch audit review |

### 5.5 Team Testing Protocol

Each team member deploys vault with:
- $1,000 initial deposit
- Different allocations (cover variety)
- Trigger rebalances daily
- Document all issues

**Required data collection:**
- Gas costs per rebalance
- Slippage observed vs expected
- Oracle freshness at time of rebalance
- Any unexpected behaviors

### 5.6 Go/No-Go Criteria

- [ ] 30+ successful rebalances on mainnet
- [ ] No unexpected slippage (>1% over oracle price)
- [ ] No failed transactions (excluding expected reverts)
- [ ] Monitoring dashboard accurate
- [ ] All HIGH audit findings fixed
- [ ] Team confidence vote (unanimous)

**If ANY criteria fails:** Stay in Phase 2. Investigate and fix.

---

## 6. Phase 3: Limited Availability (Weeks 13-16)

### 6.1 Goals

- Expand to early community members
- Increase TVL caps
- Gather broader feedback
- Validate at larger scale

### 6.2 Constraints

| Constraint | Value | Change from Phase 2 |
|------------|-------|---------------------|
| Max TVL per vault | $100,000 | +10× |
| Max users | 100 | +10× |
| Asset universe | 4 | No change |
| Factory allowlist | Enabled | Expanded allowlist |

### 6.3 User Selection

Allowlist criteria:
- Discord community members (active 30+ days)
- Newsletter subscribers (pre-registered)
- Referred by existing users
- No anonymous/fresh wallets

### 6.4 Activities

| Week | Activity | Notes |
|------|----------|-------|
| 13 | Expand allowlist (50 users) | Announce in Discord |
| 14 | Expand allowlist (100 users) | Monitor closely |
| 15 | Analyze patterns | Slippage, gas, user behavior |
| 16 | Prepare for GA | Remove allowlist in code |

### 6.5 Bug Bounty (Mainnet)

**Program:**
- Platform: Immunefi
- Scope: MeezanVaultV2, MeezanFactoryV2
- Rewards:
  - Critical: $25,000
  - High: $10,000
  - Medium: $2,500
  - Low: $500

### 6.6 Go/No-Go Criteria

- [ ] 4+ weeks at $100K cap without incident
- [ ] 100+ vaults deployed successfully
- [ ] No critical bug bounty submissions
- [ ] User feedback positive (NPS > 30)
- [ ] Gas/slippage within documented ranges
- [ ] Team unanimous approval

**If ANY criteria fails:** Stay in Phase 3. Reassess.

---

## 7. Phase 4: General Availability (Week 17+)

### 7.1 Goals

- Open to all users
- Remove all caps
- Full feature set
- Ongoing monitoring

### 7.2 Configuration Changes

| Setting | Value | Notes |
|---------|-------|-------|
| Max TVL per vault | Unlimited | UI shows warning >$1M |
| Max users | Unlimited | Anyone can deploy |
| Asset universe | 4 initially | Expand in v2.1 |
| Factory allowlist | Disabled | Open access |

### 7.3 Launch Checklist

- [ ] Remove allowlist from factory
- [ ] Update documentation to "Production"
- [ ] Announce on all channels
- [ ] Monitor first 24 hours closely
- [ ] Have incident response ready

### 7.4 Ongoing Operations

**Daily:**
- Monitor event dashboard
- Check oracle freshness alerts
- Review failed transactions

**Weekly:**
- Gas cost trend analysis
- Slippage pattern review
- User growth metrics
- Bug bounty submissions

**Monthly:**
- Security review
- Gas optimization opportunities
- Feature request prioritization

---

## 8. Emergency Procedures

### 8.1 Incident Classification

| Severity | Definition | Response Time |
|----------|------------|---------------|
| SEV-0 (Critical) | Active fund loss | Immediate (minutes) |
| SEV-1 (High) | Potential fund loss | 1 hour |
| SEV-2 (Medium) | Degraded functionality | 24 hours |
| SEV-3 (Low) | Minor issue | 1 week |

### 8.2 Response Actions

**SEV-0: Active Fund Loss**
1. Pause ALL v2 vaults immediately (if pausable)
2. Communicate: "Investigating potential issue. Withdrawals remain available."
3. Assess scope and impact
4. If confirmed: Advise all users to withdraw
5. Post-mortem within 24 hours

**SEV-1: Potential Fund Loss**
1. Investigate immediately
2. Prepare pause if needed
3. Communicate within 1 hour
4. Fix or mitigate within 24 hours

**SEV-2: Degraded Functionality**
1. Investigate within 4 hours
2. Communicate if user-facing
3. Fix in next release

**SEV-3: Minor Issue**
1. Log in issue tracker
2. Fix in scheduled maintenance

### 8.3 Communication Channels

| Channel | Use |
|---------|-----|
| Discord #announcements | Primary user communication |
| Twitter/X | Public status updates |
| Status page | Service status |
| Email list | Critical security notices |

### 8.4 Pause Authority

Who can pause:
1. Smart contract owner (deployer wallet)
2. Emergency multisig (if configured)

Users cannot pause their own vaults, but they CAN:
- Withdraw all assets at any time
- Stop using auto-rebalance

---

## 9. Rollback Plan

### 9.1 If v2 Fails Critically

1. **Immediate:** Pause factory (no new v2 deployments)
2. **Communication:** "v2 is paused. v1 remains available."
3. **User action:** Withdraw from v2, use v1
4. **Technical:** Fix issue, redeploy as v2.1

### 9.2 Migration Path

v2 contracts are immutable. If critical flaw found:
- Deploy new v2.1 contracts
- Users manually withdraw from v2
- Users deposit into v2.1
- No automatic migration (security risk)

---

## 10. Success Metrics

### 10.1 Phase Success Criteria

| Metric | Phase 2 | Phase 3 | Phase 4 (30 days) |
|--------|---------|---------|-------------------|
| TVL | $50K | $500K | $5M |
| Vaults | 10 | 100 | 500 |
| Rebalances | 30 | 500 | 5,000 |
| Failed tx | 0 critical | <5 | <50 |
| Bugs found | 0 critical | 0 critical | 0 critical |

### 10.2 Long-term Health Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Avg slippage | <0.5% | >1% |
| Avg gas per rebalance | <200K | >500K |
| Oracle freshness | >99% | <95% |
| Rebalance success rate | >99% | <95% |

---

## 11. Timeline Summary

| Week | Phase | Key Milestone |
|------|-------|---------------|
| 1-4 | Internal | All tests pass, audit ready |
| 5-8 | Testnet | Community testing complete |
| 9-12 | Guarded | Team mainnet validation |
| 13-16 | Limited | 100 users, $100K cap |
| 17+ | GA | Open to all |

**Total time:** ~4 months from Phase 0 start to GA

---

## 12. Approvals

Each phase transition requires explicit approval:

| Transition | Approvers |
|------------|-----------|
| Phase 0 → 1 | Engineering lead |
| Phase 1 → 2 | Engineering + Product |
| Phase 2 → 3 | Engineering + Product + Security |
| Phase 3 → 4 | Full team + Audit firm sign-off |

**No approval = No transition**

---

*This document governs the v2 rollout. Any deviation requires explicit team approval and documentation.*
