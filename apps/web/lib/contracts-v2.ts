/**
 * MeezanVaultV2 and MeezanFactoryV2 Contract Configuration
 *
 * IMPORTANT: Addresses must be sourced from security.ts and chain-locked to Base.
 */

import { type Address } from 'viem'
import { VERIFIED_CONTRACTS } from './security'
import { ASSETS, type AssetId, ASSET_LIST } from './assets'

// ═══════════════════════════════════════════════════════════════════════════════
// V2 CONTRACT ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════════

export const CONTRACTS_V2 = {
  // Factory V2 - deploys multi-asset vaults with immediate ownership + depositAndRebalance
  // Deployed on Base mainnet 2026-01-24 (v2.1 with depositAndRebalance)
  factoryV2: '0xc24F363E8F1Df37AEBfb50366118DfafF21983CA' as Address,

  // Swap Router (same as v1)
  swapRouter: VERIFIED_CONTRACTS.swapRouter,

  // USDC (stablecoin for all v2 vaults)
  usdc: VERIFIED_CONTRACTS.usdc,
} as const

// ═══════════════════════════════════════════════════════════════════════════════
// MEEZANFACTORYV2 ABI
// ═══════════════════════════════════════════════════════════════════════════════

export const FACTORY_V2_ABI = [
  // Create vault
  {
    name: 'createVault',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'assets',
        type: 'tuple[]',
        components: [
          { name: 'token', type: 'address' },
          { name: 'priceFeed', type: 'address' },
          { name: 'poolFee', type: 'uint24' },
          { name: 'targetWeightBps', type: 'uint16' },
        ],
      },
      { name: 'stablecoin', type: 'address' },
      { name: 'driftThresholdBps', type: 'uint16' },
    ],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  // Get vault by full config
  {
    name: 'getVault',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      {
        name: 'assets',
        type: 'tuple[]',
        components: [
          { name: 'token', type: 'address' },
          { name: 'priceFeed', type: 'address' },
          { name: 'poolFee', type: 'uint24' },
          { name: 'targetWeightBps', type: 'uint16' },
        ],
      },
      { name: 'stablecoin', type: 'address' },
      { name: 'driftThresholdBps', type: 'uint16' },
    ],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  // Get vault by config hash
  {
    name: 'getVaultByHash',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'configHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  // Swap router
  {
    name: 'swapRouter',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  // Vault count
  {
    name: 'vaultCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'count', type: 'uint256' }],
  },
  // Events
  {
    name: 'VaultV2Deployed',
    type: 'event',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'assetCount', type: 'uint8', indexed: false },
      { name: 'driftThresholdBps', type: 'uint16', indexed: false },
      { name: 'configHash', type: 'bytes32', indexed: false },
    ],
  },
] as const

// ═══════════════════════════════════════════════════════════════════════════════
// MEEZANVAULTV2 ABI
// ═══════════════════════════════════════════════════════════════════════════════

export const VAULT_V2_ABI = [
  // ─────────────────────────────────────────────────────────────────────────────
  // Asset Configuration (read-only)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'assetCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'assets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'index', type: 'uint8' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'allAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    name: 'targetWeightBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'index', type: 'uint8' }],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    name: 'allTargetWeights',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16[]' }],
  },
  {
    name: 'stablecoinIndex',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'driftThresholdBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Holdings and Values
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'holdings',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'balances', type: 'uint256[]' }],
  },
  {
    name: 'getUsdValues',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'values', type: 'uint256[]' }],
  },
  {
    name: 'totalUsdValue',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Current Weights and Drift
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'allCurrentWeights',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'weights', type: 'uint16[]' }],
  },
  {
    name: 'portfolioDriftBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    name: 'assetDriftBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'index', type: 'uint8' }],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    name: 'needsRebalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Ownership
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'pendingOwner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'acceptOwnership',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'lastRebalanceAt',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    name: 'autoRebalanceEnabled',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Owner Actions
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetIndex', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'depositAndRebalance',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetIndex', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetIndex', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'withdrawAll',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'rebalance',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Events
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Deposit',
    type: 'event',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Withdraw',
    type: 'event',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Rebalanced',
    type: 'event',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'preDriftBps', type: 'uint16', indexed: false },
      { name: 'swapsExecuted', type: 'uint8', indexed: false },
      { name: 'timestamp', type: 'uint64', indexed: false },
    ],
  },
  {
    name: 'OwnershipTransferStarted',
    type: 'event',
    inputs: [
      { name: 'currentOwner', type: 'address', indexed: true },
      { name: 'pendingOwner', type: 'address', indexed: true },
    ],
  },
  {
    name: 'OwnershipTransferred',
    type: 'event',
    inputs: [
      { name: 'previousOwner', type: 'address', indexed: true },
      { name: 'newOwner', type: 'address', indexed: true },
    ],
  },
] as const

