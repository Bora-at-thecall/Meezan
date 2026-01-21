# Meezan Threat Model

**Version:** 1.1
**Last Updated:** 2026-01-21
**Status:** Pre-Audit

---

## Overview

Meezan is a non-custodial vault system for maintaining target portfolio allocations on Base. Users deploy personal vaults via a factory contract and can deposit, withdraw, and rebalance assets.

- **v1:** Two-asset portfolios (BTC/USDC)
- **v2:** Multi-asset portfolios (up to 10 assets)

This document identifies potential threats, existing mitigations, remaining risks, and user responsibilities.

---

## Threat Categories

### 1. Smart Contract Vulnerabilities

#### 1.1 Reentrancy

**Threat:** Malicious token or external call could re-enter the vault during state transitions.

**Mitigations Implemented:**
- `ReentrancyGuard` from OpenZeppelin on `depositUSDC()` and `rebalance()`
- Uses `safeTransfer` and `safeTransferFrom` from SafeERC20
- State changes occur before external calls where possible

**Residual Risk:** LOW. Standard reentrancy patterns are covered.

#### 1.2 Integer Overflow/Underflow

**Threat:** Arithmetic errors could lead to incorrect allocations or fund loss.

**Mitigations Implemented:**
- Solidity 0.8.20+ with built-in overflow/underflow checks
- Uses OpenZeppelin `Math.mulDiv` for precision-safe calculations
- All percentage calculations use basis points (BPS) with explicit denominators

**Residual Risk:** LOW. Compiler-level protection and audited math libraries.

#### 1.3 Access Control Bypass

**Threat:** Unauthorized parties could drain funds or manipulate vault state.

**Mitigations Implemented:**
- `onlyOwner` modifier for all owner functions
- `onlyOwnerOrExecutor` for rebalance (executor requires both address set AND `autoRebalanceEnabled`)
- Two-step ownership transfer prevents accidental transfers
- Owner can pause deposits/rebalance but withdrawals always work

**Residual Risk:** LOW. Single-owner model with explicit checks.

#### 1.4 Approval Residuals

**Threat:** Leftover approvals could be exploited by compromised swap router.

**Mitigations Implemented:**
- `forceApprove` sets exact needed amount before swap
- `forceApprove(address, 0)` immediately after swap completes
- Approvals are per-transaction, not persistent

**Residual Risk:** LOW. Zero-approval pattern after each swap.

#### 1.5 Slippage Exploitation (Sandwich Attacks)

**Threat:** MEV bots could sandwich swap transactions for profit at user expense.

**Mitigations Implemented:**
- Slippage cap enforced: MIN 0.1%, MAX 5%, DEFAULT 1%
- Oracle-based expected amount with slippage buffer
- `exactOutputSingle` ensures minimum received amount
- Revert if actual spend exceeds `amountInMaximum`

**Residual Risk:** MEDIUM. Sandwich attacks are possible within slippage tolerance. Users can reduce exposure by:
- Setting lower slippage (may cause failed transactions in volatile markets)
- Rebalancing during low-volatility periods

---

### 2. Oracle Vulnerabilities

#### 2.1 Price Manipulation

**Threat:** Manipulated oracle prices could cause incorrect swap amounts.

**Mitigations Implemented:**
- Uses Chainlink price feeds (industry standard, decentralized)
- Separate staleness checks: 1 hour for BTC, 25 hours for USDC
- Rejects negative or zero prices
- Rejects incomplete rounds (`answeredInRound < roundId`)

**Residual Risk:** MEDIUM. Chainlink oracle manipulation would require significant capital. Flash loan attacks cannot affect Chainlink's aggregated price.

#### 2.2 Oracle Staleness

**Threat:** Stale prices could cause swaps at incorrect rates.

**Mitigations Implemented:**
- `MAX_PRICE_STALENESS = 3600` (1 hour) for volatile assets (BTC)
- `MAX_PRICE_STALENESS_STABLE = 90000` (25 hours) for stablecoins
- Explicit `StalePrice` revert if `block.timestamp - updatedAt > maxStaleness`
- Explicit `IncompleteRound` revert if `answeredInRound < roundId`

