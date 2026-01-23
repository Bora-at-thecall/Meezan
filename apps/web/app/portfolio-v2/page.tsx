'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { type Address, formatUnits } from 'viem'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useVaultStateV2, useWithdrawAllV2, type AssetHolding } from '@/lib/hooks-v2'
import { getLatestVaultV2, removeVaultV2 } from '@/lib/contracts-v2'
import { useGasEstimate } from '@/lib/hooks'
import { parseError } from '@/lib/errors'

type WithdrawState = 'idle' | 'confirming' | 'pending' | 'success' | 'error'

function formatUsd(value: number): string {
  if (value === 0) return '$0'
  if (value < 0.01) return '<$0.01'
  if (value >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatBalance(balance: bigint, decimals: number, symbol: string): string {
  const value = Number(formatUnits(balance, decimals))
  if (value === 0) return '0'

  // Different precision for different assets
  if (symbol === 'BTC') {
    if (value < 0.0001) return '<0.0001'
    return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
  } else if (symbol === 'USDC') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } else {
    // ETH and other tokens
    if (value < 0.001) return '<0.001'
    return value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 4 })
  }
}

// Visual allocation bar showing all assets
function AllocationBar({ assets }: { assets: AssetHolding[] }) {
  if (assets.length === 0) return null

  return (
    <div className="w-full h-3 rounded-full overflow-hidden flex">
      {assets.map((asset, index) => (
        <div
          key={asset.assetId}
          className="h-full transition-all duration-300"
          style={{
            width: `${asset.currentWeightPct}%`,
            backgroundColor: asset.color,
            opacity: asset.currentWeightPct > 0 ? 1 : 0,
          }}
          title={`${asset.symbol}: ${asset.currentWeightPct.toFixed(1)}%`}
        />
      ))}
    </div>
  )
}

// System status for multi-asset vault
function SystemStatusV2({
  driftPct,
  thresholdPct,
  maxDriftAsset,
  needsRebalance,
  isLoading,
}: {
  driftPct: number
  thresholdPct: number
  maxDriftAsset: string | null
  needsRebalance: boolean
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <p className="text-[var(--muted)] text-sm">Loading...</p>
    )
  }

  const statusText = needsRebalance
    ? `Rebalance available`
    : `No action needed`

  const statusColor = needsRebalance ? 'var(--warning)' : 'var(--muted)'

  return (
    <p className={needsRebalance ? "text-base font-medium" : "text-sm"} style={{ color: statusColor }}>
      Max drift: {driftPct.toFixed(1)}%
      {maxDriftAsset && ` (${maxDriftAsset})`}
      <span className="mx-2 opacity-50">·</span>
      Threshold: {thresholdPct.toFixed(0)}%
      <span className="mx-2 opacity-50">·</span>
      {statusText}
    </p>
  )
}