// ═══════════════════════════════════════════════════════════════════════════════
// ASSET CONFIG BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Asset configuration for MeezanVaultV2 constructor
 */
export interface AssetConfigV2 {
  token: Address
  priceFeed: Address
  poolFee: number
  targetWeightBps: number
}

/**
 * Build asset config array for vault creation
 * @param allocations Map of asset ID to weight in percentage (0-100)
 * @returns Array of AssetConfig for contract call
 */
export function buildAssetConfig(
  allocations: Record<AssetId, number>
): AssetConfigV2[] {
  const configs: AssetConfigV2[] = []

  for (const assetId of ASSET_LIST) {
    const weight = allocations[assetId]
    if (weight > 0) {
      const asset = ASSETS[assetId]
      configs.push({
        token: asset.tokenAddress,
        priceFeed: asset.priceFeedAddress,
        poolFee: asset.poolFee,
        targetWeightBps: weight * 100, // Convert percentage to basis points
      })
    }
  }

  return configs
}

/**
 * Find the stablecoin index in the asset config array
 */
export function findStablecoinIndex(configs: AssetConfigV2[]): number {
  const usdcAddress = CONTRACTS_V2.usdc.toLowerCase()
  return configs.findIndex(c => c.token.toLowerCase() === usdcAddress)
}

/**
 * Compute config hash (matches contract's _computeConfigHash)
 * Used for vault lookup without re-encoding full config
 */
export function computeConfigHash(
  assets: AssetConfigV2[],
  stablecoin: Address,
  driftThresholdBps: number
): `0x${string}` {
  // Note: This is a simplified hash. For exact matching, use ethers.utils.keccak256
  // with proper ABI encoding. For now, we use factory.getVault() for lookups.
  const encoder = new TextEncoder()
  const data = JSON.stringify({ assets, stablecoin, driftThresholdBps })
  // This is a placeholder - in production use proper ABI encoding
  return `0x${'0'.repeat(64)}` as `0x${string}`
}

// ═══════════════════════════════════════════════════════════════════════════════
// VAULT DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

// Fallback RPC endpoints for direct calls
// mainnet.base.org first - llamarpc can return stale data
const FALLBACK_RPCS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
]

/**
 * Check if an address has bytecode (is a deployed contract)
 * This prevents using "phantom" addresses that the factory recorded but never deployed
 */
export async function hasContractBytecode(address: Address): Promise<boolean> {
  for (const rpcUrl of FALLBACK_RPCS) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getCode',
          params: [address, 'latest']
        })
      })

      const data = await response.json()
      // If there's bytecode at the address (more than just "0x" or "0x0")
      if (data.result && data.result !== '0x' && data.result !== '0x0' && data.result.length > 4) {
        console.log('[hasContractBytecode] Contract exists at', address, '- bytecode length:', data.result.length)
        return true
      }
      console.log('[hasContractBytecode] No contract at', address, '- result:', data.result?.slice(0, 10))
      return false
    } catch (error) {
      console.warn(`[hasContractBytecode] RPC ${rpcUrl} failed:`, error)
      continue
    }
  }
  // If all RPCs fail, assume no bytecode (safer to create new vault)
  return false
}

/**
 * Verify a vault is valid: has bytecode, has correct owner, responds to calls
 */
export async function verifyVaultValid(
  vaultAddress: Address,
  expectedOwner: Address
): Promise<{ valid: boolean; reason?: string }> {
  console.log('[verifyVaultValid] Checking vault:', vaultAddress, 'expected owner:', expectedOwner)

  // Step 1: Check bytecode exists
  const hasBytecode = await hasContractBytecode(vaultAddress)
  if (!hasBytecode) {
    return { valid: false, reason: 'phantom_vault' }
  }

  // Step 2: Check owner
  for (const rpcUrl of FALLBACK_RPCS) {
    try {
      // owner() selector: 0x8da5cb5b
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to: vaultAddress, data: '0x8da5cb5b' }, 'latest']
        })
      })

      const data = await response.json()
      if (data.result && data.result.length >= 66) {
        const owner = '0x' + data.result.slice(-40)
        console.log('[verifyVaultValid] Vault owner:', owner)
        if (owner.toLowerCase() === expectedOwner.toLowerCase()) {
          return { valid: true }
        } else {
          return { valid: false, reason: 'wrong_owner' }
        }
      }
    } catch (error) {
      continue
    }
  }

  return { valid: false, reason: 'cannot_verify' }
}

