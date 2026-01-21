#!/bin/bash
# Prepare audit package by copying relevant files
# Run from AUDIT_PACKAGE directory: ./prepare.sh

set -e

# Create directories
mkdir -p contracts/interfaces
mkdir -p scripts
mkdir -p docs
mkdir -p tests

# Copy contracts
cp ../packages/contracts/src/MeezanVault.sol contracts/
cp ../packages/contracts/src/MeezanFactory.sol contracts/
cp ../packages/contracts/src/AllocationPresets.sol contracts/
cp ../packages/contracts/src/interfaces/*.sol contracts/interfaces/

# Copy deployment script
cp ../packages/contracts/script/Deploy.s.sol scripts/ 2>/dev/null || echo "No deployment script found"

# Copy documentation
cp ../docs/THREAT_MODEL.md docs/
cp ../docs/SECURITY_CHECKLIST.md docs/
cp ../docs/STATIC_ANALYSIS.md docs/

# Copy tests
cp ../packages/contracts/test/MeezanVault.t.sol tests/
cp ../packages/contracts/test/MeezanFactory.t.sol tests/
cp ../packages/contracts/test/MeezanVault.invariant.t.sol tests/

echo "Audit package prepared successfully!"
echo ""
echo "Contents:"
find . -type f -name "*.sol" -o -name "*.md" | sort