function PortfolioContentV2() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null)
  const [withdrawState, setWithdrawState] = useState<WithdrawState>('idle')
  const [withdrawError, setWithdrawError] = useState<{ title: string; message: string } | null>(null)
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false)
  const [mounted, setMounted] = useState(false)

  const vaultState = useVaultStateV2(vaultAddress)
  const { withdrawAll, isPending, isConfirming, isSuccess, error: rawWithdrawError, hash } = useWithdrawAllV2(vaultAddress)
  const { estimateUsd } = useGasEstimate()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !address) return

    // First check URL params
    const vaultParam = searchParams.get('vault')
    if (vaultParam) {
      setVaultAddress(vaultParam as Address)
      return
    }

    // Then check localStorage for existing vault
    const storedVault = getLatestVaultV2(address)
    if (storedVault) {
      setVaultAddress(storedVault)
    }
  }, [mounted, address, searchParams])

  useEffect(() => {
    if (mounted && !isConnected) {
      router.push('/')
    }
  }, [mounted, isConnected, router])

  // Track withdraw transaction state - use hash to know when tx is submitted
  useEffect(() => {
    if (isPending) {
      setWithdrawState('confirming')
    } else if (hash && isConfirming) {
      setWithdrawState('pending')
    } else if (hash && isSuccess) {
      setWithdrawState('success')
    }
  }, [isPending, isConfirming, isSuccess, hash])

  // Refetch vault state after successful withdrawal
  useEffect(() => {
    if (isSuccess) {
      const timeout = setTimeout(() => {
        vaultState.refetch()
      }, 2000)
      return () => clearTimeout(timeout)
    }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rawWithdrawError) {
      const parsed = parseError(rawWithdrawError)
      setWithdrawError({ title: parsed.title, message: parsed.message })
      setWithdrawState('error')
    }
  }, [rawWithdrawError])

  // Handle successful withdrawal - remove vault from localStorage and redirect
  useEffect(() => {
    if (isSuccess && vaultAddress && address) {
      // Remove the vault from localStorage since it's now empty
      removeVaultV2(address, vaultAddress)

      // Redirect to home after showing success message
      const timeout = setTimeout(() => {
        router.push('/')
      }, 2500)
      return () => clearTimeout(timeout)
    }
  }, [isSuccess, vaultAddress, address, router])

  if (!mounted || !isConnected) return null

  const handleWithdrawClick = () => {
    setShowWithdrawConfirm(true)
  }

  const handleWithdrawConfirm = () => {
    setShowWithdrawConfirm(false)
    setWithdrawError(null)
    setWithdrawState('confirming')
    withdrawAll()
  }

  const dismissError = () => {
    setWithdrawError(null)
    setWithdrawState('idle')
  }

  // No vault state - welcoming empty state
  if (!vaultAddress && address) {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center px-4">
        <p className="text-2xl font-light mb-3">Get started</p>
        <p className="text-[var(--muted)] mb-8 max-w-[300px]">
          Create a vault to manage your portfolio with automatic rebalancing.
        </p>
        <Link href="/setup-v2">
          <Button size="large">Create portfolio</Button>
        </Link>
      </div>
    )
  }

  // Transaction states
  if (withdrawState === 'success') {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-xl font-semibold mb-2">Withdrawal complete</p>
        <p className="text-[var(--muted)] mb-2">Funds have been sent to your wallet</p>
        <p className="text-sm text-[var(--muted)] opacity-60">Redirecting to home...</p>
      </div>
    )
  }

  if (withdrawState === 'error' && withdrawError) {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center">
        <p className="text-lg mb-2">{withdrawError.title}</p>
        <p className="text-sm text-[var(--muted)] mb-8">{withdrawError.message}</p>
        <button onClick={dismissError} className="text-[var(--primary)] text-sm">
          Dismiss
        </button>
      </div>
    )
  }

  if (withdrawState === 'confirming' || withdrawState === 'pending') {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center">
        <p className="text-lg mb-2">
          {withdrawState === 'confirming' ? 'Confirm in wallet' : 'Processing'}
        </p>
        <p className="text-sm text-[var(--muted)]">
          {withdrawState === 'confirming' ? 'Approve the transaction' : 'This may take a moment'}
        </p>
      </div>
    )
  }

  const hasBalance = vaultState.totalValueUsd > 0

  return (
    <div className="flex flex-col min-h-[85vh]">
      {/* Hero section - Balance */}
      <div className="py-8 md:py-12">
        <p className="text-[64px] md:text-[80px] font-extralight tracking-tight tabular-nums text-center">
          {vaultState.isLoading ? (
            <span className="opacity-10">—</span>
          ) : (
            formatUsd(vaultState.totalValueUsd)
          )}
        </p>

        {/* Allocation bar */}
        {hasBalance && !vaultState.isLoading && (
          <div className="w-full max-w-2xl mx-auto mt-8">
            <AllocationBar assets={vaultState.assets} />
          </div>
        )}
      </div>

      {/* Two-column layout on desktop: Holdings | Status & Actions */}
      {hasBalance && !vaultState.isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 py-10">
          {/* Left column: Holdings */}
          <div>
            <div className="flex items-center gap-4 mb-6">
              <span className="text-xs text-[var(--muted)] uppercase tracking-[0.2em]">Holdings</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <div className="space-y-5">
              {vaultState.assets.map((asset) => (
                <div key={asset.assetId} className="flex justify-between items-baseline">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: asset.color }}
                    />
                    <span className={asset.isMaxDrift && vaultState.needsRebalance ? 'text-[var(--warning)]' : ''}>
                      {asset.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg tabular-nums">{formatUsd(asset.valueUsd)}</span>
                    <span className="text-[var(--foreground-secondary)] text-sm ml-3 tabular-nums">
                      {formatBalance(asset.balance, asset.decimals, asset.symbol)}
                    </span>
                  </div>
                </div>
              ))}

              {/* Total row */}
              <div className="pt-4 mt-2 border-t border-[var(--border)]">
                <div className="flex justify-between items-baseline">
                  <span className="text-[var(--muted)]">Total</span>
                  <span className="text-xl tabular-nums font-medium">{formatUsd(vaultState.totalValueUsd)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right column: Status & Actions */}
          <div>
            <div className="flex items-center gap-4 mb-6">
              <span className="text-xs text-[var(--muted)] uppercase tracking-[0.2em]">Status</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            {/* Drift status */}
            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-baseline">
                <span className="text-[var(--muted)]">Max drift</span>
                <span className={`text-lg tabular-nums ${vaultState.needsRebalance ? 'text-[var(--warning)] font-medium' : ''}`}>
                  {vaultState.portfolioDriftPct.toFixed(1)}%
                  {vaultState.maxDriftAsset && <span className="text-sm ml-1">({vaultState.maxDriftAsset})</span>}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[var(--muted)]">Threshold</span>
                <span className="tabular-nums">{vaultState.driftThresholdPct.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[var(--muted)]">Status</span>
                <span className={vaultState.needsRebalance ? 'text-[var(--warning)] font-medium' : 'text-[var(--muted)]'}>
                  {vaultState.needsRebalance ? 'Rebalance available' : 'No action needed'}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4 mb-6">
              <span className="text-xs text-[var(--muted)] uppercase tracking-[0.2em]">Actions</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            {/* Primary action when rebalance available */}
            {vaultState.needsRebalance && (
              <div className="mb-6">
                <Link href={`/details-v2?vault=${vaultAddress}`}>
                  <Button size="default" className="w-full md:w-auto">
                    Review rebalance
                  </Button>
                </Link>
              </div>
            )}

            <div className="flex flex-wrap gap-4">
              <Link href="/setup-v2" className="text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors">
                Deposit
              </Link>
              <button onClick={handleWithdrawClick} className="text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors">
                Withdraw
              </button>
              <Link href={`/details-v2?vault=${vaultAddress}`} className="text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors">
                Details
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Empty state actions */}
      {(!hasBalance || vaultState.isLoading) && (
        <div className="py-8 mt-auto">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
          <div className="flex justify-center gap-10 text-sm">
            <Link href="/setup-v2" className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors">
              Deposit
            </Link>
          </div>
        </div>
      )}

      {/* Withdraw confirmation dialog */}
      <ConfirmDialog
        isOpen={showWithdrawConfirm}
        onClose={() => setShowWithdrawConfirm(false)}
        onConfirm={handleWithdrawConfirm}
        title="Withdraw all funds"
        description="You will receive all assets directly in your wallet (BTC, ETH, USDC). To convert to USDC only, swap on Uniswap after withdrawal."
        details={[
          { label: 'Total value', value: formatUsd(vaultState.totalValueUsd) },
          { label: 'You receive', value: vaultState.assets.map(a => a.symbol).join(' + ') },
          { label: 'Network fee', value: estimateUsd(200000) },
        ]}
        confirmText="Withdraw"
      />
    </div>
  )
}

export default function PortfolioPageV2() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-[85vh] items-center justify-center">
        <span className="text-[var(--muted)] opacity-20">—</span>
      </div>
    }>
      <PortfolioContentV2 />
    </Suspense>
  )
}
