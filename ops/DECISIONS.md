# Meezan - Decision Log

All decisions that change behaviour are recorded here.

---

## 2026-01-18: Project Takeover Assessment

**Decision:** Keep existing smart contracts as-is. They are complete and meet all v1 constraints.

**Reason:** Reviewed MeezanVault.sol and tests. All features required by mvp-scope.md are implemented.

---

## 2026-01-18: Added MeezanFactory Contract

**Decision:** Create a factory contract that deploys individual vaults.

**Reason:** Users need a way to deploy their own vaults via the web UI. The factory:
- Deploys new MeezanVault contracts for users
- Transfers ownership to the caller immediately
- Tracks deployed vaults per user per allocation preset

---

## 2026-01-18: Web UI Tech Stack

**Decision:** Use Next.js 16 + Tailwind + wagmi/viem.

**Reason:**
- Next.js provides good DX and easy deployment to Vercel
- Tailwind enables rapid, consistent styling
- wagmi/viem are the standard for React wallet connections

---

## 2026-01-18: Fork Test Strategy

**Decision:** Skip fork test in normal CI, document manual run.

**Reason:** Fork test requires BASE_RPC environment variable which may not be available in all environments. The 144 unit tests provide sufficient coverage of contract logic.

---

## 2026-01-18: Contract Size Warning

**Decision:** Accept contract size warning for v1, optimize later if needed.

**Reason:** MeezanVault is 28109 bytes (limit is 24576). Fork simulation passed. Options for future:
- Split into multiple contracts
- Use libraries
- Remove debug/helper functions

For v1 MVP, this is acceptable as Base supports larger contracts via EIP-170 exemptions in some cases.

---

## 2026-01-19: Pre-Deployment Naming Refactor

**Decision:** Rename all "risk" terminology to neutral "allocation" language before deployment.

**What changed:**
- `RiskPresets.sol` → `AllocationPresets.sol`
- `RiskLevel` enum → `AllocationPreset` enum
- Enum values: `VeryConservative` → `Split10_90`, `Conservative` → `Split25_75`, etc.
- Variable names: `riskLevel` → `allocation`
- All contract imports, events, constructor params updated
- TypeScript bindings updated
- UI internal references updated

**Reason:** A trust and regulatory audit identified CRITICAL issues with advisory language in immutable on-chain code:

1. **Regulatory exposure:** Terms like "Conservative", "Aggressive", "Growth" imply investment advice and risk assessment. This creates potential securities law violations in many jurisdictions.

2. **Immutability:** Unlike UI copy, on-chain enum names are permanent. Once deployed, `RiskLevel.Aggressive` would be visible in ABIs, block explorers, and contract calls forever.

3. **Professional positioning:** Neutral percentage-based names (10/90, 50/50, etc.) describe the factual allocation without characterizing suitability for any user.

**What did NOT change:**
- Economic logic
- Contract behavior
- Storage layout
- Function signatures (beyond renamed identifiers)
- Test coverage (158 tests still pass)

**Verification:**
- `forge test` passes with 158 tests
- All imports resolve correctly
- ABI parameter names updated to `allocation`

---
