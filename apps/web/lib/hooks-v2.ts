'use client'

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { formatUnits, type Address } from 'viem'
import { useCallback, useState, useEffect } from 'react'
import { ASSETS, ASSET_LIST, type AssetId } from './assets'
import { VAULT_V2_ABI } from './contracts-v2'

// Polling interval for live price updates (15 seconds)
const POLL_INTERVAL = 15_000

// Re-export ABI for convenience
export { VAULT_V2_ABI }

// Types for multi-asset vault state
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

export interface VaultStateV2 {
  assets: AssetHolding[]
  totalValueUsd: number
  portfolioDriftPct: number
  driftThresholdPct: number
  maxDriftAsset: AssetId | null
  needsRebalance: boolean
  lastRebalanceAt: Date | null
  isLoading: boolean
  refetch: () => Promise<void>
}

// Helper to find asset ID from token address
function findAssetId(tokenAddress: string): AssetId | null {
  const normalizedAddress = tokenAddress.toLowerCase()
  for (const id of ASSET_LIST) {
    if (ASSETS[id].tokenAddress.toLowerCase() === normalizedAddress) {
      return id
    }
  }
  return null
}

// Hook to read v2 vault state with live updates
export function useVaultStateV2(vaultAddress: Address | null): VaultStateV2 {
  const enabled = !!vaultAddress
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Read all vault data in parallel
  const { data: assetAddresses, refetch: refetchAssets, isLoading: assetsLoading } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V2_ABI,
    functionName: 'allAssets',
    query: { enabled },
  })

  const { data: holdingsData, refetch: refetchHoldings, isLoading: holdingsLoading } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V2_ABI,
    functionName: 'holdings',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: usdValuesData, refetch: refetchUsdValues, isLoading: usdValuesLoading } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V2_ABI,
    functionName: 'getUsdValues',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: targetWeightsData, refetch: refetchTargetWeights } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V2_ABI,
    functionName: 'allTargetWeights',
    query: { enabled },
  })

  const { data: currentWeightsData, refetch: refetchCurrentWeights } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V2_ABI,
    functionName: 'allCurrentWeights',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: driftData, refetch: refetchDrift } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V2_ABI,
    functionName: 'portfolioDriftBps',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: driftThresholdData } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V2_ABI,
    functionName: 'driftThresholdBps',
    query: { enabled },
  })

  const { data: needsRebalanceData, refetch: refetchNeedsRebalance } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V2_ABI,
    functionName: 'needsRebalance',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: lastRebalanceData } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_V2_ABI,
    functionName: 'lastRebalanceAt',
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
    ])
    setLastUpdated(new Date())
  }, [refetchAssets, refetchHoldings, refetchUsdValues, refetchTargetWeights, refetchCurrentWeights, refetchDrift, refetchNeedsRebalance])

  // Build assets array
  const assets: AssetHolding[] = []
  let totalValueUsd = 0
  let maxDriftAsset: AssetId | null = null
  let maxDriftValue = 0

  if (assetAddresses && holdingsData && usdValuesData && targetWeightsData && currentWeightsData) {
    for (let i = 0; i < assetAddresses.length; i++) {
      const assetId = findAssetId(assetAddresses[i])
      if (!assetId) continue

      const asset = ASSETS[assetId]
      const balance = holdingsData[i] ?? BigInt(0)
      const valueUsd = usdValuesData[i] ? Number(formatUnits(usdValuesData[i], 18)) : 0
      const targetWeightPct = targetWeightsData[i] ? Number(targetWeightsData[i]) / 100 : 0
      const currentWeightPct = currentWeightsData[i] ? Number(currentWeightsData[i]) / 100 : 0
      const driftPct = Math.abs(currentWeightPct - targetWeightPct)

      totalValueUsd += valueUsd

      if (driftPct > maxDriftValue) {
        maxDriftValue = driftPct
        maxDriftAsset = assetId
      }

      assets.push({
        assetId,
        symbol: asset.symbol,
        name: asset.name,
        color: asset.color,
        decimals: asset.decimals,
        balance,
        valueUsd,
        targetWeightPct,
        currentWeightPct,
        driftPct,
        isMaxDrift: false, // Will be set after loop
      })
    }

    // Mark the asset with max drift
    for (const asset of assets) {
      asset.isMaxDrift = asset.assetId === maxDriftAsset
    }
  }

  const portfolioDriftPct = driftData ? Number(driftData) / 100 : 0
  const driftThresholdPct = driftThresholdData ? Number(driftThresholdData) / 100 : 5
  const isLoading = assetsLoading || holdingsLoading || usdValuesLoading

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
  }
}

// Hook to trigger v2 rebalance
export function useRebalanceV2(vaultAddress: Address | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const rebalance = () => {
    if (!vaultAddress) return

    writeContract({
      address: vaultAddress,
      abi: VAULT_V2_ABI,
      functionName: 'rebalance',
    })
  }

  return {
    rebalance,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

// Hook to withdraw all from v2 vault
export function useWithdrawAllV2(vaultAddress: Address | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const withdrawAll = () => {
    if (!vaultAddress) return

    writeContract({
      address: vaultAddress,
      abi: VAULT_V2_ABI,
      functionName: 'withdrawAll',
    })
  }

  return {
    withdrawAll,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

// Hook to deposit to v2 vault
export function useDepositV2(vaultAddress: Address | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const deposit = (assetIndex: number, amount: bigint) => {
    if (!vaultAddress) return

    writeContract({
      address: vaultAddress,
      abi: VAULT_V2_ABI,
      functionName: 'deposit',
      args: [assetIndex, amount],
    })
  }

  return {
    deposit,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}