**Residual Risk:** LOW for normal operations. During extreme network congestion or Chainlink outages, operations will be blocked (fail-safe).

#### 2.3 Feed Misconfiguration

**Threat:** Wrong price feed addresses could cause catastrophic mispricing.

**Mitigations Implemented:**
- Feed addresses are immutable (set at deployment)
- Factory uses hardcoded, verified Chainlink addresses
- Constructor validates feed decimals

**Residual Risk:** LOW post-deployment. Critical to verify addresses pre-deployment.

---

### 3. DEX/Swap Vulnerabilities

#### 3.1 Router Compromise

**Threat:** Compromised or malicious swap router could steal approved funds.

**Mitigations Implemented:**
- Swap router address is immutable (set at deployment)
- Factory uses hardcoded Uniswap V3 SwapRouter address
- Approvals are zeroed immediately after each swap
- Dust threshold ($1 MIN_SWAP_USD) prevents griefing via micro-swaps

**Residual Risk:** LOW. Uniswap V3 router is battle-tested. Address cannot be changed post-deployment.

#### 3.2 Pool Fee Manipulation

**Threat:** Wrong pool fee could route through low-liquidity pools.

**Mitigations Implemented:**
- Pool fee is immutable (set at deployment)
- Constructor validates against allowed fees: 100, 500, 3000, 10000 (0.01%, 0.05%, 0.3%, 1%)
- Factory uses 500 (0.05%) for cbBTC/USDC which has deep liquidity

**Residual Risk:** LOW. Immutable and validated.

#### 3.3 Insufficient Liquidity

**Threat:** Large swaps could exhaust pool liquidity, causing high slippage or failed transactions.

**Mitigations Implemented:**
- Slippage protection reverts if execution exceeds tolerance
- Uses `exactOutputSingle` which specifies desired output and caps input
- User-controlled slippage setting (0.1% to 5%)

**Residual Risk:** MEDIUM. Very large positions may have difficulty rebalancing in volatile markets. Users should consider:
- Position size relative to pool liquidity
- Breaking large rebalances into multiple smaller operations

---

### 4. Frontend Vulnerabilities

#### 4.1 Contract Address Spoofing

**Threat:** User could be tricked into interacting with malicious contracts.

**Mitigations Implemented:**
- Contract addresses hardcoded in `lib/contracts.ts`
- No dynamic injection from URL params or localStorage for contract addresses
- Vault addresses stored locally but verified on-chain before use
- Basescan verification links provided

**Residual Risk:** LOW if users verify addresses match expected values.

#### 4.2 Cross-Site Scripting (XSS)

**Threat:** Malicious scripts could steal private keys or manipulate transactions.

**Mitigations Implemented:**
- React's built-in XSS protection
- No `dangerouslySetInnerHTML` usage
- CSP headers (to be added)

**Residual Risk:** LOW with proper CSP implementation.

#### 4.3 Chain Confusion

**Threat:** User connects on wrong network, transactions fail or go to wrong contracts.

**Mitigations Implemented:**
- wagmi config only includes Base chain
- Network indicator shows current chain
- Wallet prompts for network switch if needed

**Residual Risk:** LOW. Single-chain configuration prevents confusion.

---

### 5. User Key Compromise

#### 5.1 Private Key Theft

**Threat:** Compromised wallet allows attacker to drain all vault funds.

**Mitigations Implemented:**
- Non-custodial: Meezan never has access to user keys
- Pause functionality allows owner to stop deposits/rebalances
- Withdrawals always work (even when paused)

**Residual Risk:** HIGH (user responsibility). If keys are compromised, funds can be stolen. This is inherent to self-custody.

**User Responsibilities:**
- Secure private key storage (hardware wallet recommended)
- Do not share seed phrases
- Verify transaction details before signing

#### 5.2 Executor Key Compromise

**Threat:** Compromised executor could trigger unwanted rebalances.

**Mitigations Implemented:**
- Executor requires explicit `autoRebalanceEnabled = true`
- 12-hour cooldown between executor rebalances
- Owner can disable auto-rebalance or change executor
- Executor cannot withdraw funds (only rebalance)
- Drift threshold must be met for rebalance to execute

