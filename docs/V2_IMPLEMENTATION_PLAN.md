# Meezan v2 — Implementation Plan

**Status:** Planning Phase (No Production Code)
**Last Updated:** 2026-01-21
**Prerequisites:** V2_DESIGN.md approved

---

## 1. Overview

This document translates the v2 design into concrete implementation steps. The goal is safe, auditable, incremental development of multi-asset portfolio support.

**Key constraint:** v1 contracts remain unchanged. v2 is a separate deployment path.

---

## 2. Contract Architecture Changes

### 2.1 Current v1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MeezanVault (v1)                         │
├─────────────────────────────────────────────────────────────┤
│ State:                                                      │
│   - tokenA, tokenB (immutable)                              │
│   - priceFeedA, priceFeedB (immutable)                      │
│   - targetPctA, targetPctB (immutable)                      │
│   - driftThresholdBps (immutable)                           │
│   - slippageBps (mutable)                                   │
│                                                             │
│ Key Functions:                                              │
│   - depositUSDC() → swap portion to tokenA                  │
│   - rebalance() → single swap between tokenA ↔ tokenB       │
│   - driftBps() → |currentPctA - targetPctA|                 │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Proposed v2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   MeezanVaultV2                             │
├─────────────────────────────────────────────────────────────┤
│ State:                                                      │
│   - assets[] (immutable array, up to 10)                    │
│   - priceFeeds[] (immutable array, parallel to assets)      │
│   - targetWeightsBps[] (immutable array, sums to 10000)     │
│   - stablecoinIndex (immutable, identifies USDC in array)   │
│   - driftThresholdBps (immutable)                           │
│   - slippageBps (mutable)                                   │
│                                                             │
│ Key Functions:                                              │
│   - depositStablecoin() → swap portions to all assets       │
│   - rebalance() → multi-swap via stablecoin intermediary    │
│   - portfolioDriftBps() → max(drift[i]) for all i           │
│   - assetDriftBps(i) → |currentWeight[i] - targetWeight[i]| │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Key Structural Differences

| Aspect | v1 | v2 |
|--------|----|----|
| Asset count | 2 (fixed) | 2-10 (configurable at deploy) |
| Weight storage | 2 immutable uint16s | immutable array |
| Drift calculation | Single value | Max across all assets |
| Swap routing | Direct A↔B | All routes via USDC |
| Swap count per rebalance | 1 | Up to 2×(n-1) |
| Oracle feeds | 2 immutable addresses | n immutable addresses |
| Pool fees | Single fee | Per-asset fee mapping |

---

## 3. Data Structures

### 3.1 Asset Configuration (Constructor)

```solidity
struct AssetConfig {
    address token;           // ERC20 address
    address priceFeed;       // Chainlink aggregator
    uint24 poolFee;          // Uniswap V3 fee tier for USDC pair
    uint16 targetWeightBps;  // Target allocation (100 = 1%)
}
```

**Constructor signature:**
```solidity
constructor(
    AssetConfig[] memory assets,
    address _swapRouter,
    address _stablecoin,        // Must be in assets array
    uint16 _driftThresholdBps
)
```

### 3.2 Runtime State

```solidity
// Immutable asset configuration (set at deploy, never changes)
uint8 public immutable assetCount;
address[10] internal _assets;           // Padded to max
address[10] internal _priceFeeds;
uint24[10] internal _poolFees;
uint16[10] internal _targetWeightsBps;
uint8[10] internal _tokenDecimals;
uint8[10] internal _feedDecimals;

// Index of stablecoin (USDC) in the assets array
uint8 public immutable stablecoinIndex;

// Mutable state (same as v1)
uint64 public lastRebalanceAt;
bool public autoRebalanceEnabled;
address public executor;
uint16 public slippageBps;
```

### 3.3 Why Fixed-Size Arrays?

Dynamic arrays would require:
- More complex storage patterns
- Higher gas costs for iteration
- Harder to audit memory access

Fixed-size arrays (10 max) are:
- Gas-efficient (single SLOAD for each element)
- Predictable memory layout
- Easier to reason about in audits

### 3.4 View Functions for Asset Data

```solidity
function assets() external view returns (address[] memory);
function targetWeights() external view returns (uint16[] memory);
function currentWeights() external view returns (uint16[] memory);
function assetDrift(uint8 index) external view returns (uint16);
function portfolioDrift() external view returns (uint16);
```

---

## 4. Algorithm Specifications

### 4.1 Portfolio Drift Calculation

