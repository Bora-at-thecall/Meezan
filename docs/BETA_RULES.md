# Beta Rules

Meezan is in public beta. Here's what that means for early users.

---

## Current limits

| Limit | Value | Reason |
|-------|-------|--------|
| Suggested max deposit | $1,000 | Beta software, unaudited |
| Minimum deposit | $50 | Gas costs make smaller amounts inefficient |
| Assets | BTC, ETH, USDC only | Starting simple |
| Chain | Base only | Starting simple |

These are recommendations, not enforced limits. The contracts accept any amount.

---

## What to expect

**Will work:**
- Creating a vault
- Depositing USDC
- Automatic allocation to BTC/ETH/USDC
- Manual rebalancing
- Full withdrawal

**May have rough edges:**
- UI may show stale data briefly after transactions
- RPC errors may require page refresh
- Mobile experience not optimized

**Not yet available:**
- Automatic rebalancing (keeper integration)
- Additional assets
- Detailed analytics
- Mobile app

---

## Risk acknowledgment

By using Meezan beta, you understand:

1. **Smart contract risk**: Contracts are tested but not audited. Bugs could result in loss of funds.

2. **Oracle risk**: Price feeds could be manipulated or stale. Slippage protection mitigates but doesn't eliminate this.

3. **DEX risk**: Uniswap liquidity could be thin for large trades, causing higher slippage.

4. **User error**: Incorrect transactions cannot be reversed. There is no customer support hotline.

5. **Beta software**: Features may change. UI may have bugs. This is not a finished product.

---

## Recommended beta behavior

**Do:**
- Start with small amounts ($50-100)
- Verify transactions on Basescan
- Keep records of your vault address
- Report bugs if you find them

**Don't:**
- Deposit more than you can afford to lose
- Assume everything will work perfectly
- Expect instant support
- Share your vault address publicly (privacy)

---

## Reporting issues

If something goes wrong:

1. Don't panic - your funds are in your own contract
2. Note the transaction hash and vault address
3. Check Basescan to verify actual on-chain state
4. Report via GitHub issues or direct contact

---

## When beta ends

Beta ends when:
- Formal audit is complete
- Keeper automation is live
- UI is polished
- Documentation is complete

At that point, limits will be revisited and the "beta" label removed.

---

## One last thing

Meezan is built by a small team. We use it ourselves. We want it to work well. But we're not infallible, and neither is the code.

If you're not comfortable with these terms, please wait for the audited release.

If you proceed, thank you for being an early user. Your feedback shapes the product.