**Residual Risk:** MEDIUM. Executor can only rebalance, not steal. Maximum damage is suboptimal swap timing within slippage limits.

---

### 6. Asset/Issuer Risk

#### 6.1 cbBTC Depeg

**Threat:** cbBTC loses peg to BTC, causing holder losses.

**Assessment:** cbBTC is Coinbase's wrapped Bitcoin on Base. Backed 1:1 by BTC in Coinbase custody.

**Residual Risk:** MEDIUM. Depends on Coinbase solvency and operational security. Meezan cannot mitigate this.

**User Responsibilities:**
- Understand that cbBTC is a wrapped asset with counterparty risk
- Monitor Coinbase health and cbBTC peg

#### 6.2 USDC Depeg

**Threat:** USDC loses peg to USD, causing holder losses.

**Assessment:** USDC is Circle's stablecoin, backed by cash and short-term treasuries.

**Residual Risk:** LOW-MEDIUM. Circle is regulated and audited, but depeg events have occurred (March 2023 SVB exposure).

**User Responsibilities:**
- Understand stablecoin risks
- Monitor USDC reserve composition

#### 6.3 Base Network Risk

**Threat:** Base L2 experiences outage, sequencer failure, or bridge exploit.

**Assessment:** Base is operated by Coinbase with Optimism technology. Funds can be withdrawn to Ethereum mainnet via bridge with delay.

**Residual Risk:** MEDIUM. L2-specific risks include sequencer centralization and bridge security.

---

## 7. Meezan v2 Specific Threats

*This section covers threats specific to multi-asset portfolio support in v2.*

### 7.1 Multi-Leg Swap Vulnerabilities

#### 7.1.1 Swap Ordering Attacks

**Threat:** Attacker manipulates the order of swaps in a multi-asset rebalance to extract value.

**Scenario:**
1. Vault needs to sell Asset A → USDC, then buy Asset B ← USDC
2. Attacker front-runs first swap, moving A/USDC price down
3. Attacker back-runs second swap, moving USDC/B price up
4. Vault loses value on both legs

**Proposed Mitigations:**
- Per-swap slippage enforcement (not just aggregate)
- Oracle-based price bounds for each swap
- All swaps in single transaction (no state between swaps)

**Residual Risk:** MEDIUM-HIGH. Multi-swap increases MEV extraction surface. Users should:
- Set conservative slippage (1% default)
- Monitor rebalance costs over time
- Consider private mempools for large rebalances (future)

#### 7.1.2 Intermediary Balance Manipulation

**Threat:** USDC balance changes between sell phase and buy phase of rebalance.

**Scenario:**
1. Vault sells excess BTC → USDC (gains USDC)
2. Before buy phase, attacker exploits bug to drain USDC
3. Buy phase fails due to insufficient USDC

**Proposed Mitigations:**
- All phases execute in single transaction
- NonReentrant modifier on entire rebalance
- No external calls between sell and buy phases (except router)

**Residual Risk:** LOW if properly implemented. Reentrancy guard is critical.

#### 7.1.3 Swap Count Explosion

**Threat:** Attacker crafts portfolio state requiring excessive swaps, causing gas exhaustion.

**Scenario:**
1. Portfolio with 10 assets all slightly off-target
2. Rebalance requires 18 swaps (2 × 9 non-stablecoin assets)
3. Transaction exceeds block gas limit

**Proposed Mitigations:**
- Maximum swaps per rebalance (6 default, configurable)
- Partial rebalance with deferred completion
- Gas budget check before execution

**Residual Risk:** MEDIUM. Partial rebalances are less optimal but safe. Users should:
- Understand that very complex portfolios may require multiple rebalances
- Monitor gas costs for multi-asset operations

---

### 7.2 Partial Rebalance Risks

#### 7.2.1 Incomplete State

**Threat:** Partial rebalance leaves portfolio in worse state than before.

**Scenario:**
1. Portfolio is 7% off target overall
2. Partial rebalance corrects 3 assets but skips 2 due to gas/slippage
3. Post-rebalance drift is 8% (worse than before)

