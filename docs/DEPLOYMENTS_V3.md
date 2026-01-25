# Meezan V3 Deployments

**Last Updated:** 2026-01-25
**Network:** Base Sepolia (testnet)

---

## ⚠️ TEST-ONLY Deployment

This deployment uses **mock contracts** because:
- Chainlink price feeds are **NOT available** on Base Sepolia
- cbBTC is **NOT available** on Base Sepolia
- USDC availability is verified at deploy time (falls back to mock if not found)

---

### Testing Strategy

| What | Where | Status |
|------|-------|--------|
| **Deployment + state logic** | Base Sepolia | ✅ Validated |
| **Swap execution** | Base mainnet fork | ✅ Validated via `ForkProofV2.t.sol` |

---

### Sepolia Deployment Validates

✅ Factory deployment and vault creation
✅ Deposit/withdraw flows (direct ERC20 transfers)
✅ View functions (`getPortfolio()`, `getDrift()`, `getConversionAssetOrder()`)
✅ Access control (owner, executor, onlyOwner modifiers)
✅ Pause/unpause functionality
✅ Conversion state machine (`requestConversion()` → `cancelConversion()`)
✅ Auto-cancel behavior on deposit/rebalance
✅ Event emission

---

### Swap Execution Limitations

**Swaps CANNOT be executed on Base Sepolia** because:
1. Mock tokens (mWBTC) have no Uniswap liquidity pools
2. Even real WETH/USDC pairs may lack testnet liquidity
3. Mock price feeds don't reflect real market conditions

**Swap functionality IS validated via mainnet fork tests:**
- `ForkProofV2.t.sol` - V2 rebalance swaps on real Base mainnet state
- `MeezanVaultV3.t.sol` - V3 conversion logic with mock router

```bash
# Run fork tests to validate swap execution
export BASE_RPC=https://mainnet.base.org
forge test --match-path test/ForkProofV2.t.sol -vvv --fork-url $BASE_RPC
```

---

### When to Use Each Environment

| Scenario | Environment |
|----------|-------------|
| Test contract deployment | Base Sepolia |
| Test deposit/withdraw UX | Base Sepolia |
| Test frontend integration | Base Sepolia |
| Test swap execution | Base mainnet fork |
| Test slippage handling | Base mainnet fork |
| Pre-mainnet validation | Base mainnet fork |

---

## Base Sepolia (Chain ID: 84532)

### Core Contracts

| Contract | Address | Verified |
|----------|---------|----------|
| MeezanFactoryV3 | `0x0E3C02d62C4901A5cEb7D71409348eB75c345B5A` | Pending |
| Example Vault | `0x04a5cf027DF2813d027848369822d97Fee86D2dE` | Pending |

### Mock Contracts (TEST-ONLY)

| Contract | Address | Purpose |
|----------|---------|---------|
| MockWBTC | `0x11C66cC0d5B9eFB983541Aa4da35bAf2FDACcDa2` | Test token (8 decimals) |
| MockBtcFeed | `0x9BE1d65c8C1D5fb054c0506CBe3d4Fc578793EDb` | Price: $100,000 |
| MockEthFeed | `0xaFC433d9c19eF3887d89e7c4B6179A7e101ba448` | Price: $3,500 |
| MockUsdcFeed | `0x034E0BBdc1164440241Ef04AeDac9C716d51347c` | Price: $1.00 |

### Real Addresses Used

