# Security

## Reporting Vulnerabilities

If you discover a security vulnerability in Meezan, please report it responsibly.

**Do NOT:**
- Open a public GitHub issue
- Discuss the vulnerability publicly before it is fixed

**Do:**
- Email details to the repository owner
- Include steps to reproduce
- Allow reasonable time for a fix before disclosure

## Architecture

### Non-Custodial Design

- Each user deploys their own vault contract via the factory
- Only the vault owner can deposit, withdraw, or rebalance
- No admin keys, no multisig, no governance
- Contracts are immutable (no upgrades)

### Access Control

| Function | Who Can Call |
|----------|--------------|
| deposit | Owner only |
| withdraw | Owner only |
| withdrawAll | Owner only |
| rebalance | Owner (or executor if enabled) |
| pause/unpause | Owner only |
| transferOwnership | Owner only |
| acceptOwnership | Pending owner only |

### Protections

- **Reentrancy:** All money-moving functions use OpenZeppelin's `nonReentrant` modifier
- **Slippage:** Configurable cap (default 1%, max 5%)
- **Oracle Staleness:** Prices rejected if older than 1 hour
- **Dust Threshold:** Swaps below $10 USD value are skipped
- **Drift Threshold:** Rebalancing requires minimum 5% drift

### Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| OpenZeppelin Contracts | 5.x | Access control, reentrancy, pausable |
| Chainlink | - | Price feeds |
| Uniswap V3 | - | Swap execution |

### Known Limitations

1. **Single Custodian Risk:** cbBTC is backed by Coinbase. If Coinbase fails, cbBTC may lose backing.

2. **Oracle Risk:** If Chainlink feeds are compromised or delayed, incorrect prices could be used.

3. **Liquidity Risk:** If Uniswap pool liquidity is insufficient, swaps may fail or incur high slippage.

4. **Smart Contract Risk:** Despite testing, bugs may exist. Use at your own risk.

## Audit Status

- 158 unit tests pass
- No formal third-party audit has been conducted
- Code is open source for review

## Contact

For security concerns, contact the repository owner through GitHub.
