#!/bin/bash
# Prepare Meezan v2 Audit Package
# Run from repository root: ./scripts/prepare_audit_package_v2.sh

set -e

PACKAGE_DIR="AUDIT_PACKAGE_V2"

echo "=== Preparing Meezan v2 Audit Package ==="

# Create package directory structure
mkdir -p "$PACKAGE_DIR/contracts"
mkdir -p "$PACKAGE_DIR/interfaces"
mkdir -p "$PACKAGE_DIR/tests"
mkdir -p "$PACKAGE_DIR/mocks"
mkdir -p "$PACKAGE_DIR/docs"

# Copy contracts
echo "Copying contracts..."
cp packages/contracts/src/MeezanVaultV2.sol "$PACKAGE_DIR/contracts/"
cp packages/contracts/src/MeezanFactoryV2.sol "$PACKAGE_DIR/contracts/"

# Copy interfaces
echo "Copying interfaces..."
cp packages/contracts/src/interfaces/*.sol "$PACKAGE_DIR/interfaces/"

# Copy tests
echo "Copying tests..."
cp packages/contracts/test/MeezanVaultV2.t.sol "$PACKAGE_DIR/tests/"
cp packages/contracts/test/MeezanFactoryV2.t.sol "$PACKAGE_DIR/tests/"
cp packages/contracts/test/ForkProofV2.t.sol "$PACKAGE_DIR/tests/"

# Copy mocks
echo "Copying mocks..."
cp packages/contracts/test/mocks/MockSwapRouterV2.sol "$PACKAGE_DIR/mocks/"
cp packages/contracts/test/mocks/MockPriceFeed.sol "$PACKAGE_DIR/mocks/"
cp packages/contracts/test/mocks/MockERC20.sol "$PACKAGE_DIR/mocks/"

# Copy documentation
echo "Copying documentation..."
cp docs/V2_AUDIT_SCOPE.md "$PACKAGE_DIR/docs/"
cp docs/V2_INVARIANTS.md "$PACKAGE_DIR/docs/"
cp docs/V2_EXECUTION_DESIGN.md "$PACKAGE_DIR/docs/"
cp docs/V2_EXECUTION_REVIEW_FINAL.md "$PACKAGE_DIR/docs/"
cp docs/THREAT_MODEL.md "$PACKAGE_DIR/docs/"
cp docs/V2_DESIGN.md "$PACKAGE_DIR/docs/"
cp docs/V2_IMPLEMENTATION_PLAN.md "$PACKAGE_DIR/docs/"

# Generate line counts
echo "Generating line counts..."
echo "=== Line Counts ===" > "$PACKAGE_DIR/LINE_COUNTS.txt"
echo "" >> "$PACKAGE_DIR/LINE_COUNTS.txt"
wc -l "$PACKAGE_DIR/contracts/"*.sol >> "$PACKAGE_DIR/LINE_COUNTS.txt" 2>/dev/null || true
echo "" >> "$PACKAGE_DIR/LINE_COUNTS.txt"
echo "=== Test Counts ===" >> "$PACKAGE_DIR/LINE_COUNTS.txt"
wc -l "$PACKAGE_DIR/tests/"*.sol >> "$PACKAGE_DIR/LINE_COUNTS.txt" 2>/dev/null || true

# Create manifest
echo "Creating manifest..."
echo "Meezan v2 Audit Package" > "$PACKAGE_DIR/MANIFEST.txt"
echo "Generated: $(date)" >> "$PACKAGE_DIR/MANIFEST.txt"
echo "" >> "$PACKAGE_DIR/MANIFEST.txt"
echo "=== Files ===" >> "$PACKAGE_DIR/MANIFEST.txt"
find "$PACKAGE_DIR" -type f | sort >> "$PACKAGE_DIR/MANIFEST.txt"

echo ""
echo "=== Audit Package Ready ==="
echo "Location: $PACKAGE_DIR/"
echo ""
echo "Contents:"
ls -la "$PACKAGE_DIR/"
echo ""
echo "To verify tests pass:"
echo "  cd packages/contracts && forge test --match-contract MeezanVaultV2"
