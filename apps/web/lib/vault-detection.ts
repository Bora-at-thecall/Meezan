/**
 * Unified Vault Detection System
 *
 * Detects which vault version (V2 or V3) a user has and routes them accordingly.
 *
 * Rules:
 * - V3 check runs first (if available on current chain)
 * - Falls back to V2 if no V3 vault found
 * - If both exist, prefer V3 but expose V2 link for debugging
 * - Conservative: No vault deletions on RPC errors
 * - V3 hidden on mainnet until factory address is set
 */

import { type Address } from 'viem'
import { useEffect, useState, useCallback } from 'react'
import { useAccount, useChainId } from 'wagmi'

// V2 imports
import {
  getStoredVaultsV2,
  discoverVaultsFromFactory,
  verifyVaultValid,
  checkContractBytecode,
} from './contracts-v2'

// V3 imports
import {
  getV3FactoryAddress,
  FACTORY_V3_ABI,
  CONTRACTS_V3_SEPOLIA,
} from './contracts-v3'

// Store imports for V1 legacy vaults
import { getUserVaults as getV1Vaults } from './store'

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type VaultVersion = 'v1' | 'v2' | 'v3'

export interface DetectedVault {
  version: VaultVersion
  address: Address
  /** Config hash or allocation ID for reference */
  configRef?: string
}

export interface VaultDetectionResult {
  /** The primary vault to show (V3 preferred if both exist) */
  primaryVault: DetectedVault | null
  /** V2 vault if it exists (for "legacy" link when user has both) */
  legacyV2Vault: DetectedVault | null
  /** Whether detection is still running */
  isLoading: boolean
  /** Error message if detection failed */
  error: string | null
  /** True if detection couldn't complete due to network/RPC issues (cache was empty) */
  networkErrorNoCache: boolean
  /** Refresh detection */
  refresh: () => void
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAIN CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const BASE_MAINNET = 8453
const BASE_SEPOLIA = 84532

// Fallback RPC endpoints
const FALLBACK_RPCS_MAINNET = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
]

const FALLBACK_RPCS_SEPOLIA = [
  'https://sepolia.base.org',
]

function getRpcEndpoints(chainId: number): string[] {
  if (chainId === BASE_MAINNET) return FALLBACK_RPCS_MAINNET
  if (chainId === BASE_SEPOLIA) return FALLBACK_RPCS_SEPOLIA
  return []
}

// ═══════════════════════════════════════════════════════════════════════════════
// V3 VAULT DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Discover V3 vaults for an owner by querying VaultV3Deployed events
 */
async function discoverV3Vaults(
  owner: Address,
  chainId: number
): Promise<Address[]> {
  const factoryAddress = getV3FactoryAddress(chainId)
  if (!factoryAddress) {
    console.log('[discoverV3Vaults] V3 not available on chain', chainId)
    return []
  }

  console.log('[discoverV3Vaults] Searching for V3 vaults owned by:', owner)

  // VaultV3Deployed event signature
  const { keccak256, toBytes } = await import('viem')
  const eventSignature = 'VaultV3Deployed(address,address,uint8,uint16,bytes32)'
  const topic0 = keccak256(toBytes(eventSignature))

  // Pad owner address to 32 bytes
  const ownerTopic = '0x' + owner.toLowerCase().slice(2).padStart(64, '0')

  const rpcs = getRpcEndpoints(chainId)
  const discoveredVaults: Address[] = []

  for (const rpcUrl of rpcs) {
    try {
      console.log('[discoverV3Vaults] Querying RPC:', rpcUrl)
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getLogs',
          params: [{
            address: factoryAddress,
            topics: [topic0, ownerTopic],
            fromBlock: '0x0',
            toBlock: 'latest',
          }],
        }),
      })

      const data = await response.json()
      console.log('[discoverV3Vaults] Got logs response:', data)

      if (data.result && Array.isArray(data.result)) {
        for (const log of data.result) {
          // topic2 is the vault address (indexed)
          if (log.topics && log.topics.length >= 3) {
            const vaultAddress = '0x' + log.topics[2].slice(-40) as Address
            console.log('[discoverV3Vaults] Found V3 vault:', vaultAddress)

            // Verify it's valid
            const verification = await verifyVaultValid(vaultAddress, owner)
            if (verification.valid) {
              discoveredVaults.push(vaultAddress)
              // Store in localStorage for future quick lookups
              storeV3Vault(owner, vaultAddress)
            }
          }
        }
      }

      break // Success, don't try other RPCs
    } catch (error) {
      console.warn(`[discoverV3Vaults] RPC ${rpcUrl} failed:`, error)
      continue
    }
  }

  console.log('[discoverV3Vaults] Total discovered:', discoveredVaults.length)
  return discoveredVaults
}

// ═══════════════════════════════════════════════════════════════════════════════
// V3 LOCAL STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

