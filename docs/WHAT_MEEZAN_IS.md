# What Meezan Is

## One sentence

Meezan is a non-custodial smart contract that automatically rebalances your crypto portfolio to target allocations.

---

## What Meezan IS

**A personal vault contract**
- Deployed on Base mainnet
- Owned entirely by you
- Holds your BTC, ETH, and USDC

**An automatic rebalancer**
- You set target weights (e.g., 40/40/20)
- You set a drift threshold (e.g., 5%)
- When any asset drifts beyond threshold, rebalancing is available
- Sells overweight assets, buys underweight assets

**Non-custodial**
- Your private keys control your vault
- Meezan has no admin keys to your funds
- Only you can deposit, withdraw, or trigger rebalance

**Transparent**
- All contracts verified on Basescan
- Prices from Chainlink oracles
- Swaps via Uniswap V3

---

## What Meezan is NOT

**Not a fund or managed account**
- We don't make investment decisions for you
- We don't have access to your funds
- We don't take custody of anything

**Not a trading bot**
- No automatic execution (yet)
- You trigger rebalances manually
- No algorithmic trading strategies

**Not a yield protocol**
- Your assets sit in your vault
- No lending, staking, or farming
- No yield optimization

**Not audited (yet)**
- Contracts are tested but not formally audited
- Use at your own risk
- Beta software

**Not financial advice**
- Meezan is a tool, not investment guidance
- Portfolio allocation is your decision
- Past performance doesn't predict future results

---

## Technical facts

| Component | Implementation |
|-----------|----------------|
| Chain | Base (L2 on Ethereum) |
| Assets | cbBTC, WETH, USDC |
| DEX | Uniswap V3 |
| Oracles | Chainlink |
| Slippage | 1% max per swap |
| Min swap | $10 USD equivalent |

---

## How funds flow

```
You → USDC deposit → Your Vault → Uniswap swaps → BTC/ETH/USDC holdings
                         ↑
                    You own this
```

Withdrawal reverses this flow. Assets go directly to your wallet.

---

## Questions?

If something is unclear, ask before depositing. Meezan is open about what it does and doesn't do.
