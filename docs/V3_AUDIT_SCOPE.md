# Meezan V3 — Audit Scope (Phase 2: USDC Conversion)

**Status:** READY FOR AUDIT
**Last Updated:** 2026-01-25
**Branch:** `v2-engine-phase1`
**Prerequisite:** V2 audit scope remains valid; V3 is additive

---

## 1. Executive Summary

Meezan V3 extends V2 with **"Withdraw as USDC"** functionality. Users can now convert all vault assets to USDC before withdrawal, either instantly (atomic) or via a background executor.

**Key additions from V2:**
- **Path B:** Instant atomic conversion (`convertAndWithdraw()`)
- **Path C:** Background conversion (`requestConversion()` + `executeConversion()`)
- **Conversion executor:** Protocol-controlled, immutable at vault construction
- **Core invariant preserved:** `withdrawAll()` always succeeds regardless of conversion state

**What is NOT changed:**
- `withdrawAll()` behavior (still the unconditional escape hatch)
- Rebalancing logic
- Access control patterns
- Oracle validation

---

## 2. Contracts In Scope

### 2.1 New Contracts (Full Audit Required)

| Contract | LOC | Complexity | Description |
|----------|-----|------------|-------------|
| `MeezanVaultV3.sol` | ~1000 | High | V2 + USDC conversion paths |
| `MeezanFactoryV3.sol` | ~170 | Low | Factory for V3 vaults |

**Total new code:** ~1,170 lines

### 2.2 Code Delta from V2

| Component | V2 | V3 | Delta |
|-----------|----|----|-------|
| State variables | 8 | 11 | +3 (conversionRequested, backgroundConversionDisabled, conversionExecutor) |
| External functions | 18 | 25 | +7 (conversion functions) |
| Internal functions | 12 | 14 | +2 (_convertAllToUsdc, _swapToUsdc) |
| Errors | 17 | 23 | +6 (conversion errors) |
| Events | 10 | 16 | +6 (conversion events) |

### 2.3 Unchanged Contracts (Not In V3 Scope)

| Contract | Notes |
|----------|-------|
| `MeezanVaultV2.sol` | See V2_AUDIT_SCOPE.md |
| `MeezanFactoryV2.sol` | See V2_AUDIT_SCOPE.md |
| V1 contracts | Previously reviewed |

### 2.4 Dependencies (Out of Scope)

| Dependency | Version | Notes |
|------------|---------|-------|
| OpenZeppelin | 5.0.x | Industry standard, audited |
| Chainlink | Latest | Aggregator interface only |
| Uniswap V3 | Deployed | ISwapRouter interface only |

---

## 3. New Withdrawal Paths

### 3.1 Path Overview

| Path | Function | Caller | Behavior |
|------|----------|--------|----------|
| **Original** | `withdrawAll()` | Owner | Direct transfer, no swaps, ALWAYS succeeds |
| **Path B** | `convertAndWithdraw()` | Owner | Atomic: swap all → USDC → transfer |
| **Path C** | `requestConversion()` → `executeConversion()` | Owner / Executor | Two-step: request, executor swaps, owner withdraws |

### 3.2 Path B: Instant Atomic Conversion

```solidity
function convertAndWithdraw(uint256[] calldata minAmountsOut) external onlyOwner nonReentrant
```

**Behavior:**
1. Validates `minAmountsOut` length
2. Loops through non-stablecoin assets
3. Skips dust (< MIN_SWAP_USD)
4. Executes `exactInputSingle` swaps to USDC
5. Transfers all USDC to owner
6. Atomic: full success or full revert

**Audit Focus:**
- Slippage protection via `minAmountsOut`
- Dust threshold consistency with V2
- No partial state on revert

### 3.3 Path C: Background Conversion

```solidity
function requestConversion() external onlyOwner
function executeConversion(uint256[] calldata minAmountsOut) external onlyConversionExecutor nonReentrant
function cancelConversion() external onlyOwner
```

**State machine:**
```
NORMAL → [requestConversion] → PENDING → [executeConversion] → NORMAL
                                    ↓
                            [cancelConversion]
                                    ↓
                                 NORMAL
```

**Behavior:**
- `requestConversion()`: Sets `conversionRequested = true`
- `executeConversion()`: Swaps all to USDC, clears flag
- `cancelConversion()`: Clears flag, no swaps