```solidity
function portfolioDriftBps() public view returns (uint16) {
    uint16 maxDrift = 0;

    for (uint8 i = 0; i < assetCount; i++) {
        uint16 currentWeight = _currentWeightBps(i);
        uint16 targetWeight = _targetWeightsBps[i];

        uint16 drift;
        if (currentWeight >= targetWeight) {
            drift = currentWeight - targetWeight;
        } else {
            drift = targetWeight - currentWeight;
        }

        if (drift > maxDrift) {
            maxDrift = drift;
        }
    }

    return maxDrift;
}
```

**Complexity:** O(n) where n = asset count
**Gas estimate:** ~3,000 gas per asset (oracle read + math)

### 4.2 Rebalance Algorithm

```solidity
function rebalance() external onlyOwnerOrExecutor nonReentrant whenNotPaused {
    // 1. Verify drift threshold
    uint16 drift = portfolioDriftBps();
    if (drift < driftThresholdBps) revert DriftBelowThreshold();

    // 2. Verify cooldown (executor only)
    if (msg.sender != owner) {
        if (lastRebalanceAt != 0 && block.timestamp - lastRebalanceAt < COOLDOWN_SECONDS) {
            revert CooldownNotElapsed();
        }
    }

    // 3. Calculate USD values and target amounts
    uint256 totalUsd = _totalUsdValue();
    if (totalUsd == 0) revert EmptyVault();

    // 4. Identify overweight (sell) and underweight (buy) assets
    int256[] memory deltas = new int256[](assetCount);
    for (uint8 i = 0; i < assetCount; i++) {
        uint256 currentUsd = _assetUsdValue(i);
        uint256 targetUsd = (totalUsd * _targetWeightsBps[i]) / BPS_DENOMINATOR;
        deltas[i] = int256(currentUsd) - int256(targetUsd);
    }

    // 5. Execute swaps: sell overweight → USDC → buy underweight
    _executeRebalanceSwaps(deltas, totalUsd);

    // 6. Update timestamp
    lastRebalanceAt = uint64(block.timestamp);

    // 7. Emit event
    emit Rebalanced(msg.sender, drift, uint64(block.timestamp));
}
```

### 4.3 Multi-Swap Execution

```solidity
function _executeRebalanceSwaps(int256[] memory deltas, uint256 totalUsd) internal {
    // Phase 1: Sell all overweight assets to USDC
    for (uint8 i = 0; i < assetCount; i++) {
        if (i == stablecoinIndex) continue;  // Skip USDC itself
        if (deltas[i] <= int256(MIN_SWAP_USD)) continue;  // Not overweight or below min

        uint256 usdToSell = uint256(deltas[i]);
        _swapAssetToStablecoin(i, usdToSell);
    }

    // Phase 2: Buy all underweight assets from USDC
    for (uint8 i = 0; i < assetCount; i++) {
        if (i == stablecoinIndex) continue;  // Skip USDC itself
        if (deltas[i] >= -int256(MIN_SWAP_USD)) continue;  // Not underweight or below min

        uint256 usdToBuy = uint256(-deltas[i]);
        _swapStablecoinToAsset(i, usdToBuy);
    }
}
```

### 4.4 Swap Execution (Single Asset)

```solidity
function _swapAssetToStablecoin(uint8 assetIndex, uint256 usdValue) internal {
    address token = _assets[assetIndex];
    address feed = _priceFeeds[assetIndex];
    uint24 fee = _poolFees[assetIndex];

    // Calculate amount to sell (in asset tokens)
    uint256 price = _getPrice(feed, _getStalenessForAsset(assetIndex));
    uint256 amountToSell = _usdToTokenAmount(usdValue, assetIndex, price);

    // Calculate minimum USDC to receive
    uint256 minUsdcOut = _calculateMinOutput(usdValue, stablecoinIndex);

    // Execute swap
    IERC20(token).forceApprove(address(swapRouter), amountToSell);

    ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
        tokenIn: token,
        tokenOut: _assets[stablecoinIndex],
        fee: fee,
        recipient: address(this),
        amountIn: amountToSell,
        amountOutMinimum: minUsdcOut,
        sqrtPriceLimitX96: 0
    });

    uint256 usdcReceived = swapRouter.exactInputSingle(params);

    IERC20(token).forceApprove(address(swapRouter), 0);

    emit SwapExecuted(token, _assets[stablecoinIndex], amountToSell, usdcReceived);
}
```

---

## 5. New Invariants

### 5.1 Allocation Integrity

```
INV-V2-01: Sum of target weights always equals 10000 bps
∀ vault: Σ targetWeightsBps[i] = 10000
```

Enforced at: Constructor (revert if sum ≠ 10000)

### 5.2 Asset Count Bounds

```
INV-V2-02: Asset count is between 2 and 10
∀ vault: 2 ≤ assetCount ≤ 10
```