| Contract | Address | Source |
|----------|---------|--------|
| SwapRouter02 | `0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4` | [Uniswap Docs](https://docs.uniswap.org/contracts/v3/reference/deployments/base-deployments) |
| WETH | `0x4200000000000000000000000000000000000006` | Canonical |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | [Circle Docs](https://www.circle.com/en/multi-chain-usdc/base) |

### Configuration

| Parameter | Value |
|-----------|-------|
| Conversion Executor | `0x3D457d018bBfC38aDdcEFcC780f7408894C732F0` |
| Vault Owner | `0x3D457d018bBfC38aDdcEFcC780f7408894C732F0` |
| Drift Threshold | 500 bps (5%) |

### Vault Asset Configuration

| Asset | Token | Price Feed | Weight | Pool Fee |
|-------|-------|------------|--------|----------|
| mWBTC | `0x11C66cC0d5B9eFB983541Aa4da35bAf2FDACcDa2` | `0x9BE1d65c8C1D5fb054c0506CBe3d4Fc578793EDb` | 40% | 0.05% |
| WETH | `0x4200000000000000000000000000000000000006` | `0xaFC433d9c19eF3887d89e7c4B6179A7e101ba448` | 40% | 0.3% |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `0x034E0BBdc1164440241Ef04AeDac9C716d51347c` | 20% | - |

---

## Transaction Hashes

| # | Contract | Transaction Hash |
|---|----------|------------------|
| 1 | MockWBTC | [`0x88913ff4ac2dd39b147d39ff56eec9fdd4038a6f315f481984b75a0075798dee`](https://sepolia.basescan.org/tx/0x88913ff4ac2dd39b147d39ff56eec9fdd4038a6f315f481984b75a0075798dee) |
| 2 | MockBtcFeed | [`0xaa527c8e882d401a5ae3415d612f256324e7e6034b154c6b3c0218462f2cf03b`](https://sepolia.basescan.org/tx/0xaa527c8e882d401a5ae3415d612f256324e7e6034b154c6b3c0218462f2cf03b) |
| 3 | MockEthFeed | [`0x79d8a89a8cee221a67299b775587ca96ea097ff09db2f9a95711695f28cf4ba1`](https://sepolia.basescan.org/tx/0x79d8a89a8cee221a67299b775587ca96ea097ff09db2f9a95711695f28cf4ba1) |
| 4 | MockUsdcFeed | [`0x4f340230a91290df1dbf49241634d31027c708055a8e5b49ad6a709deeab0589`](https://sepolia.basescan.org/tx/0x4f340230a91290df1dbf49241634d31027c708055a8e5b49ad6a709deeab0589) |
| 5 | MeezanFactoryV3 | [`0x9a3b5e2378d68a3b432c82572079c52e0f2ac4b84782f9dbad50b7698361b48f`](https://sepolia.basescan.org/tx/0x9a3b5e2378d68a3b432c82572079c52e0f2ac4b84782f9dbad50b7698361b48f) |
| 6 | createVault() | [`0x23fbb6a8c39017844f2188a09467e69322f9397a95b7345c9ad744d3e709ead4`](https://sepolia.basescan.org/tx/0x23fbb6a8c39017844f2188a09467e69322f9397a95b7345c9ad744d3e709ead4) |
| 7 | mint() mWBTC | [`0x7b028458c4dcf283522ec6a72a3c4f18aa7265ddc303bc3bfe8d9a14fa704a0d`](https://sepolia.basescan.org/tx/0x7b028458c4dcf283522ec6a72a3c4f18aa7265ddc303bc3bfe8d9a14fa704a0d) |

---

## Deployment Commands

### Prerequisites

```bash
# Navigate to contracts directory
cd packages/contracts

# Set environment variables
export DEPLOYER_PRIVATE_KEY=0x...your_private_key...
export V3_EXECUTOR_ADDRESS=0x...executor_address...

# For testing, executor can be same as deployer
export V3_EXECUTOR_ADDRESS=$(cast wallet address $DEPLOYER_PRIVATE_KEY)
```

### Step 1: Verify Compilation

```bash
forge build
```

### Step 2: Dry Run (Simulation)

```bash
forge script script/DeployFactoryV3.s.sol --rpc-url https://sepolia.base.org -vvvv
```

### Step 3: Deploy (Broadcast)

```bash
forge script script/DeployFactoryV3.s.sol --rpc-url https://sepolia.base.org --broadcast -vvvv
```

### Step 4: Deploy with Verification (Optional)

```bash
export BASESCAN_API_KEY=your_api_key

forge script script/DeployFactoryV3.s.sol --rpc-url https://sepolia.base.org --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY -vvvv
```

---

## Post-Deployment Testing

### Get Testnet Tokens

1. **ETH for gas:** Use any Base Sepolia faucet
2. **USDC:** [Circle Faucet](https://faucet.circle.com/) (20 USDC per request)
3. **mWBTC:** Already minted to deployer (10 mWBTC)

### Test Checklist

```bash
# Set addresses
export FACTORY=0x0E3C02d62C4901A5cEb7D71409348eB75c345B5A
export VAULT=0x04a5cf027DF2813d027848369822d97Fee86D2dE
export MOCK_WBTC=0x11C66cC0d5B9eFB983541Aa4da35bAf2FDACcDa2

# Check factory state
cast call $FACTORY "vaultCount()" --rpc-url https://sepolia.base.org

# Check vault owner
cast call $VAULT "owner()" --rpc-url https://sepolia.base.org

# Check conversion executor
cast call $VAULT "conversionExecutor()" --rpc-url https://sepolia.base.org

# Check asset count
cast call $VAULT "assetCount()" --rpc-url https://sepolia.base.org
```

### Deposit Test

```bash
# Approve mWBTC to vault
cast send $MOCK_WBTC "approve(address,uint256)" $VAULT 100000000 \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url https://sepolia.base.org

# Deposit mWBTC (1 BTC = 1e8)
cast send $VAULT "deposit(uint8,uint256)" 0 100000000 \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url https://sepolia.base.org
```

### Withdraw Test

```bash
# Withdraw all assets
cast send $VAULT "withdrawAll()" \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url https://sepolia.base.org
```

---

## Verification Links

- Factory: https://sepolia.basescan.org/address/0x0E3C02d62C4901A5cEb7D71409348eB75c345B5A#code
- Vault: https://sepolia.basescan.org/address/0x04a5cf027DF2813d027848369822d97Fee86D2dE#code

---

## Mainnet Deployment

**Status:** Not deployed

Mainnet deployment will occur after:
1. V3 audit completion
2. Successful testnet integration testing
3. Frontend integration complete

Mainnet will use:
- Real Chainlink price feeds
- Real cbBTC, WETH, USDC
- Same SwapRouter02 address (`0x2626664c2603336E57B271c5C0b26F421741e481`)

---

## Deployment History

| Date | Network | Version | Contracts | Transaction |
|------|---------|---------|-----------|-------------|
| 2026-01-25 | Base Sepolia | V3 | Factory + Vault + 4 Mocks | [0x9a3b5e23...](https://sepolia.basescan.org/tx/0x9a3b5e2378d68a3b432c82572079c52e0f2ac4b84782f9dbad50b7698361b48f) |

---

**Deployment completed successfully.**
