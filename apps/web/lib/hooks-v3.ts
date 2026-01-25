'use client'

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits, type Address } from 'viem'
import { useCallback, useState, useEffect } from 'react'
import { ASSETS, ASSET_LIST, type AssetId } from './assets'
import { VAULT_V3_ABI, type ConversionAssetOrder, calculateMinAmountsOut } from './contracts-v3'

// Polling interval for live price updates (15 seconds)
const POLL_INTERVAL = 15_000

// Re-export ABI for convenience
export { VAULT_V3_ABI }

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

// Same as V2 but re-exported for V3 context
export interface AssetHolding {
  assetId: AssetId
  symbol: string
  name: string
  color: string
  decimals: number
  balance: bigint
  valueUsd: number
  targetWeightPct: number
  currentWeightPct: number
  driftPct: number
  isMaxDrift: boolean
}

/**
 * V3 vault state extends V2 with conversion status
 */
export interface VaultStateV3 {
  // V2 fields
  assets: AssetHolding[]
  totalValueUsd: number
  portfolioDriftPct: number
  driftThresholdPct: number
  maxDriftAsset: AssetId | null
  needsRebalance: boolean
  lastRebalanceAt: Date | null
  isLoading: boolean
  refetch: () => Promise<void>

  // V3 conversion fields
  conversionExecutor: Address | null
  conversionRequested: boolean
  backgroundConversionDisabled: boolean

  // Computed V3 fields
  canConvertInstantly: boolean
  canRequestBackground: boolean
  hasNonStablecoinAssets: boolean
}

/**
 * Conversion asset info for UI display
 */