**Proposed Mitigations:**
- Prioritize largest deviations first
- Emit detailed events showing what was skipped
- Clear UI indication of partial completion

**Residual Risk:** MEDIUM. Partial rebalances are a necessary tradeoff for gas bounds. Users should:
- Review post-rebalance state
- Trigger additional rebalance if needed

#### 7.2.2 Skipped Swap Exploitation

**Threat:** Attacker intentionally causes specific swaps to skip, benefiting from imbalanced state.

**Scenario:**
1. Attacker manipulates pool liquidity for Asset X
2. Swap to/from Asset X always fails slippage check
3. Portfolio remains permanently imbalanced in Asset X

**Proposed Mitigations:**
- Track skip patterns across rebalances
- Circuit breaker if same swap skips N times
- Alert user to persistent liquidity issues

**Residual Risk:** MEDIUM. Sophisticated attack requiring sustained liquidity manipulation.

---

### 7.3 Oracle Coordination Risks

#### 7.3.1 Partial Oracle Staleness

**Threat:** Some oracles are fresh, others are stale, causing misaligned pricing.

**Scenario:**
1. BTC oracle updated 30 minutes ago (fresh)
2. SOL oracle updated 2 hours ago (stale)
3. Rebalance uses misaligned prices, causing unfavorable swaps

**Proposed Mitigations:**
- All-or-nothing oracle validation: if ANY oracle is stale, revert entire rebalance
- Per-asset staleness thresholds based on asset volatility
- Stablecoin oracles: 25 hours (update daily)
- Volatile assets: 1 hour (update on price deviation)

**Residual Risk:** LOW if all-or-nothing policy enforced. Operations blocked during oracle issues.

#### 7.3.2 Oracle Desync During Rebalance

**Threat:** Oracle prices change between drift calculation and swap execution.

**Scenario:**
1. Drift calculated with BTC at $100,000
2. During swap execution, BTC updates to $95,000
3. Swap amounts calculated on old price are now incorrect

**Proposed Mitigations:**
- Read all prices once at start of rebalance
- Use cached prices for all calculations in same transaction
- Slippage protection catches severe discrepancies

**Residual Risk:** LOW. Single-transaction execution and slippage bounds limit exposure.

#### 7.3.3 Oracle Feed Mismatch

**Threat:** Wrong oracle feed assigned to asset causes systematic mispricing.

**Scenario:**
1. ETH oracle accidentally assigned to SOL slot
2. All SOL swaps priced against ETH/USD
3. Massive losses on every SOL trade

**Proposed Mitigations:**
- Immutable feed assignment at deployment
- Factory uses hardcoded, verified feed addresses per asset
- Deployment verification checklist
- Fork test validates oracle/token pairs

**Residual Risk:** LOW post-deployment, CRITICAL during deployment. Must verify before mainnet.

---

### 7.4 Gas Exhaustion Scenarios

#### 7.4.1 Rebalance Gas Limit Exceeded

**Threat:** Complex rebalance exceeds block gas limit, becomes impossible to execute.

**Scenario:**
1. 10-asset portfolio, all assets need rebalancing
2. Estimated gas: 3M (exceeds typical block limit)
3. Rebalance cannot execute, portfolio remains imbalanced

**Proposed Mitigations:**
- Gas budget check before execution (default 500K, max 1M)
- Partial execution with priority ordering
- Defer remaining swaps to next rebalance

**Residual Risk:** MEDIUM. Very complex portfolios may require multiple transactions.

#### 7.4.2 Gas Price Manipulation

**Threat:** Attacker spikes gas prices to prevent rebalancing during critical periods.

**Scenario:**
1. Market drops 20%, urgent rebalance needed
2. Attacker floods mempool, gas prices 10x normal
3. User's slippage tolerance too tight at high gas
4. Rebalance fails, user exposed to unwanted position

**Proposed Mitigations:**
- This is a general blockchain risk, not specific to Meezan
- Users can increase gas limit/price in wallet
- Owner can always manually trigger without cooldown

**Residual Risk:** MEDIUM. General MEV/congestion risk. No contract-level mitigation.

#### 7.4.3 Oracle Read Gas Accumulation

**Threat:** Reading N oracles consumes excessive gas as asset count increases.