**Audit Focus:**
- Only one pending conversion at a time (INV-C3)
- Executor cannot grief via zero `minAmountsOut` (ZeroMinAmountOut error)
- State transitions are atomic

---

## 4. Core Invariant: withdrawAll() Always Succeeds

### 4.1 The Invariant

> **INV-W1:** `withdrawAll()` MUST succeed under all conditions, regardless of:
> - Conversion state (pending or not)
> - Oracle state (stale or not)
> - Contract state (paused or not)
> - Swap availability (pool liquidity or not)

### 4.2 Implementation

```solidity
function withdrawAll() external onlyOwner returns (uint256[] memory amounts) {
    // Auto-cancel pending conversion (no external calls)
    if (conversionRequested) {
        conversionRequested = false;
        emit ConversionCancelled(msg.sender);
    }

    amounts = new uint256[](assetCount);

    for (uint8 i = 0; i < assetCount; i++) {
        amounts[i] = IERC20(_assets[i]).balanceOf(address(this));
        if (amounts[i] > 0) {
            IERC20(_assets[i]).safeTransfer(msg.sender, amounts[i]);
            emit Withdraw(msg.sender, _assets[i], amounts[i]);
        }
    }
}
```

### 4.3 Audit Verification Required

| Scenario | Expected | Test Coverage |
|----------|----------|---------------|
| Normal state | Success | ✅ `test_INV_W1_WithdrawAllAlwaysSucceeds_NormalState` |
| Paused contract | Success | ✅ `test_INV_W1_WithdrawAllAlwaysSucceeds_WhenPaused` |
| Conversion pending | Success (auto-cancels) | ✅ `test_INV_W1_WithdrawAllAlwaysSucceeds_WithConversionPending` |
| After failed conversion | Success | ✅ `test_INV_W1_WithdrawAllAlwaysSucceeds_AfterFailedConversion` |
| Stale oracle | Success | ✅ `test_INV_W1_WithdrawAllAlwaysSucceeds_WithStaleOracle` |
| Empty vault | Success (zero amounts) | ✅ `test_INV_W1_WithdrawAllAlwaysSucceeds_EmptyVault` |

---

## 5. Areas Requiring Audit Focus

### 5.1 CRITICAL: Conversion Executor Trust Model

**Location:** `MeezanVaultV3.sol::executeConversion()`

**Risk:** Executor could pass bad `minAmountsOut` to grief users.

**Mitigations:**
1. `ZeroMinAmountOut` error prevents zeros for non-dust swaps
2. Executor is protocol-controlled (immutable at construction)
3. Owner can disable background conversion
4. Owner can always `withdrawAll()` to escape

**Audit Questions:**
1. Can executor force unfavorable swaps?
2. Can executor lock funds (answer: no, `withdrawAll()` always works)?
3. Is the dust threshold check sufficient?

### 5.2 CRITICAL: Atomic Revert Behavior

**Location:** `MeezanVaultV3.sol::convertAndWithdraw()`, `_convertAllToUsdc()`

**Risk:** Partial conversion could leave inconsistent state.

**Mitigations:**
1. Single transaction, single revert point
2. No intermediate state changes before all swaps complete
3. USDC transfer happens after all swaps

**Audit Questions:**
1. Can any swap fail and leave partial state?
2. Are approvals cleaned up on revert?
3. Is reentrancy possible between swaps?

### 5.3 HIGH: State Transition Integrity

**Location:** `MeezanVaultV3.sol::requestConversion()`, `executeConversion()`, `cancelConversion()`

**Risk:** Invalid state transitions could lock funds or allow duplicate requests.

**Mitigations:**
1. `ConversionAlreadyPending` prevents duplicate requests
2. `NoConversionPending` prevents invalid execute/cancel
3. Auto-cancel on deposit/rebalance prevents orphaned requests

**Audit Questions:**
1. Can state get stuck in PENDING forever?
2. Can two requests be active simultaneously?
3. Does auto-cancel emit correct events?

### 5.4 HIGH: minAmountsOut Array Ordering

**Location:** `MeezanVaultV3.sol::getConversionAssetOrder()`

**Risk:** Off-by-one errors in array mapping could cause slippage failures.

