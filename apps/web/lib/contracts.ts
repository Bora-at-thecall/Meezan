import { type Address } from 'viem'
import { VERIFIED_CONTRACTS } from './security'

// Re-export verified contracts for backward compatibility
// IMPORTANT: These addresses are hardcoded in security.ts and must not be dynamically loaded
export const CONTRACTS = {
  factory: VERIFIED_CONTRACTS.factory,
  usdc: VERIFIED_CONTRACTS.usdc,
  wbtc: VERIFIED_CONTRACTS.cbBTC, // cbBTC on Base (alias for backward compat)
  btcUsdFeed: VERIFIED_CONTRACTS.btcUsdFeed,
  usdcUsdFeed: VERIFIED_CONTRACTS.usdcUsdFeed,
}

// Allocation presets matching the contract enum
// Names are neutral percentages to avoid advisory language
export const ALLOCATION_PRESETS = [
  { id: 0, name: '10 / 90', btcPct: 10 },
  { id: 1, name: '25 / 75', btcPct: 25 },
  { id: 2, name: '50 / 50', btcPct: 50 },
  { id: 3, name: '75 / 25', btcPct: 75 },
  { id: 4, name: '90 / 10', btcPct: 90 },
] as const

export type AllocationPresetType = typeof ALLOCATION_PRESETS[number]

// Factory ABI
export const FACTORY_ABI = [
  // Simple mode (presets)
  {
    name: 'createVault',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'allocation', type: 'uint8' }],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  {
    name: 'getVault',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'allocation', type: 'uint8' },
    ],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  {
    name: 'vaults',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'allocation', type: 'uint8' },
    ],
    outputs: [{ type: 'address' }],
  },
  // Advanced mode (custom allocations)
  {
    name: 'createAdvancedVault',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pctA', type: 'uint16' },
      { name: 'pctB', type: 'uint16' },
      { name: 'driftThresholdBps', type: 'uint16' },
    ],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  {
    name: 'getAdvancedVault',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'pctA', type: 'uint16' },
      { name: 'pctB', type: 'uint16' },
      { name: 'driftThresholdBps', type: 'uint16' },
    ],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  // Events
  {
    type: 'event',
    name: 'VaultDeployed',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'allocation', type: 'uint8', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AdvancedVaultDeployed',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'pctA', type: 'uint16', indexed: false },
      { name: 'pctB', type: 'uint16', indexed: false },
      { name: 'driftThresholdBps', type: 'uint16', indexed: false },
    ],
  },
] as const

// Minimal ABI for MeezanVault (only what we need for the UI)
export const VAULT_ABI = [
  // Read functions
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'pendingOwner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'holdings',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'balA', type: 'uint256' },
      { name: 'balB', type: 'uint256' },
    ],
  },
  {
    name: 'getUsdValues',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'valueA', type: 'uint256' },
      { name: 'valueB', type: 'uint256' },
    ],
  },
  {
    name: 'currentAllocationsBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'pctA', type: 'uint16' },
      { name: 'pctB', type: 'uint16' },
    ],
  },
  {
    name: 'targetAllocations',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'pctA', type: 'uint16' },
      { name: 'pctB', type: 'uint16' },
    ],
  },
  {
    name: 'driftBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint16' }],
  },
  {
    name: 'driftThresholdBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint16' }],
  },
  // Write functions
  {
    name: 'acceptOwnership',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'depositUSDC',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amountUSDC', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'withdrawAll',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
    ],
  },
  {
    name: 'withdrawAllToUSDC',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [
      { name: 'totalUsdcWithdrawn', type: 'uint256' },
    ],
  },
  {
    name: 'rebalance',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // Events for activity log
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Withdraw',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DepositAndAllocated',
    inputs: [
      { name: 'amountUSDC', type: 'uint256', indexed: false },
      { name: 'wbtcBought', type: 'uint256', indexed: false },
      { name: 'usdcSpent', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Rebalanced',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'sellToken', type: 'address', indexed: true },
      { name: 'buyToken', type: 'address', indexed: true },
      { name: 'amountOut', type: 'uint256', indexed: false },
      { name: 'amountIn', type: 'uint256', indexed: false },
      { name: 'driftBefore', type: 'uint16', indexed: false },
      { name: 'driftAfter', type: 'uint16', indexed: false },
    ],
  },
] as const

// ERC20 ABI (minimal)
export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const

// Chainlink Price Feed ABI (minimal for status checks)
export const PRICE_FEED_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const