**Scenario:**
1. 10 assets = 10 oracle reads
2. Each oracle read: ~5,000 gas
3. Total oracle reads: 50,000 gas (before any swaps)

**Proposed Mitigations:**
- Batch oracle reads at transaction start
- Cache values in memory, not storage
- 10-asset limit caps worst case

**Residual Risk:** LOW. 50K gas for oracles is acceptable within overall budget.

---

### 7.5 Multi-Asset Specific Attacks

#### 7.5.1 Asset Weight Manipulation

**Threat:** Attacker manipulates asset prices to force unwanted rebalances.

**Scenario:**
1. Portfolio: 40% BTC, 30% ETH, 30% USDC (target)
2. Attacker pumps ETH price briefly
3. Portfolio reads as 35% BTC, 40% ETH, 25% USDC
4. Rebalance sells ETH at inflated price, buys BTC
5. Price normalizes, portfolio has less value

**Proposed Mitigations:**
- Chainlink aggregation resists short-term manipulation
- Staleness checks ensure recent prices
- Slippage bounds limit execution at manipulated prices
- User controls rebalance timing (not automatic unless executor)

**Residual Risk:** MEDIUM. Sophisticated attack requiring significant capital to move Chainlink prices.

#### 7.5.2 Dust Accumulation

**Threat:** Rounding errors accumulate dust across many assets.

**Scenario:**
1. Each swap leaves 0.0001 tokens of dust
2. 10 assets × 100 rebalances = significant dust
3. Dust cannot be rebalanced (below MIN_SWAP_USD)

**Proposed Mitigations:**
- MIN_SWAP_USD threshold ($1) prevents dust-creating micro-swaps
- Owner can rescue dust via rescueToken() if significant
- Withdrawal functions handle full balances

**Residual Risk:** LOW. Dust is an accounting annoyance, not a security issue.

#### 7.5.3 Correlated Asset Collapse

**Threat:** Multiple assets crash simultaneously, amplifying losses.

**Scenario:**
1. Portfolio: 30% BTC, 30% ETH, 30% SOL, 10% USDC
2. Crypto market drops 50% in hours
3. 90% of portfolio loses half its value
4. Drift threshold triggers sell at bottom