/**
 * Check if user already has a v2 vault with the given configuration
 * Uses multiple RPC endpoints with fallback for reliability
 * IMPORTANT: Also verifies the vault actually exists (has bytecode)
 */
export async function checkExistingVaultV2(
  publicClient: any,
  owner: Address,
  allocations: Record<AssetId, number>,
  driftThresholdBps: number
): Promise<Address | null> {
  const assets = buildAssetConfig(allocations)

  if (assets.length < 2) {
    return null // Invalid config
  }

  let vaultAddress: Address | null = null

  // Try viem publicClient first
  try {
    const result = await publicClient.readContract({
      address: CONTRACTS_V2.factoryV2,
      abi: FACTORY_V2_ABI,
      functionName: 'getVault',
      args: [owner, assets, CONTRACTS_V2.usdc, driftThresholdBps],
    })

    if (result && result !== '0x0000000000000000000000000000000000000000') {
      vaultAddress = result as Address
    }
  } catch (error) {
    console.warn('[checkExistingVaultV2] viem call failed, trying direct RPC:', error)
  }

  // Fallback: try direct RPC calls
  if (!vaultAddress) {
    const { encodeFunctionData } = await import('viem')

    try {
      const calldata = encodeFunctionData({
        abi: FACTORY_V2_ABI,
        functionName: 'getVault',
        args: [owner, assets, CONTRACTS_V2.usdc, driftThresholdBps],
      })

      for (const rpcUrl of FALLBACK_RPCS) {
        try {
          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_call',
              params: [{ to: CONTRACTS_V2.factoryV2, data: calldata }, 'latest']
            })
          })

          const data = await response.json()
          if (data.result && data.result !== '0x' && data.result.length >= 66) {
            const addressHex = '0x' + data.result.slice(-40)
            if (addressHex !== '0x0000000000000000000000000000000000000000') {
              vaultAddress = addressHex as Address
              break
            }
          }
          if (data.result) break // Valid response, no vault
        } catch (rpcError) {
          console.warn(`[checkExistingVaultV2] RPC ${rpcUrl} failed:`, rpcError)
          continue
        }
      }
    } catch (encodeError) {
      console.error('[checkExistingVaultV2] Failed to encode call:', encodeError)
    }
  }

  // If we found a vault, verify it's valid before returning
  if (vaultAddress) {
    console.log('[checkExistingVaultV2] Found vault address:', vaultAddress, '- verifying...')
    const verification = await verifyVaultValid(vaultAddress, owner)

    if (verification.valid) {
      console.log('[checkExistingVaultV2] Vault verified as valid')
      return vaultAddress
    } else {
      console.warn('[checkExistingVaultV2] Vault invalid:', verification.reason)
      // Return special marker for phantom vault so caller can handle
      if (verification.reason === 'phantom_vault') {
        // This is a critical issue - factory has record but no contract exists
        console.error('[checkExistingVaultV2] PHANTOM VAULT DETECTED at', vaultAddress)
        console.error('[checkExistingVaultV2] Factory has record but contract does not exist')
        console.error('[checkExistingVaultV2] User should try a different drift threshold')
      }
      return null
    }
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL STORAGE FOR V2 VAULTS
// ═══════════════════════════════════════════════════════════════════════════════

const V2_VAULTS_KEY = 'meezan_v2_vaults'

interface StoredVaultV2 {
  address: Address
  configHash: string
  createdAt: number
}

/**
 * Store a v2 vault address locally for quick lookup
 */
export function storeVaultV2(
  owner: Address,
  vaultAddress: Address,
  configHash: string
): void {
  if (typeof window === 'undefined') return

  try {
    const key = `${V2_VAULTS_KEY}_${owner.toLowerCase()}`
    const existing = localStorage.getItem(key)
    const vaults: StoredVaultV2[] = existing ? JSON.parse(existing) : []

    // Check if already stored
    if (!vaults.some(v => v.address.toLowerCase() === vaultAddress.toLowerCase())) {
      vaults.push({
        address: vaultAddress,
        configHash,
        createdAt: Date.now(),
      })
      localStorage.setItem(key, JSON.stringify(vaults))
    }
  } catch (error) {
    console.error('Failed to store v2 vault:', error)
  }
}

/**
 * Get all stored v2 vaults for an owner
 */
export function getStoredVaultsV2(owner: Address): StoredVaultV2[] {
  if (typeof window === 'undefined') return []

  try {
    const key = `${V2_VAULTS_KEY}_${owner.toLowerCase()}`
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    return []
  }
}

/**
 * Get the most recent v2 vault for an owner
 */
export function getLatestVaultV2(owner: Address): Address | null {
  const vaults = getStoredVaultsV2(owner)
  if (vaults.length === 0) return null

  // Sort by creation time, most recent first
  vaults.sort((a, b) => b.createdAt - a.createdAt)
  return vaults[0].address
}

/**
 * Remove a v2 vault from localStorage (e.g., after withdrawal)
 */
export function removeVaultV2(owner: Address, vaultAddress: Address): void {
  if (typeof window === 'undefined') return

  try {
    const key = `${V2_VAULTS_KEY}_${owner.toLowerCase()}`
    const existing = localStorage.getItem(key)
    if (!existing) return

    const vaults: StoredVaultV2[] = JSON.parse(existing)
    const filtered = vaults.filter(
      v => v.address.toLowerCase() !== vaultAddress.toLowerCase()
    )

    if (filtered.length === 0) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(filtered))
    }
  } catch (error) {
    console.error('Failed to remove v2 vault:', error)
  }
}

