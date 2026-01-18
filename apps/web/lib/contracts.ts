import { type Address } from 'viem'

// Base mainnet addresses
export const CONTRACTS = {
  factory: '0x9FfD7a7dd2C730f1E85643868B645778feDF4f8b' as Address,
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  wbtc: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' as Address, // cbBTC on Base
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
  {
    type: 'event',
    name: 'VaultDeployed',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'allocation', type: 'uint8', indexed: false },
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
    name: 'allocation',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
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
    name: 'rebalance',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
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
