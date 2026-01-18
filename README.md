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

## Deployment

See [DEPLOY.md](./DEPLOY.md) for full deployment instructions.

## License

MIT
