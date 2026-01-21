# Meezan Security Checklist

**Version:** 1.0
**Last Updated:** 2026-01-20

---

## Pre-Deployment Checklist

### 1. Contract Configuration

| Check | Status | Verified By | Date |
|-------|--------|-------------|------|
| Token A (cbBTC) address is correct | | | |
| Token B (USDC) address is correct | | | |
| BTC/USD Chainlink feed address is correct | | | |
| USDC/USD Chainlink feed address is correct | | | |
| Uniswap V3 SwapRouter address is correct | | | |
| Pool fee is valid (100, 500, 3000, 10000) | | | |
| Network is Base mainnet (chain ID 8453) | | | |

**Addresses for Base Mainnet:**
```
cbBTC:        0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf
USDC:         0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
BTC/USD Feed: 0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D
USDC/USD Feed:0x7e860098F58bBFC8648a4311b374B1D669a2bc6B
SwapRouter:   0x2626664c2603336E57B271c5C0b26F421741e481
Pool Fee:     500 (0.05%)
```

### 2. Contract Constants

| Check | Expected Value | Status |
|-------|----------------|--------|
| `MIN_DRIFT_BPS` | 200 (2%) | |
| `MAX_DRIFT_BPS` | 2000 (20%) | |
| `DEFAULT_DRIFT_BPS` | 500 (5%) | |
| `COOLDOWN_SECONDS` | 43200 (12 hours) | |
| `MAX_PRICE_STALENESS` | 3600 (1 hour) | |
| `MAX_PRICE_STALENESS_STABLE` | 90000 (25 hours) | |
| `MIN_SWAP_USD` | 1e18 ($1) | |
| `MIN_SLIPPAGE_BPS` | 10 (0.1%) | |
| `MAX_SLIPPAGE_BPS` | 500 (5%) | |
| `DEFAULT_SLIPPAGE_BPS` | 100 (1%) | |

### 3. Static Analysis

| Check | Status | Notes |
|-------|--------|-------|
| Slither analysis completed | | |
| High severity findings addressed | | |
| Medium severity findings reviewed | | |
| No uninitialized storage pointers | | |
| No tx.origin usage | | |
| No unchecked external calls | | |

### 4. Test Coverage

| Check | Status | Notes |
|-------|--------|-------|
| Unit tests pass | | |
| Fuzz tests pass | | |
| Invariant tests pass | | |
| Fork tests pass (if applicable) | | |
| Coverage > 90% on critical paths | | |

---

## Post-Deployment Verification

### 1. Contract Verification

| Check | Status | Notes |
|-------|--------|-------|
| Factory contract verified on Basescan | | |
| Factory contract verified on Sourcify | | |
| Vault implementation verified | | |
| Source code matches deployment | | |

### 2. Configuration Verification

Execute these read calls on deployed Factory:

```solidity
// Verify token addresses
factory.tokenA() == 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf
factory.tokenB() == 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

// Verify oracle addresses
factory.priceFeedA() == 0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D
factory.priceFeedB() == 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B

// Verify router
factory.swapRouter() == 0x2626664c2603336E57B271c5C0b26F421741e481
factory.poolFee() == 500
```

### 3. Functionality Verification

| Check | Status | Notes |
|-------|--------|-------|
| Can create vault with preset | | |
| Can create advanced vault | | |
| Can deposit USDC | | |
| Can withdraw all | | |
| Can rebalance when drift exceeds threshold | | |
| Rebalance reverts below threshold | | |
| Owner functions restricted correctly | | |
| Pause/unpause works | | |

### 4. Oracle Verification

| Check | Status | Notes |
|-------|--------|-------|
| BTC/USD feed returns price | | |
| USDC/USD feed returns price | | |
| Prices are within expected range | | |
| updatedAt is recent | | |
| answeredInRound >= roundId | | |

---

## Monitoring Checklist

### Daily Checks

| Check | Frequency | Status |
|-------|-----------|--------|
| Oracle feeds are updating | Daily | |
| No unusual rebalance activity | Daily | |
| No failed transactions in vaults | Daily | |
| Pool liquidity is adequate | Daily | |

### Weekly Checks

| Check | Frequency | Status |
|-------|-----------|--------|
| Review Chainlink feed health | Weekly | |
| Check Uniswap pool metrics | Weekly | |
| Verify no governance proposals affecting deps | Weekly | |

### Event Monitoring

Set up alerts for:

- [ ] `Rebalanced` events with large `amountIn` values
- [ ] `OwnershipTransferStarted` events
- [ ] `Paused` events on any vault
- [ ] Oracle heartbeat delays > 1 hour

---

## Incident Response Checklist

### On Vulnerability Discovery

1. [ ] **Assess severity** - Is fund loss possible?
2. [ ] **Pause if critical** - Owner calls `pause()` on affected vaults
3. [ ] **Document details** - Capture all relevant information
4. [ ] **Notify users** - Via official channels only
5. [ ] **Coordinate fix** - If applicable
6. [ ] **Post-mortem** - Document what happened and why

### On Oracle Failure

1. [ ] **Monitor Chainlink status** - Check official channels
2. [ ] **Expect reverts** - Vault operations will fail safely
3. [ ] **Withdrawals work** - Users can always withdraw (no oracle needed)
4. [ ] **Wait for recovery** - Do not attempt workarounds

### On DEX Issues

1. [ ] **Monitor Uniswap status** - Check official channels
2. [ ] **Expect swap failures** - Rebalances will revert
3. [ ] **Deposits work** - Plain deposits still function
4. [ ] **Withdrawals work** - Always available

---

## Frontend Security Checklist

### Build-time Checks

| Check | Status | Notes |
|-------|--------|-------|
| No secrets in source code | | |
| Contract addresses hardcoded (not env vars) | | |
| CSP headers configured | | |
| Dependencies audited | | |
| npm audit shows no high/critical | | |

### Runtime Checks

| Check | Status | Notes |
|-------|--------|-------|
| Only Base chain in wagmi config | | |
| No dynamic contract address injection | | |
| Vault addresses verified on-chain before use | | |
| Basescan links present for contracts | | |
| Transaction data visible before signing | | |

---

## Audit Preparation Checklist

### Documentation

| Document | Status | Location |
|----------|--------|----------|
| THREAT_MODEL.md | | `/docs/` |
| SECURITY_CHECKLIST.md | | `/docs/` |
| Deployment documentation | | `/DEPLOY.md` |
| Architecture overview | | `/README.md` |

### Code Organization

| Item | Status | Notes |
|------|--------|-------|
| Single repository with all contracts | | |
| Clear directory structure | | |
| Minimal external dependencies | | |
| All imports from standard sources | | |

### Test Artifacts

| Item | Status | Notes |
|------|--------|-------|
| Unit tests | | |
| Fuzz tests | | |
| Invariant tests | | |
| Gas snapshots | | |

---

## Signature Block

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Developer | | | |
| Reviewer | | | |
| Security Lead | | | |