Enforced at: Constructor (revert if < 2 or > 10)

### 5.3 Stablecoin Presence

```
INV-V2-03: Stablecoin (USDC) is always in the asset array
∀ vault: assets[stablecoinIndex] = USDC_ADDRESS
```

Enforced at: Constructor (verify stablecoin exists in array)

### 5.4 Minimum Weight

```
INV-V2-04: Each asset has at least 1% weight
∀ i: targetWeightsBps[i] >= 100
```

Enforced at: Constructor (revert if any weight < 100)

### 5.5 No Approval Residuals

```
INV-V2-05: After any swap, all router approvals are zero
∀ asset, post-swap: allowance(vault, router) = 0
```

Enforced at: Every swap function (forceApprove to 0 after swap)

### 5.6 Oracle Coordination

```
INV-V2-06: All oracles must be fresh for any operation
∀ operation that reads prices: all oracles pass staleness check
```

Enforced at: _getPrice() with per-asset staleness threshold

### 5.7 Withdrawal Safety

```
INV-V2-07: Owner can always withdraw all assets
∀ state: withdrawAll() succeeds for owner (ignores pause)
```

Enforced at: withdrawAll() has no whenNotPaused modifier

### 5.8 Drift Trigger Correctness

```
INV-V2-08: Rebalance only executes if max drift >= threshold
∀ rebalance: max(|current[i] - target[i]|) >= driftThresholdBps
```

Enforced at: rebalance() checks portfolioDriftBps() >= driftThresholdBps

### 5.9 Slippage Bounds

```
INV-V2-09: Aggregate slippage never exceeds user setting
∀ swap in rebalance: actual slippage <= slippageBps
```

Enforced at: Each swap has slippage check, reverts if exceeded

### 5.10 No Asset Leakage

```
INV-V2-10: Assets only leave vault via owner withdrawal or rebalance swap
∀ transfer out: caller = owner OR context = rebalance swap
```

Enforced at: onlyOwner for withdrawals, swap only in rebalance()

---

## 6. Backwards Compatibility

### 6.1 v1 Vaults Unaffected

- v1 contracts (MeezanVault) remain deployed and functional
- v2 is a new contract (MeezanVaultV2)
- Factory will need update to deploy v2 vaults

### 6.2 Migration Path

**Option A: No migration (recommended for v2.0)**
- v1 users keep v1 vaults
- New users get v2 vaults
- No forced migration

**Option B: Guided withdrawal/deposit (v2.1+)**
- UI guides v1 users to withdraw
- UI guides v1 users to create v2 vault
- UI guides v1 users to deposit
- No on-chain migration contract

**Why no on-chain migration?**
- Migration contracts add attack surface
- Users should consciously move funds
- Different asset sets may not map cleanly

### 6.3 Factory Updates

```solidity
// MeezanFactoryV2.sol
function createVault(AssetConfig[] calldata assets, uint16 driftThresholdBps) external returns (address) {
    MeezanVaultV2 vault = new MeezanVaultV2(
        assets,
        SWAP_ROUTER,
        USDC,
        driftThresholdBps
    );
    vault.transferOwnership(msg.sender);

    // Track vault
    userVaults[msg.sender].push(address(vault));
    emit VaultCreated(msg.sender, address(vault));

    return address(vault);
}
```

---

## 7. Implementation Phases

### Phase 1: Core Contract (Week 1-2)

**Goal:** Compile and basic test

1. Create `MeezanVaultV2.sol` with:
   - Constructor with AssetConfig array validation
   - Storage layout (fixed arrays)
   - Basic view functions (assets, weights, balances)
   - Deposit functions (single asset, stablecoin with allocation)
   - Withdraw functions (single asset, all)

2. Create unit tests:
   - Constructor validation (weight sum, asset count, stablecoin)
   - View function accuracy
   - Deposit/withdraw correctness

**Deliverables:**
- `src/MeezanVaultV2.sol` (compiles)
- `test/MeezanVaultV2.t.sol` (basic tests pass)

### Phase 2: Drift and Rebalance Logic (Week 2-3)

**Goal:** Multi-asset drift calculation and multi-swap rebalance

1. Implement drift calculation:
   - `_currentWeightBps(i)` - current weight of asset i
   - `_assetDriftBps(i)` - drift of single asset
   - `portfolioDriftBps()` - max drift across all

2. Implement rebalance:
   - Delta calculation (overweight/underweight)
   - Phase 1: Sell overweight → USDC
   - Phase 2: Buy underweight ← USDC
   - Slippage enforcement per swap
   - Event emission

3. Unit tests:
   - Drift calculation correctness
   - Rebalance trigger conditions
   - Multi-swap execution order
   - Slippage enforcement

