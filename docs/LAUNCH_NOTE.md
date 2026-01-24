# Meezan Launch Note

## What is Meezan?

Meezan is a non-custodial portfolio management tool on Base. You deposit USDC, choose your allocation (e.g., 40% BTC, 40% ETH, 20% USDC), and Meezan automatically rebalances when assets drift from your targets.

## How it works

1. You create a personal vault contract (you own it, not us)
2. You deposit USDC
3. Meezan swaps into your chosen allocation via Uniswap
4. When prices move and allocations drift, you can rebalance
5. You can withdraw anytime

## What makes it different

- **Non-custodial**: Your funds stay in your own smart contract
- **No intermediaries**: Direct swaps on Uniswap V3
- **Transparent**: All contracts verified on Basescan
- **Simple**: One-click rebalancing

## Current status

Meezan is in public beta on Base mainnet. The smart contracts have been tested but not yet formally audited.

## Trust model

- Meezan cannot access, move, or freeze your funds
- Only you can withdraw from your vault
- All swap routing uses Chainlink price feeds
- Slippage protection is enforced on every trade

## Links

- App: [meezan.app](https://meezan.app) (coming soon)
- Contracts: [Basescan](https://basescan.org/address/0xc24F363E8F1Df37AEBfb50366118DfafF21983CA)
- Source: Available upon request

---

*Built on Base. Your keys, your funds.*
