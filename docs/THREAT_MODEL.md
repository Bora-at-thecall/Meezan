# Meezan Threat Model

**Version:** 1.0
**Last Updated:** 2026-01-20
**Status:** Pre-Audit

---

## Overview

Meezan is a non-custodial vault system for maintaining a target BTC/USDC allocation on Base. Users deploy personal vaults via a factory contract and can deposit, withdraw, and rebalance assets.

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
5. **Token Contract Integrity:** cbBTC and USDC contracts behave as standard ERC20.

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
3. **Understand asset risks** - cbBTC and USDC have issuer dependencies
4. **Monitor your vault** - Meezan does not provide alerts
5. **Set appropriate slippage** - Balance between execution and protection
6. **Understand rebalancing costs** - Each rebalance incurs swap fees and gas

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