**Proposed Mitigations:**
- This is market risk, not a vulnerability
- UI shows correlation warnings
- User chooses allocation (Meezan doesn't advise)
- Pause functionality allows user to stop rebalancing during crashes

**Residual Risk:** HIGH (user responsibility). Meezan is a balance engine, not a risk management system.

---

### 7.6 v2 Approval Surface

#### 7.6.1 Multiple Approval Residuals

**Threat:** With N assets, N approvals must all be zeroed; missing one creates vulnerability.

**Scenario:**
1. Rebalance approves 5 different tokens to router
2. Bug causes one approval to persist
3. Compromised router drains that token

**Proposed Mitigations:**
- forceApprove(0) immediately after EACH swap
- Invariant test: post-rebalance, all approvals = 0
- No batched approvals (each swap is self-contained)

**Residual Risk:** LOW if invariant enforced. CRITICAL to test exhaustively.

#### 7.6.2 Approval During Partial Failure

**Threat:** Rebalance fails mid-execution, leaving approval residual.

**Scenario:**
1. Swap 1 succeeds (approval zeroed)
2. Swap 2 fails after approval but before execution
3. Approval for swap 2 persists

**Proposed Mitigations:**
- try/catch around each swap
- Always zero approval in finally block
- Alternative: approve → swap → zero in single internal function

**Residual Risk:** LOW if approval cleanup is unconditional.

---

## v2 Summary Risk Matrix (Additional)

| Category | Threat | Likelihood | Impact | Residual Risk |
|----------|--------|------------|--------|---------------|
| Multi-Swap | Ordering attacks | Medium | Medium | MEDIUM-HIGH |
| Multi-Swap | Intermediary manipulation | Low | High | LOW |
| Multi-Swap | Swap count explosion | Medium | Medium | MEDIUM |
| Partial | Incomplete state | Medium | Medium | MEDIUM |
| Partial | Skipped swap exploit | Low | Medium | MEDIUM |
| Oracle | Partial staleness | Low | High | LOW |
| Oracle | Desync during rebalance | Very Low | Medium | LOW |
| Oracle | Feed mismatch | Very Low | Critical | LOW |
| Gas | Rebalance limit exceeded | Medium | Medium | MEDIUM |
| Gas | Price manipulation | Medium | Medium | MEDIUM |
| Gas | Oracle read accumulation | Low | Low | LOW |
| Multi-Asset | Weight manipulation | Low | Medium | MEDIUM |
| Multi-Asset | Dust accumulation | Medium | Low | LOW |
| Multi-Asset | Correlated collapse | Medium | High | HIGH (user) |
| Approval | Multiple residuals | Low | Critical | LOW |
| Approval | Partial failure residual | Low | High | LOW |

---

## Summary Risk Matrix

| Category | Threat | Likelihood | Impact | Residual Risk |
|----------|--------|------------|--------|---------------|
| Contract | Reentrancy | Low | High | LOW |
| Contract | Integer overflow | Very Low | High | LOW |
| Contract | Access bypass | Very Low | Critical | LOW |
| Contract | Approval residuals | Low | Medium | LOW |
| Contract | Sandwich attacks | Medium | Medium | MEDIUM |
| Oracle | Price manipulation | Low | High | MEDIUM |
| Oracle | Staleness | Low | Medium | LOW |
| Oracle | Misconfiguration | Very Low | Critical | LOW |
| DEX | Router compromise | Very Low | Critical | LOW |
| DEX | Insufficient liquidity | Medium | Medium | MEDIUM |
| Frontend | Address spoofing | Low | High | LOW |
| Frontend | XSS | Low | High | LOW |
| User | Key compromise | Medium | Critical | HIGH (user) |
| User | Executor compromise | Low | Low | MEDIUM |
| Asset | cbBTC depeg | Low | High | MEDIUM |
| Asset | USDC depeg | Low | Medium | LOW-MEDIUM |
| Network | Base outage | Low | Medium | MEDIUM |

---

## Assumptions

1. **Chainlink Reliability:** Price feeds operate correctly and are not compromised.
2. **Uniswap Integrity:** Uniswap V3 router functions as documented.
3. **User Key Security:** Users secure their own private keys.
4. **Base Network Availability:** Base L2 operates with reasonable uptime.
5. **Token Contract Integrity:** All whitelisted tokens behave as standard ERC20.
6. **(v2) DEX Liquidity:** All whitelisted asset pairs have sufficient USDC liquidity for typical rebalance sizes.
7. **(v2) Oracle Availability:** All whitelisted assets have active Chainlink price feeds on Base.

---

## Out of Scope

1. **Social engineering attacks** targeting users directly
2. **Hardware wallet vulnerabilities**
3. **Browser or OS security** on user devices
4. **Regulatory changes** affecting asset legality
5. **Tax implications** of rebalancing events
6. **Smart contract upgrades** (contracts are immutable)

---

## User Responsibilities

1. **Secure your private keys** - Use hardware wallets for significant funds
2. **Verify contract addresses** - Check Basescan before interacting
3. **Understand asset risks** - All tokens have issuer and market dependencies
4. **Monitor your vault** - Meezan does not provide alerts
5. **Set appropriate slippage** - Balance between execution and protection
6. **Understand rebalancing costs** - Each rebalance incurs swap fees and gas
7. **(v2) Review multi-swap outcomes** - Verify all expected swaps executed
8. **(v2) Understand correlation risk** - Highly correlated portfolios move together
9. **(v2) Monitor gas costs** - Multi-asset rebalances cost more than single swaps

---

## Incident Response

If a vulnerability is discovered:

1. **Pause deposits/rebalance** via `pause()` function
2. **Users withdraw funds** via `withdrawAll()` (always works)
3. **Investigate and communicate** via official channels
4. **Deploy fixed contracts** if needed (new factory deployment)

Note: Existing vaults cannot be upgraded. Users would need to withdraw and deposit into new vaults.

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-20 | 1.0 | Initial threat model |
| 2026-01-21 | 1.1 | Added v2 multi-asset threat analysis |
