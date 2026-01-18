# Meezan Deployment Guide

This guide explains how to deploy Meezan to Base mainnet.

## Prerequisites

1. **Foundry** - Install from https://getfoundry.sh
2. **Node.js 18+** - For the web app
3. **Base ETH** - For gas fees (~0.01 ETH should be enough)
4. **Private key** - For the deployer wallet

## Step 1: Deploy the Factory Contract

The factory contract creates individual vaults for users.

```bash
# Navigate to contracts folder
cd packages/contracts

# Set environment variables
export PRIVATE_KEY=your_private_key_here
export BASE_RPC=https://mainnet.base.org

# Run the deployment
forge script script/DeployFactory.s.sol --rpc-url $BASE_RPC --broadcast --verify
```

Save the factory address from the output. It will look like:
```
MeezanFactory deployed at: 0x...
```

## Step 2: Update the Web App

1. Open `apps/web/lib/contracts.ts`
2. Update the factory address:

```typescript
export const CONTRACTS = {
  factory: '0x<PASTE_FACTORY_ADDRESS_FROM_STEP_1>' as Address,
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  wbtc: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' as Address,
}
```

## Step 3: Deploy the Web App

The web app can be deployed to Vercel, Netlify, or any static hosting.

### Option A: Vercel (Recommended)

```bash
cd apps/web
npm install
npx vercel --prod
```

### Option B: Static Export

```bash
cd apps/web
npm install
npm run build
# Upload the .next folder to your hosting
```

### Option C: Self-Hosted

```bash
cd apps/web
npm install
npm run build
npm start
```

## Step 4: Verify Everything Works

1. Visit your deployed web app
2. Connect a wallet (Coinbase Wallet or MetaMask)
3. Try creating a vault with a small amount of USDC

## Contract Addresses (Base Mainnet)

| Contract | Address |
|----------|---------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| cbBTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` |
| BTC/USD Feed | `0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D` |
| USDC/USD Feed | `0x7e860098F58bBFC8648a4311b374B1D669a2bc6B` |
| Uniswap Router | `0x2626664c2603336E57B271c5C0b26F421741e481` |
| Pool Fee | `500` (0.05%) |

## Troubleshooting

### "Insufficient gas"
Make sure your deployer wallet has at least 0.01 ETH on Base.

### "Verification failed"
Add `--etherscan-api-key YOUR_BASESCAN_KEY` to the forge script command.

### "Transaction reverted"
Check that all addresses are correct for Base mainnet, not testnet.

## Security Notes

- Each user deploys their own vault via the factory
- Vaults are owned by the user's wallet
- Only the owner can deposit, withdraw, or rebalance
- No admin keys or upgradability

## Support

Open an issue on the GitHub repository.