/**
 * Clear all stored v2 vaults for an owner (useful for cleanup)
 */
export function clearAllVaultsV2(owner: Address): void {
  if (typeof window === 'undefined') return

  try {
    const key = `${V2_VAULTS_KEY}_${owner.toLowerCase()}`
    localStorage.removeItem(key)
    console.log('[clearAllVaultsV2] Cleared all vaults for', owner)
  } catch (error) {
    console.error('Failed to clear v2 vaults:', error)
  }
}

/**
 * Validate and clean up stored vaults - removes any that don't actually exist
 */
export async function cleanupInvalidVaultsV2(owner: Address): Promise<void> {
  if (typeof window === 'undefined') return

  const vaults = getStoredVaultsV2(owner)
  if (vaults.length === 0) return

  console.log('[cleanupInvalidVaultsV2] Checking', vaults.length, 'stored vaults')

  for (const vault of vaults) {
    const hasBytecode = await hasContractBytecode(vault.address)
    if (!hasBytecode) {
      console.log('[cleanupInvalidVaultsV2] Removing invalid vault:', vault.address)
      removeVaultV2(owner, vault.address)
    }
  }
}

/**
 * Discover vaults from the factory by querying VaultV2Deployed events
 * This finds vaults that may not be in localStorage (e.g., if UI failed before storing)
 */
export async function discoverVaultsFromFactory(owner: Address): Promise<Address[]> {
  console.log('[discoverVaultsFromFactory] Searching for vaults owned by:', owner)

  // VaultV2Deployed event signature: VaultV2Deployed(address indexed owner, address indexed vault, uint8 assetCount, uint16 driftThresholdBps, bytes32 configHash)
  // topic0 = keccak256("VaultV2Deployed(address,address,uint8,uint16,bytes32)")
  // topic1 = owner (indexed)
  // topic2 = vault (indexed)
  // Compute topic0 using viem
  const { keccak256, toBytes } = await import('viem')
  const eventSignature = 'VaultV2Deployed(address,address,uint8,uint16,bytes32)'
  const computedTopic0 = keccak256(toBytes(eventSignature))
  console.log('[discoverVaultsFromFactory] Event topic0:', computedTopic0)

  // Pad owner address to 32 bytes for topic filter
  const ownerTopic = '0x' + owner.toLowerCase().slice(2).padStart(64, '0')
  console.log('[discoverVaultsFromFactory] Owner topic:', ownerTopic)

  const discoveredVaults: Address[] = []

  for (const rpcUrl of FALLBACK_RPCS) {
    try {
      console.log('[discoverVaultsFromFactory] Querying RPC:', rpcUrl)
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getLogs',
          params: [{
            address: CONTRACTS_V2.factoryV2,
            topics: [computedTopic0, ownerTopic],
            fromBlock: '0x0',
            toBlock: 'latest'
          }]
        })
      })

      const data = await response.json()
      console.log('[discoverVaultsFromFactory] Got logs response:', data)

      if (data.result && Array.isArray(data.result)) {
        for (const log of data.result) {
          // topic2 is the vault address (indexed)
          if (log.topics && log.topics.length >= 3) {
            const vaultAddress = '0x' + log.topics[2].slice(-40) as Address
            console.log('[discoverVaultsFromFactory] Found vault:', vaultAddress)

            // Verify it's valid before adding
            const verification = await verifyVaultValid(vaultAddress, owner)
            if (verification.valid) {
              discoveredVaults.push(vaultAddress)
              // Also store it in localStorage for future quick lookups
              storeVaultV2(owner, vaultAddress, 'discovered')
            }
          }
        }
      }

      break // Success, don't try other RPCs
    } catch (error) {
      console.warn(`[discoverVaultsFromFactory] RPC ${rpcUrl} failed:`, error)
      continue
    }
  }

  console.log('[discoverVaultsFromFactory] Total discovered:', discoveredVaults.length)
  return discoveredVaults
}