export interface ConversionAssetInfo {
  assetId: AssetId
  tokenAddress: Address
  assetIndex: number
  balance: bigint
  valueUsd: number
  estimatedMinUsdc: bigint
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

// Sepolia testnet mock token addresses (for display purposes)
const SEPOLIA_MOCK_TOKENS: Record<string, { assetId: AssetId; name: string; symbol: string }> = {
  '0x11c66cc0d5b9efb983541aa4da35baf2fdaccda2': { assetId: 'BTC', name: 'Mock Bitcoin', symbol: 'mWBTC' },
  '0x4200000000000000000000000000000000000006': { assetId: 'ETH', name: 'Wrapped Ether', symbol: 'WETH' },
  '0x036cbd53842c5426634e7929541ec2318f3dcf7e': { assetId: 'USDC', name: 'USD Coin', symbol: 'USDC' },
}

// Helper to find asset ID from token address (supports both mainnet and Sepolia)
function findAssetId(tokenAddress: string): AssetId | null {
  const normalizedAddress = tokenAddress.toLowerCase()

  // Check mainnet addresses first
  for (const id of ASSET_LIST) {
    if (ASSETS[id].tokenAddress.toLowerCase() === normalizedAddress) {
      return id
    }
  }

  // Check Sepolia mock tokens
  const mockToken = SEPOLIA_MOCK_TOKENS[normalizedAddress]
  if (mockToken) {
    return mockToken.assetId
  }

  return null
}

// Helper to get display info for a token (works with mocks)
function getTokenDisplayInfo(tokenAddress: string): { name: string; symbol: string; color: string } | null {
  const normalizedAddress = tokenAddress.toLowerCase()

  // Check mainnet addresses
  for (const id of ASSET_LIST) {
    if (ASSETS[id].tokenAddress.toLowerCase() === normalizedAddress) {
      return { name: ASSETS[id].name, symbol: ASSETS[id].symbol, color: ASSETS[id].color }
    }
  }

  // Check Sepolia mock tokens
  const mockToken = SEPOLIA_MOCK_TOKENS[normalizedAddress]
  if (mockToken) {
    const baseAsset = ASSETS[mockToken.assetId]
    return { name: mockToken.name, symbol: mockToken.symbol, color: baseAsset.color }
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// VAULT STATE HOOK (V3)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to read V3 vault state with live updates
 * Extends V2 state with conversion-specific fields
 */
export function useVaultStateV3(vaultAddress: Address | null): VaultStateV3 {
  const enabled = !!vaultAddress
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // ─────────────────────────────────────────────────────────────────────────────
  // Read all vault data in parallel (same as V2)
  // ─────────────────────────────────────────────────────────────────────────────

  const { data: assetAddresses, refetch: refetchAssets, isLoading: assetsLoading } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'allAssets',
    query: { enabled },
  })

  const { data: holdingsData, refetch: refetchHoldings, isLoading: holdingsLoading } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'holdings',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: usdValuesData, refetch: refetchUsdValues, isLoading: usdValuesLoading } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'getUsdValues',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: targetWeightsData, refetch: refetchTargetWeights } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'allTargetWeights',
    query: { enabled },
  })

  const { data: currentWeightsData, refetch: refetchCurrentWeights } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'allCurrentWeights',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: driftData, refetch: refetchDrift } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'portfolioDriftBps',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: driftThresholdData } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'driftThresholdBps',
    query: { enabled },
  })

  const { data: needsRebalanceData, refetch: refetchNeedsRebalance } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'needsRebalance',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: lastRebalanceData } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'lastRebalanceAt',
    query: { enabled },
  })

  const { data: stablecoinIndexData } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'stablecoinIndex',
    query: { enabled },
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // V3-specific state reads
  // ─────────────────────────────────────────────────────────────────────────────

  const { data: conversionExecutorData, refetch: refetchExecutor } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'conversionExecutor',
    query: { enabled },
  })

  const { data: conversionRequestedData, refetch: refetchConversionRequested } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'conversionRequested',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: backgroundDisabledData, refetch: refetchBackgroundDisabled } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'backgroundConversionDisabled',
    query: { enabled },
  })

  // Update lastUpdated when data changes
  useEffect(() => {
    if (usdValuesData) {
      setLastUpdated(new Date())
    }
  }, [usdValuesData])

  // Unified refetch function
  const refetch = useCallback(async () => {
    await Promise.all([
      refetchAssets(),
      refetchHoldings(),
      refetchUsdValues(),
      refetchTargetWeights(),
      refetchCurrentWeights(),
      refetchDrift(),
      refetchNeedsRebalance(),
      refetchExecutor(),
      refetchConversionRequested(),
      refetchBackgroundDisabled(),
    ])
    setLastUpdated(new Date())
  }, [
    refetchAssets, refetchHoldings, refetchUsdValues, refetchTargetWeights,
    refetchCurrentWeights, refetchDrift, refetchNeedsRebalance,
    refetchExecutor, refetchConversionRequested, refetchBackgroundDisabled
  ])

  // ─────────────────────────────────────────────────────────────────────────────
  // Build assets array
  // ─────────────────────────────────────────────────────────────────────────────

  const assets: AssetHolding[] = []
  let totalValueUsd = 0
  let maxDriftAsset: AssetId | null = null
  let maxDriftValue = 0
  let hasNonStablecoinAssets = false
  const stablecoinIndex = stablecoinIndexData !== undefined ? Number(stablecoinIndexData) : -1

  if (assetAddresses && holdingsData && usdValuesData && targetWeightsData && currentWeightsData) {
    for (let i = 0; i < assetAddresses.length; i++) {
      const tokenAddress = assetAddresses[i]
      const assetId = findAssetId(tokenAddress)
      if (!assetId) continue

      // Get display info (handles both mainnet and Sepolia mock tokens)
      const displayInfo = getTokenDisplayInfo(tokenAddress)
      const baseAsset = ASSETS[assetId]
      const balance = holdingsData[i] ?? BigInt(0)
      const valueUsd = usdValuesData[i] ? Number(formatUnits(usdValuesData[i], 18)) : 0
      const targetWeightPct = targetWeightsData[i] ? Number(targetWeightsData[i]) / 100 : 0
      const currentWeightPct = currentWeightsData[i] ? Number(currentWeightsData[i]) / 100 : 0
      const driftPct = Math.abs(currentWeightPct - targetWeightPct)

      totalValueUsd += valueUsd

      // Check for non-stablecoin assets with balance
      if (i !== stablecoinIndex && balance > BigInt(0)) {
        hasNonStablecoinAssets = true
      }

      if (driftPct > maxDriftValue) {
        maxDriftValue = driftPct
        maxDriftAsset = assetId
      }

      assets.push({
        assetId,
        symbol: displayInfo?.symbol ?? baseAsset.symbol,
        name: displayInfo?.name ?? baseAsset.name,
        color: displayInfo?.color ?? baseAsset.color,
        decimals: baseAsset.decimals,
        balance,
        valueUsd,
        targetWeightPct,
        currentWeightPct,
        driftPct,
        isMaxDrift: false,
      })
    }

    // Mark the asset with max drift
    for (const asset of assets) {
      asset.isMaxDrift = asset.assetId === maxDriftAsset
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Compute derived state
  // ─────────────────────────────────────────────────────────────────────────────

  const portfolioDriftPct = driftData ? Number(driftData) / 100 : 0
  const driftThresholdPct = driftThresholdData ? Number(driftThresholdData) / 100 : 5
  const isLoading = assetsLoading || holdingsLoading || usdValuesLoading

  const conversionExecutor = conversionExecutorData as Address | null ?? null
  const conversionRequested = conversionRequestedData ?? false
  const backgroundConversionDisabled = backgroundDisabledData ?? false

  // Can convert instantly if:
  // - Has non-stablecoin assets to convert
  // - No conversion currently pending (must cancel first)
  const canConvertInstantly = hasNonStablecoinAssets && !conversionRequested

  // Can request background if:
  // - Has executor configured
  // - Background not disabled
  // - No conversion already pending
  // - Has non-stablecoin assets
  const canRequestBackground =
    conversionExecutor !== null &&
    conversionExecutor !== '0x0000000000000000000000000000000000000000' &&
    !backgroundConversionDisabled &&
    !conversionRequested &&
    hasNonStablecoinAssets

  return {
    assets,
    totalValueUsd,
    portfolioDriftPct,
    driftThresholdPct,
    maxDriftAsset,
    needsRebalance: needsRebalanceData ?? false,
    lastRebalanceAt: lastRebalanceData ? new Date(Number(lastRebalanceData) * 1000) : null,
    isLoading,
    refetch,

    // V3 fields
    conversionExecutor,
    conversionRequested,
    backgroundConversionDisabled,
    canConvertInstantly,
    canRequestBackground,
    hasNonStablecoinAssets,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSION ASSET ORDER HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to get conversion asset order for building minAmountsOut
 */
export function useConversionAssetOrder(vaultAddress: Address | null): {
  assetOrder: ConversionAssetOrder | null
  isLoading: boolean
  refetch: () => void
} {
  const enabled = !!vaultAddress

  const { data, isLoading, refetch } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V3_ABI,
    functionName: 'getConversionAssetOrder',
    query: { enabled },
  })

  const assetOrder: ConversionAssetOrder | null = data
    ? {
        tokens: data[0] as Address[],
        indices: (data[1] as readonly number[]).map(n => Number(n)),
      }
    : null

  return {
    assetOrder,
    isLoading,
    refetch,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WITHDRAW ALL HOOK (V3)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to withdraw all from V3 vault (direct transfer, no conversion)
 * This is the "escape hatch" that always succeeds
 */
export function useWithdrawAllV3(vaultAddress: Address | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const withdrawAll = useCallback(() => {
    if (!vaultAddress) return

    writeContract({
      address: vaultAddress,
      abi: VAULT_V3_ABI,
      functionName: 'withdrawAll',
    })
  }, [vaultAddress, writeContract])

  return {
    withdrawAll,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERT AND WITHDRAW HOOK (V3 - Path B: Instant Atomic)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for instant atomic conversion + withdrawal (Path B)
 * Converts all non-stablecoin assets to USDC, then withdraws everything
 */
export function useConvertAndWithdraw(vaultAddress: Address | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  /**
   * Execute instant conversion and withdrawal
   * @param minAmountsOut Minimum USDC amounts for each non-stablecoin swap
   *                      Order must match getConversionAssetOrder()
   */
  const convertAndWithdraw = useCallback((minAmountsOut: bigint[]) => {
    if (!vaultAddress) return

    writeContract({
      address: vaultAddress,
      abi: VAULT_V3_ABI,
      functionName: 'convertAndWithdraw',
      args: [minAmountsOut],
    })
  }, [vaultAddress, writeContract])

  return {
    convertAndWithdraw,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BACKGROUND CONVERSION HOOKS (V3 - Path C)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to request background conversion (Path C Step 1)
 */
export function useRequestConversion(vaultAddress: Address | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const requestConversion = useCallback(() => {
    if (!vaultAddress) return

    writeContract({
      address: vaultAddress,
      abi: VAULT_V3_ABI,
      functionName: 'requestConversion',
    })
  }, [vaultAddress, writeContract])

  return {
    requestConversion,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

/**
 * Hook to cancel pending conversion
 */
export function useCancelConversion(vaultAddress: Address | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const cancelConversion = useCallback(() => {
    if (!vaultAddress) return

    writeContract({
      address: vaultAddress,
      abi: VAULT_V3_ABI,
      functionName: 'cancelConversion',
    })
  }, [vaultAddress, writeContract])

  return {
    cancelConversion,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REBALANCE HOOK (V3)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to trigger V3 rebalance
 */
export function useRebalanceV3(vaultAddress: Address | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const rebalance = useCallback(() => {
    if (!vaultAddress) return

    writeContract({
      address: vaultAddress,
      abi: VAULT_V3_ABI,
      functionName: 'rebalance',
    })
  }, [vaultAddress, writeContract])

  return {
    rebalance,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEPOSIT HOOK (V3)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to deposit to V3 vault
 */
export function useDepositV3(vaultAddress: Address | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const deposit = useCallback((assetIndex: number, amount: bigint) => {
    if (!vaultAddress) return

    writeContract({
      address: vaultAddress,
      abi: VAULT_V3_ABI,
      functionName: 'deposit',
      args: [assetIndex, amount],
    })
  }, [vaultAddress, writeContract])

  return {
    deposit,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to build conversion info for UI display
 * Returns info about each asset that will be converted, with estimated min USDC
 */
export function useConversionInfo(
  vaultAddress: Address | null,
  slippageBps: number = 100
): {
  conversionAssets: ConversionAssetInfo[]
  totalEstimatedUsdc: bigint
  isLoading: boolean
} {
  const { assetOrder, isLoading: orderLoading } = useConversionAssetOrder(vaultAddress)
  const vaultState = useVaultStateV3(vaultAddress)

  const conversionAssets: ConversionAssetInfo[] = []
  let totalEstimatedUsdc = BigInt(0)

  if (assetOrder && vaultState.assets.length > 0) {
    // Get USD values for non-stablecoin assets
    const usdValues: bigint[] = []

    for (let i = 0; i < assetOrder.indices.length; i++) {
      const assetIndex = assetOrder.indices[i]
      const tokenAddress = assetOrder.tokens[i]

      // Find matching asset in vault state
      const assetId = findAssetId(tokenAddress)
      const assetHolding = vaultState.assets.find(a => a.assetId === assetId)

      if (assetHolding) {
        // Convert USD value to 18 decimals for calculation
        const valueUsd18 = BigInt(Math.floor(assetHolding.valueUsd * 1e18))
        usdValues.push(valueUsd18)
      } else {
        usdValues.push(BigInt(0))
      }
    }

    // Calculate min amounts with slippage
    const minAmounts = calculateMinAmountsOut(usdValues, slippageBps)

    // Build conversion asset info
    for (let i = 0; i < assetOrder.indices.length; i++) {
      const assetIndex = assetOrder.indices[i]
      const tokenAddress = assetOrder.tokens[i]
      const assetId = findAssetId(tokenAddress)
      const assetHolding = vaultState.assets.find(a => a.assetId === assetId)

      if (assetId && assetHolding && assetHolding.balance > BigInt(0)) {
        conversionAssets.push({
          assetId,
          tokenAddress,
          assetIndex,
          balance: assetHolding.balance,
          valueUsd: assetHolding.valueUsd,
          estimatedMinUsdc: minAmounts[i],
        })

        totalEstimatedUsdc += minAmounts[i]
      }
    }
  }

  return {
    conversionAssets,
    totalEstimatedUsdc,
    isLoading: orderLoading || vaultState.isLoading,
  }
}
