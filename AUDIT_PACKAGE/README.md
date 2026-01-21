# Meezan Audit Package

**Version:** 1.0
**Date:** 2026-01-20
**Network:** Base Mainnet (Chain ID 8453)

---

## Overview

Meezan is a non-custodial vault system for maintaining a target BTC/USDC allocation. Users deploy personal vaults via a factory contract and can deposit, withdraw, and rebalance assets.

## Package Contents

```
AUDIT_PACKAGE/
├── README.md                    # This file
├── contracts/                   # Contract source code
│   ├── MeezanVault.sol
│   ├── MeezanFactory.sol
│   ├── AllocationPresets.sol
│   └── interfaces/
│       ├── AggregatorV3Interface.sol
│       └── ISwapRouter.sol
├── scripts/                     # Deployment scripts
│   └── Deploy.s.sol
├── docs/
│   ├── THREAT_MODEL.md          # Threat analysis and mitigations
│   ├── SECURITY_CHECKLIST.md    # Pre/post deployment checklist
│   └── STATIC_ANALYSIS.md       # Slither and testing guide
└── tests/
    ├── MeezanVault.t.sol        # Unit and fuzz tests
    ├── MeezanFactory.t.sol      # Factory tests
    └── MeezanVault.invariant.t.sol  # Invariant tests
```

## Scope

### In-Scope Contracts

| Contract | LOC | Description |
|----------|-----|-------------|
| MeezanVault.sol | ~500 | Core vault logic |
| MeezanFactory.sol | ~150 | Factory for deploying vaults |
| AllocationPresets.sol | ~30 | Allocation enum definitions |

### Out-of-Scope

- OpenZeppelin dependencies (audited separately)
- Chainlink interfaces (standard)
- Uniswap interfaces (standard)
- Test contracts and mocks

## External Dependencies

| Dependency | Address (Base) | Purpose |
|------------|----------------|---------|
| OpenZeppelin | NPM package | SafeERC20, ReentrancyGuard, Pausable, Math |
| Chainlink BTC/USD | `0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D` | BTC price feed |
| Chainlink USDC/USD | `0x7e860098F58bBFC8648a4311b374B1D669a2bc6B` | USDC price feed |
| Uniswap V3 Router | `0x2626664c2603336E57B271c5C0b26F421741e481` | Swap execution |
| cbBTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` | Wrapped BTC token |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | USD stablecoin |

## Key Security Properties

1. **Access Control** - Only vault owner can deposit/withdraw/rebalance
2. **Approval Safety** - Token approvals zeroed after each swap
3. **Oracle Integrity** - Staleness and validity checks on all price reads
4. **Slippage Protection** - Configurable cap (0.1% - 5%)
5. **Rebalance Gating** - Minimum drift threshold required
6. **Cooldown Enforcement** - 12-hour executor cooldown
7. **Emergency Pause** - Owner can pause deposits/rebalances (not withdrawals)
8. **Two-Step Ownership** - Prevents accidental ownership transfers

## Known Issues

1. **MEV Exposure** - Sandwich attacks possible within slippage tolerance
2. **Liquidity Risk** - Large positions may have difficulty rebalancing
3. **Issuer Risk** - cbBTC depends on Coinbase, USDC depends on Circle

## Test Results

```
Total Unit Tests: 158 passed
Invariant Tests: 10 properties verified
Fork Tests: Manual (requires RPC)
```

## Building and Testing

```bash
# Navigate to contracts directory
cd packages/contracts

# Install dependencies
forge install

# Run tests
forge test -vvv

# Run invariant tests
forge test --match-contract Invariant -vvv

# Run with coverage
forge coverage
```

## Contact

For questions about this audit package, contact the repository maintainers.