**Mitigations:**
1. `getConversionAssetOrder()` returns exact token/index mapping
2. Frontend uses this function to build `minAmountsOut`
3. `InvalidMinAmountsLength` error validates array size

**Audit Questions:**
1. Does `getConversionAssetOrder()` match `_convertAllToUsdc()` iteration order?
2. Are edge cases handled (stablecoin at different indices)?

### 5.5 MEDIUM: Auto-Cancel Side Effects

**Location:** Multiple functions that auto-cancel conversion

**Risk:** Unexpected state changes could surprise users.

**Auto-cancel triggers:**
- `deposit()` - user is adding funds, not withdrawing
- `depositAndRebalance()` - same
- `rebalance()` - user is managing portfolio
- `withdrawAll()` - user wants assets now
- `disableBackgroundConversion()` - explicit disable

**Audit Questions:**
1. Are all auto-cancel scenarios documented?
2. Do events emit correctly?
3. Can auto-cancel be exploited?

---

## 6. V3-Specific Invariants

| ID | Property | Test Coverage |
|----|----------|---------------|
| INV-W1 | `withdrawAll()` ALWAYS succeeds | 6 tests |
| INV-W2 | `withdrawAll()` never performs swaps | Code review |
| INV-W3 | `withdrawAll()` auto-cancels pending conversion | ✅ Tested |
| INV-C1 | `convertAndWithdraw()` is atomic (full success or full revert) | 5 tests |
| INV-C2 | No partial conversion state is possible | Code review |
| INV-C3 | Only one pending conversion at a time | 4 tests |

---

## 7. Explicitly Out of Scope

### 7.1 Not In This Audit

| Item | Reason |
|------|--------|
| Frontend code | Not auditable via Solidity tools |
| Executor infrastructure | Operational concern, not contract security |
| V2 contracts | Covered in V2_AUDIT_SCOPE.md |
| V1 contracts | Previously reviewed |
| Uniswap/Permit2 | Canonical deployments |
| Chainlink oracles | External dependency |

### 7.2 Phase 3 Ideas (Not Implemented)

| Idea | Status |
|------|--------|
| Permissionless `executeConversion()` with on-chain oracle bounds | Not implemented |
| Gelato automation | Not implemented |
| Conversion fees | Not implemented |
| Time-locked conversions | Not implemented |

---

## 8. Test Coverage Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| `MeezanVaultV3.t.sol` | 45 | ✅ All passing |
| `MeezanFactoryV3.t.sol` | 24 | ✅ All passing |
| **Total** | **69** | ✅ |

### 8.1 Test Categories

| Category | Count |
|----------|-------|
| INV-W1 (withdrawAll always succeeds) | 6 |
| INV-C1 (atomic revert) | 5 |
| INV-C3 (state transitions) | 10 |
| Auto-cancel behavior | 4 |
| getConversionAssetOrder | 3 |
| Background conversion control | 3 |
| Dust threshold | 1 |
| Event emission | 2 |
| Constructor | 3 |
| V2 inherited functionality | 2 |
| Fuzz tests | 2 |
| Edge cases | 4 |
| Factory tests | 24 |

---

## 9. Deliverables

### 9.1 Pre-Audit (Complete)

- [x] `MeezanVaultV3.sol` source code (~1000 LOC)
- [x] `MeezanFactoryV3.sol` source code (~170 LOC)
- [x] 69 unit tests (all passing)
- [x] NatSpec documentation
- [x] V3_AUDIT_SCOPE.md (this document)
- [ ] Slither report (to be generated)

### 9.2 Post-Audit (Expected)

- [ ] Audit report with severity classifications
- [ ] Specific vulnerability findings with PoC
- [ ] Re-audit after fixes (if needed)

---

## 10. Relationship to V2 Audit

| Aspect | V2 | V3 |
|--------|----|----|
| Scope | Full contract review | Additive review (delta only) |
| Rebalancing | In scope | Unchanged, out of V3 scope |
| withdrawAll() | In scope | Unchanged, verify invariant |
| Conversion | Not present | **NEW - full scope** |
| Factory | In scope | New factory, minimal changes |

**Recommendation:** Audit V3 as a delta on top of V2. Focus on:
1. New conversion functions
2. State machine integrity
3. `withdrawAll()` invariant preservation

---

**END OF V3 AUDIT SCOPE DOCUMENT**
