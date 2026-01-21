# Static Analysis Guide

## Slither Installation

Slither is the recommended static analysis tool for Solidity.

### Install via pip

```bash
pip install slither-analyzer
```

### Install via pipx (recommended for isolation)

```bash
pipx install slither-analyzer
```

### Verify installation

```bash
slither --version
```

## Running Slither on Meezan

### Basic Analysis

```bash
cd packages/contracts
slither src/MeezanVault.sol --config-file slither.config.json
```

### With Foundry

```bash
cd packages/contracts
slither . --foundry-compile-all
```

### Generate Report

```bash
slither src/MeezanVault.sol --json slither-report.json
```

## Slither Configuration

Create `packages/contracts/slither.config.json`:

```json
{
  "detectors_to_exclude": [
    "naming-convention",
    "solc-version"
  ],
  "exclude_informational": true,
  "exclude_low": false,
  "filter_paths": [
    "lib/",
    "test/mocks/"
  ]
}
```

## Expected Findings

### Acceptable Findings

1. **Solidity version** - Using 0.8.20+ is intentional for latest features
2. **Naming conventions** - Internal naming choices are intentional

### Must Address

1. **High severity** - All high severity findings must be resolved
2. **Medium severity** - Review and document reasoning if not fixed
3. **Reentrancy** - Should show as protected via ReentrancyGuard
4. **Unchecked external calls** - Should all be wrapped in SafeERC20

## Running Invariant Tests

```bash
cd packages/contracts
forge test --match-contract Invariant -vvv
```

### Test Coverage for Invariants

The invariant tests verify:

1. **Access Control** - Only owner can deposit/withdraw
2. **Approval Safety** - No residual approvals after operations
3. **Oracle Staleness** - Operations revert on stale prices
4. **Slippage Enforcement** - Swaps never exceed configured slippage
5. **Rebalance Gating** - Rebalance only when drift >= threshold
6. **Cooldown Enforcement** - Executor respects cooldown period
7. **Allocation Integrity** - Target allocations sum to 100%
8. **Holdings Consistency** - Holdings match actual balances
9. **Ownership Integrity** - Owner changes only via two-step process
10. **Pause Safety** - Withdrawals work even when paused

## Other Tools

### Mythril

```bash
myth analyze src/MeezanVault.sol --solc-json mythril.config.json
```

### Echidna (Fuzzing)

Echidna can be used for property-based testing. See Foundry invariant tests as the primary fuzzing approach.

### Certora (Formal Verification)

For more rigorous verification, Certora specs can be written. This is recommended for a full audit.

## Continuous Integration

Add to CI pipeline:

```yaml
- name: Run Slither
  uses: crytic/slither-action@v0.4.0
  with:
    target: 'packages/contracts'
    slither-args: '--filter-paths "lib/|test/mocks/"'
```

## Checklist Before Audit

- [ ] Run Slither with no high/medium findings
- [ ] Run all invariant tests
- [ ] Run fuzz tests with 1000+ runs
- [ ] Document all known issues
- [ ] Review all external dependencies
- [ ] Check gas optimization (optional)
