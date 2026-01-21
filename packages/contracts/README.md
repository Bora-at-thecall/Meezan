# Meezan Contracts

Non-custodial allocation maintenance protocol for Bitcoin/USDC on Base.

## Overview

Meezan allows users to deploy personal vaults that automatically maintain a target BTC/USDC allocation. When the allocation drifts beyond a threshold, anyone can trigger a rebalance to restore the target ratio.

## Architecture

### MeezanVault
Personal vault contract that holds user funds and executes rebalancing swaps.

**Key Features:**
- Two-token vault (BTC/USDC)
- Chainlink oracle-based valuation
- Uniswap V3 swaps for rebalancing
- Owner-only deposits/withdrawals
- Pausable for emergency scenarios

### MeezanFactory
Factory contract for deploying personal vaults.

**Two Creation Modes:**

1. **Simple Mode (v1.0)** - Preset allocations with default 5% drift threshold
   ```solidity
   function createVault(AllocationPreset allocation) external returns (address vault);
   ```

2. **Advanced Mode (v1.1)** - Custom allocations and drift thresholds
   ```solidity
   function createAdvancedVault(
       uint16 pctA,           // BTC % in basis points (e.g., 6000 = 60%)
       uint16 pctB,           // USDC % in basis points (e.g., 4000 = 40%)
       uint16 driftThresholdBps  // Drift threshold (200-2000 bps, i.e., 2-20%)
   ) external returns (address vault);
   ```

### AllocationPresets (Simple Mode)
- `Split10_90` - 10% BTC / 90% USDC
- `Split25_75` - 25% BTC / 75% USDC
- `Split50_50` - 50% BTC / 50% USDC
- `Split75_25` - 75% BTC / 25% USDC
- `Split90_10` - 90% BTC / 10% USDC

### Advanced Mode Parameters
- **Custom Allocation**: Any ratio from 1/99 to 99/1 (must sum to 100%)
- **Custom Drift Threshold**: 2% to 20% (200-2000 bps)
  - Lower thresholds = more frequent rebalancing, tighter allocation tracking
  - Higher thresholds = less frequent rebalancing, lower gas costs

## Base Mainnet Deployment

| Contract | Address |
|----------|---------|
| MeezanFactory | `0x9e3B4B3bF1A018f488D0b3a302F5b37CDB51c8Eb` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| cbBTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` |
| BTC/USD Feed | `0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D` |
| USDC/USD Feed | `0x7e860098F58bBFC8648a4311b374B1D669a2bc6B` |
| SwapRouter02 | `0x2626664c2603336E57B271c5C0b26F421741e481` |

## Development

### Build

```shell
forge build
```

### Test

```shell
forge test
```

### Test with Fork

```shell
export BASE_RPC=https://mainnet.base.org
forge test --match-path test/ForkProof.t.sol
```

### Format

```shell
forge fmt
```

## Security Considerations

- Vaults are non-custodial - only the owner can deposit/withdraw
- Oracle staleness checks prevent trades on stale price data
- Slippage protection on all swaps
- Pausable for emergency scenarios
- Two-step ownership transfer

## License

MIT
