# Meezan

Simple allocation between BTC and USD. Non-custodial.

## What is Meezan?

Meezan is a non-custodial vault system. You choose a target allocation, deposit USDC, and the vault maintains the split between BTC and USDC.

**Key features:**
- Non-custodial (you own your vault)
- Value-based allocation using Chainlink price feeds
- Automatic rebalancing with safety guardrails
- Withdraw anytime

## Quick Start

### Prerequisites
- Node.js 18+
- Foundry (for contracts)

### Run the Web App

```bash
cd apps/web
npm install
npm run dev
```

Visit http://localhost:3000

### Run Contract Tests

```bash
cd packages/contracts
forge test --no-match-path test/ForkProof.t.sol
```

(The fork test requires `BASE_RPC` env var - see DEPLOY.md)

## Project Structure

```
meezan/
├── apps/
│   └── web/              # Next.js web UI
├── packages/
│   └── contracts/        # Solidity smart contracts
├── docs/                 # Product documentation
├── ops/                  # Operations status tracking
├── DEPLOY.md            # Deployment instructions
└── README.md
```

## Allocations

| Name | BTC | USDC |
|------|-----|------|
| 10 / 90 | 10% | 90% |
| 25 / 75 | 25% | 75% |
| 50 / 50 | 50% | 50% |
| 75 / 25 | 75% | 25% |
| 90 / 10 | 90% | 10% |

## How It Works

1. **Connect** your wallet (Coinbase Wallet or MetaMask)
2. **Choose** an allocation (e.g., 50/50)
3. **Deposit** USDC - it allocates to your target
4. **Rebalance** when drift exceeds threshold
5. **Withdraw** anytime

## Technical Details

- **Network:** Base mainnet
- **Assets:** cbBTC (Bitcoin) + USDC
- **Oracles:** Chainlink BTC/USD and USDC/USD
- **Swaps:** Uniswap v3 (0.05% pool fee)
- **Slippage:** 1% cap (configurable)
- **Rebalance threshold:** 5% drift
- **Dust threshold:** $10 minimum swap

## Security

- All funds are held in your personal vault contract
- Only the vault owner can deposit, withdraw, or rebalance
- No admin keys, no upgradability
- Reentrancy protection on all money-moving functions
- Pausable in emergencies (owner only)

## Launch Posture

### What Meezan Is

- Open-source software for personal use
- A mechanical system that maintains a target ratio
- Non-custodial: you control your funds
- Immutable: deployed contracts cannot be changed

### What Meezan Is NOT

- Investment advice or a financial product
- A managed service or fund
- A recommendation to buy any asset
- A guarantee of any outcome

See [DISCLAIMER.md](./DISCLAIMER.md) for full terms.

## Operational Monitoring

### Status Page

Visit `/status` in the web app to check system health:

- **Operational**: All services functioning normally
- **Degraded**: One or more services experiencing issues
- **Down**: Critical services unavailable

### API Endpoint

```
GET /api/status
```

Returns JSON with:
- Overall status (operational / degraded / down)
- Oracle freshness (BTC/USD and USDC/USD feeds)
- Factory contract accessibility
- Vault creation count

### What We Monitor

| Check | Threshold | Impact if Failed |
|-------|-----------|------------------|
| BTC/USD feed | < 1 hour old | Deposits/rebalances may fail |
| USDC/USD feed | < 1 hour old | Deposits/rebalances may fail |
| Factory contract | Must be readable | New vaults cannot be created |

### Self-Monitoring

Users can independently verify:
- Contract state on [Basescan](https://basescan.org/address/0x9FfD7a7dd2C730f1E85643868B645778feDF4f8b)
- Oracle prices on [Chainlink](https://data.chain.link/)
- Pool liquidity on [Uniswap](https://app.uniswap.org/)

## Deployment

See [DEPLOY.md](./DEPLOY.md) for full deployment instructions.

## License

MIT