**Deliverables:**
- Complete rebalance implementation
- 50+ unit tests for rebalance logic

### Phase 3: Edge Cases and Hardening (Week 3-4)

**Goal:** Handle failure modes safely

1. Implement edge cases:
   - Partial rebalance (skip swaps below MIN_SWAP_USD)
   - Gas budget enforcement (defer if exceeds limit)
   - Oracle staleness (different thresholds per asset type)
   - Insufficient liquidity (slippage protection)

2. Implement gas optimization:
   - Batch oracle reads
   - Minimize storage writes
   - Efficient loop patterns

3. Unit tests:
   - All failure modes
   - Gas consumption benchmarks
   - Fuzz testing on allocations

**Deliverables:**
- Hardened implementation
- 100+ unit tests
- Gas benchmark report

### Phase 4: Invariant Tests (Week 4)

**Goal:** Formal property verification

1. Create invariant test suite:
   - All 10 invariants from section 5
   - Handler contract for multi-operation sequences
   - 10,000+ runs per invariant

2. Create integration tests:
   - Full lifecycle (deploy → deposit → drift → rebalance → withdraw)
   - Multi-user scenarios (via factory)
   - Stress tests (10 assets, many operations)

**Deliverables:**
- `test/MeezanVaultV2.invariant.t.sol`
- Integration test suite
- All tests pass

### Phase 5: Factory and Frontend (Week 5)

**Goal:** Deployment infrastructure

1. Create `MeezanFactoryV2.sol`:
   - Deploy v2 vaults with preset configurations
   - Track user vaults
   - Curated asset whitelist

2. Update frontend:
   - Asset selection UI
   - Weight allocation sliders
   - Multi-asset portfolio display
   - Rebalance preview (shows all swaps)

**Deliverables:**
- Factory contract with tests
- Frontend updates (TypeScript, components)

### Phase 6: Audit Preparation (Week 6)

**Goal:** Ready for external review

1. Documentation:
   - NatSpec comments on all public functions
   - Architecture diagram
   - Threat model update

2. Static analysis:
   - Slither clean (or documented exceptions)
   - Mythril clean
   - Manual review checklist

3. Audit package:
   - All contracts
   - All tests
   - Deployment scripts
   - Documentation

**Deliverables:**
- Complete AUDIT_PACKAGE_V2/
- Audit engagement started

---

## 8. Risk Assessment

### 8.1 Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Swap ordering bug | Medium | High | Extensive testing, invariants |
| Oracle coordination failure | Low | High | All-or-nothing oracle checks |
| Gas exhaustion in rebalance | Medium | Medium | Gas budget, partial execution |
| Approval residual | Low | Critical | forceApprove(0) after every swap |
| Slippage accumulation | Medium | Medium | Per-swap limits, aggregate tracking |

### 8.2 Complexity Budget

| Component | v1 Complexity | v2 Complexity | Increase |
|-----------|---------------|---------------|----------|
| Storage variables | 15 | 25 | +67% |
| Functions | 20 | 30 | +50% |
| Lines of code | ~500 | ~900 | +80% |
| Test cases | 158 | 300+ | +90% |
| Attack surface | 1 swap path | n swap paths | +n× |

---

## 9. Decision Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Fixed arrays (not dynamic) | Gas efficiency, audit simplicity | 2026-01-21 |
| USDC as sole intermediary | Liquidity depth, avoid n² pairs | 2026-01-21 |
| No on-chain migration | Minimize attack surface | 2026-01-21 |
| Separate v2 contract | Clean audit scope, no upgrade risk | 2026-01-21 |
| Constructor-immutable weights | Prevent owner manipulation | 2026-01-21 |

---

## 10. Open Questions

1. **Should v2 support weight modification?**
   - v1: Weights are immutable (set at deploy)
   - v2 option A: Same (redeploy for new weights)
   - v2 option B: Owner can modify with cooldown
   - Recommendation: Keep immutable for v2.0

2. **How to handle failed individual swaps?**
   - Option A: Revert entire rebalance
   - Option B: Skip failed swap, continue others
   - Recommendation: Option B with detailed events

3. **Should there be a maximum position size?**
   - Risk: Large positions can move markets
   - Option: Cap at $1M per asset for launch
   - Recommendation: Defer to UI-level warning

---

## 11. Next Steps

1. **Immediate:** Review this plan with stakeholders
2. **Week 1:** Begin Phase 1 implementation
3. **Week 2:** Weekly review meeting
4. **Week 6:** Audit firm engagement
5. **Week 10+:** Testnet deployment
6. **Week 14+:** Mainnet guarded launch

---

*This document is a planning artifact. Implementation should not begin until this plan is approved.*