const V3_VAULTS_KEY = 'meezan_v3_vaults'

interface StoredVaultV3 {
  address: Address
  createdAt: number
}

/**
 * Store a V3 vault address locally for quick lookup
 */
export function storeV3Vault(owner: Address, vaultAddress: Address): void {
  if (typeof window === 'undefined') return

  try {
    const key = `${V3_VAULTS_KEY}_${owner.toLowerCase()}`
    const existing = localStorage.getItem(key)
    const vaults: StoredVaultV3[] = existing ? JSON.parse(existing) : []

    if (!vaults.some(v => v.address.toLowerCase() === vaultAddress.toLowerCase())) {
      vaults.push({
        address: vaultAddress,
        createdAt: Date.now(),
      })
      localStorage.setItem(key, JSON.stringify(vaults))
    }
  } catch (error) {
    console.error('Failed to store V3 vault:', error)
  }
}

/**
 * Get stored V3 vaults for an owner
 */
function getStoredV3Vaults(owner: Address): StoredVaultV3[] {
  if (typeof window === 'undefined') return []

  try {
    const key = `${V3_VAULTS_KEY}_${owner.toLowerCase()}`
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/**
 * Get the most recent V3 vault for an owner
 */
function getLatestV3Vault(owner: Address): Address | null {
  const vaults = getStoredV3Vaults(owner)
  if (vaults.length === 0) return null

  vaults.sort((a, b) => b.createdAt - a.createdAt)
  return vaults[0].address
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DETECTION HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to detect which vault version a user has
 *
 * Detection order:
 * 1. Check V3 localStorage cache
 * 2. If not found, query V3 factory events
 * 3. Check V2 localStorage cache
 * 4. If not found, query V2 factory events
 * 5. Check V1 localStorage (legacy)
 *
 * @returns VaultDetectionResult with primary vault (V3 preferred) and optional legacy link
 */
export function useVaultDetection(): VaultDetectionResult {
  const { address } = useAccount()
  const chainId = useChainId()
  const [primaryVault, setPrimaryVault] = useState<DetectedVault | null>(null)
  const [legacyV2Vault, setLegacyV2Vault] = useState<DetectedVault | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [networkErrorNoCache, setNetworkErrorNoCache] = useState(false)

  const detectVaults = useCallback(async () => {
    if (!address) {
      setPrimaryVault(null)
      setLegacyV2Vault(null)
      setIsLoading(false)
      setNetworkErrorNoCache(false)
      return
    }

    setIsLoading(true)
    setError(null)
    setNetworkErrorNoCache(false)

    console.log('[useVaultDetection] Starting detection for', address, 'on chain', chainId)

    let v3Vault: Address | null = null
    let v2Vault: Address | null = null
    let v1Vault: Address | null = null
    let hadNetworkError = false
    let hadCachedVault = false

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // Step 1: Check V3 (if available on this chain)
      // ─────────────────────────────────────────────────────────────────────────
      const v3Factory = getV3FactoryAddress(chainId)
      if (v3Factory) {
        console.log('[useVaultDetection] V3 available, checking...')

        // Check localStorage first
        const cachedV3 = getLatestV3Vault(address)
        if (cachedV3) {
          hadCachedVault = true
          v3Vault = cachedV3
          console.log('[useVaultDetection] Found V3 vault in cache:', v3Vault)
          // Verify it still exists
          const bytecodeResult = await checkContractBytecode(v3Vault)
          if (bytecodeResult.verified && !bytecodeResult.exists) {
            console.log('[useVaultDetection] Cached V3 vault no longer exists')
            v3Vault = null
          } else if (!bytecodeResult.verified) {
            // Network error - trust the cache (conservative)
            console.log('[useVaultDetection] Could not verify V3 vault, trusting cache')
            hadNetworkError = true
          }
        }

        // If not in cache, discover from factory
        if (!v3Vault && !cachedV3) {
          const discovered = await discoverV3Vaults(address, chainId)
          if (discovered.length > 0) {
            v3Vault = discovered[0]
            console.log('[useVaultDetection] Discovered V3 vault:', v3Vault)
          } else {
            // Discovery returned empty - could be no vault OR network error
            // discoverV3Vaults silently fails on network errors
            console.log('[useVaultDetection] No V3 vaults discovered (may be network error)')
            hadNetworkError = true // Assume network might have failed
          }
        }
      } else {
        console.log('[useVaultDetection] V3 not available on chain', chainId)
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Step 2: Check V2
      // ─────────────────────────────────────────────────────────────────────────
      console.log('[useVaultDetection] Checking V2...')

      // Check localStorage first
      const storedV2 = getStoredVaultsV2(address)
      if (storedV2.length > 0) {
        hadCachedVault = true
        // Get the most recent
        storedV2.sort((a, b) => b.createdAt - a.createdAt)
        v2Vault = storedV2[0].address
        console.log('[useVaultDetection] Found V2 vault in cache:', v2Vault)

        // Verify it still exists
        const bytecodeResult = await checkContractBytecode(v2Vault)
        if (bytecodeResult.verified && !bytecodeResult.exists) {
          console.log('[useVaultDetection] Cached V2 vault no longer exists')
          v2Vault = null
        } else if (!bytecodeResult.verified) {
          // Network error - trust the cache (conservative)
          console.log('[useVaultDetection] Could not verify V2 vault, trusting cache')
          hadNetworkError = true
        }
      }

      // If not in cache, discover from factory (only on mainnet - V2 factory is mainnet only)
      if (!v2Vault && storedV2.length === 0 && chainId === BASE_MAINNET) {
        const discovered = await discoverVaultsFromFactory(address)
        if (discovered.length > 0) {
          v2Vault = discovered[0]
          console.log('[useVaultDetection] Discovered V2 vault:', v2Vault)
        } else {
          // Discovery returned empty - could be no vault OR network error
          console.log('[useVaultDetection] No V2 vaults discovered (may be network error)')
          hadNetworkError = true
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Step 3: Check V1 (legacy, mainnet only)
      // ─────────────────────────────────────────────────────────────────────────
      if (chainId === BASE_MAINNET) {
        const v1Vaults = getV1Vaults(address)
        if (v1Vaults.length > 0) {
          hadCachedVault = true
          v1Vault = v1Vaults[0].address
          console.log('[useVaultDetection] Found V1 vault in cache:', v1Vault)
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Step 4: Determine primary and legacy vaults
      // ─────────────────────────────────────────────────────────────────────────

      // V3 > V2 > V1 preference
      if (v3Vault) {
        setPrimaryVault({ version: 'v3', address: v3Vault })
        // If they also have V2, expose it as legacy link
        if (v2Vault) {
          setLegacyV2Vault({ version: 'v2', address: v2Vault })
        } else {
          setLegacyV2Vault(null)
        }
      } else if (v2Vault) {
        setPrimaryVault({ version: 'v2', address: v2Vault })
        setLegacyV2Vault(null)
      } else if (v1Vault) {
        setPrimaryVault({ version: 'v1', address: v1Vault })
        setLegacyV2Vault(null)
      } else {
        setPrimaryVault(null)
        setLegacyV2Vault(null)
      }

      // Track if we had network errors but no cached vault to fall back on
      // This helps the UI show a "couldn't check" message instead of "no vault"
      const noVaultFound = !v3Vault && !v2Vault && !v1Vault
      if (noVaultFound && hadNetworkError && !hadCachedVault) {
        setNetworkErrorNoCache(true)
        console.log('[useVaultDetection] Network error with no cache - showing retry message')
      }

      console.log('[useVaultDetection] Detection complete:', {
        v3Vault,
        v2Vault,
        v1Vault,
        primary: v3Vault || v2Vault || v1Vault,
        hadNetworkError,
        hadCachedVault,
      })
    } catch (err) {
      console.error('[useVaultDetection] Error during detection:', err)
      setError('Failed to detect vaults. Please refresh the page.')
      setNetworkErrorNoCache(true)
    }

    setIsLoading(false)
  }, [address, chainId])

  // Run detection on mount and when address/chain changes
  useEffect(() => {
    detectVaults()
  }, [detectVaults])

  return {
    primaryVault,
    legacyV2Vault,
    isLoading,
    error,
    networkErrorNoCache,
    refresh: detectVaults,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTING HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the appropriate portfolio route for a vault version
 */
export function getPortfolioRoute(version: VaultVersion, vaultAddress?: Address): string {
  switch (version) {
    case 'v3':
      return vaultAddress ? `/portfolio-v3?vault=${vaultAddress}` : '/portfolio-v3'
    case 'v2':
      return vaultAddress ? `/portfolio?vault=${vaultAddress}` : '/portfolio'
    case 'v1':
      return '/portfolio'
    default:
      return '/portfolio'
  }
}

/**
 * Get the appropriate setup route for creating a new vault
 */
export function getSetupRoute(chainId: number): string {
  const v3Factory = getV3FactoryAddress(chainId)

  // If V3 is available on this chain, use V3 setup
  if (v3Factory) {
    return '/setup-v3'
  }

  // Otherwise fall back to V2 (mainnet default)
  return '/setup-v2'
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEBUG HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as unknown as { vaultDetectionDebug: object }).vaultDetectionDebug = {
    getStoredV3Vaults,
    getStoredVaultsV2,
    getV1Vaults,
    clearV3Cache: (owner: Address) => {
      const key = `${V3_VAULTS_KEY}_${owner.toLowerCase()}`
      localStorage.removeItem(key)
      console.log('V3 cache cleared for', owner)
    },
  }
}
