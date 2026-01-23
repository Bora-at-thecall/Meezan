'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { type Address, formatUnits } from 'viem'
import { useVaultStateV2, useRebalanceV2, type AssetHolding } from '@/lib/hooks-v2'
import { useGasEstimate } from '@/lib/hooks'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { parseError } from '@/lib/errors'
import { formatDriftThreshold } from '@/lib/assets'

type RebalanceState = 'idle' | 'confirming' | 'pending' | 'success' | 'error'

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

  if (symbol === 'BTC') {
    if (value < 0.0001) return '<0.0001'
    return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 })
  } else if (symbol === 'USDC') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } else {
    if (value < 0.001) return '<0.001'
    return value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 4 })
  }
}

// Asset row with target/current/drift breakdown
function AssetRow({ asset, needsRebalance }: { asset: AssetHolding; needsRebalance: boolean }) {
  const isOverweight = asset.currentWeightPct > asset.targetWeightPct
  const isUnderweight = asset.currentWeightPct < asset.targetWeightPct
  const driftDirection = isOverweight ? '+' : isUnderweight ? '-' : ''

  return (
    <div className={`p-4 rounded-lg border ${asset.isMaxDrift && needsRebalance ? 'border-[var(--warning)] bg-[var(--warning)]/5' : 'border-[var(--border)]'}`}>
      {/* Asset header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: asset.color }}
          />
          <span className="font-medium">{asset.name}</span>
          <span className="text-sm text-[var(--muted)]">{asset.symbol}</span>
        </div>
        <div className="text-right">
          <p className="tabular-nums">{formatUsd(asset.valueUsd)}</p>
          <p className="text-sm text-[var(--muted)] tabular-nums">
            {formatBalance(asset.balance, asset.decimals, asset.symbol)} {asset.symbol}
          </p>
        </div>
      </div>

      {/* Weight breakdown */}
      <div className="flex gap-6 text-sm">
        <div>
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Target</p>
          <p className="tabular-nums">{asset.targetWeightPct.toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Current</p>
          <p className="tabular-nums">{asset.currentWeightPct.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Drift</p>
          <p className={`tabular-nums ${asset.isMaxDrift && needsRebalance ? 'text-[var(--warning)]' : ''}`}>
            {driftDirection}{asset.driftPct.toFixed(1)}%
            {asset.isMaxDrift && needsRebalance && (
              <span className="ml-1 text-xs">(max)</span>
            )}
          </p>
        </div>
      </div>

      {/* Visual weight bar */}
      <div className="mt-3 h-1.5 rounded-full bg-[var(--border)] overflow-hidden relative">
        {/* Target indicator */}
        <div
          className="absolute h-full w-0.5 bg-[var(--foreground)] opacity-30"
          style={{ left: `${asset.targetWeightPct}%` }}
        />
        {/* Current weight */}
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${asset.currentWeightPct}%`,
            backgroundColor: asset.color,
          }}
        />
      </div>
    </div>
  )
}

function DetailsContentV2() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null)
  const [rebalanceState, setRebalanceState] = useState<RebalanceState>('idle')
  const [rebalanceError, setRebalanceError] = useState<{ title: string; message: string } | null>(null)
  const [showRebalanceConfirm, setShowRebalanceConfirm] = useState(false)
  const [mounted, setMounted] = useState(false)

  const vaultState = useVaultStateV2(vaultAddress)
  const { rebalance, isPending, isConfirming, isSuccess, error: rawRebalanceError } = useRebalanceV2(vaultAddress)
  const { estimateUsd } = useGasEstimate()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !address) return

    const vaultParam = searchParams.get('vault')
    if (vaultParam) {
      setVaultAddress(vaultParam as Address)
    }
  }, [mounted, address, searchParams])

  useEffect(() => {
    if (mounted && !isConnected) {
      router.push('/')
    }
  }, [mounted, isConnected, router])

  useEffect(() => {
    if (isPending) setRebalanceState('confirming')
    else if (isConfirming) setRebalanceState('pending')
    else if (isSuccess) {
      setRebalanceState('success')
      setTimeout(() => vaultState.refetch(), 2000)
    }
  }, [isPending, isConfirming, isSuccess, vaultState])

  useEffect(() => {
    if (rawRebalanceError) {
      const parsed = parseError(rawRebalanceError)
      setRebalanceError({ title: parsed.title, message: parsed.message })
      setRebalanceState('error')
    }
  }, [rawRebalanceError])

  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => setRebalanceState('idle'), 3000)
    }
  }, [isSuccess])

  if (!mounted || !isConnected) return null

  const handleRebalanceClick = () => {
    setShowRebalanceConfirm(true)
  }

  const handleRebalanceConfirm = () => {
    setShowRebalanceConfirm(false)
    setRebalanceError(null)
    setRebalanceState('confirming')
    rebalance()
  }

  const dismissError = () => {
    setRebalanceError(null)
    setRebalanceState('idle')
  }

  const hasBalance = vaultState.totalValueUsd > 0

  // Build allocation name from target weights
  const allocationName = vaultState.assets
    .filter(a => a.targetWeightPct > 0)
    .map(a => `${a.targetWeightPct.toFixed(0)}% ${a.symbol}`)
    .join(' / ')

  // Transaction states - minimal
  if (rebalanceState === 'success') {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center">
        <p className="text-lg mb-2">Allocation restored</p>
        <p className="text-sm text-[var(--muted)]">Back to target weights</p>
      </div>
    )
  }

  if (rebalanceState === 'error' && rebalanceError) {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center">
        <p className="text-lg mb-2">{rebalanceError.title}</p>
        <p className="text-sm text-[var(--muted)] mb-8">{rebalanceError.message}</p>
        <button
          onClick={dismissError}
          className="text-[var(--primary)] text-sm"
        >
          Dismiss
        </button>
      </div>
    )
  }

  if (rebalanceState === 'confirming' || rebalanceState === 'pending') {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center">
        <p className="text-lg mb-2">
          {rebalanceState === 'confirming' ? 'Confirm in wallet' : 'Rebalancing'}
        </p>
        <p className="text-sm text-[var(--muted)]">
          {rebalanceState === 'confirming' ? 'Approve the transaction' : 'Executing swaps...'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[85vh]">
      {/* Back link */}
      <button
        onClick={() => router.push(`/portfolio-v2?vault=${vaultAddress}`)}
        className="text-[var(--muted)] text-sm mb-8 text-left hover:text-[var(--foreground)] transition-colors"
      >
        ← Portfolio
      </button>

      {/* Two-column layout on desktop: Holdings | Rules & Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 flex-1">
        {/* Left column: Holdings + Totals */}
        <div>
          {/* Total Value Header */}
          <div className="mb-6">
            <p className="text-xs text-[var(--muted)] uppercase tracking-[0.15em] mb-2">Total Value</p>
            <p className="text-3xl font-light tabular-nums">{vaultState.isLoading ? '—' : formatUsd(vaultState.totalValueUsd)}</p>
          </div>

          {/* Holdings */}
          <div className="flex items-center gap-4 mb-6">
            <span className="text-xs text-[var(--muted)] uppercase tracking-[0.2em]">Holdings</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <div className="space-y-4">
            {vaultState.assets.map((asset) => (
              <AssetRow
                key={asset.assetId}
                asset={asset}
                needsRebalance={vaultState.needsRebalance}
              />
            ))}
          </div>
        </div>

        {/* Right column: Rules & Status */}
        <div>
          {/* Drift Status Header */}
          <div className="mb-6">
            <p className="text-xs text-[var(--muted)] uppercase tracking-[0.15em] mb-2">Portfolio Drift</p>
            <p className={`text-3xl font-light tabular-nums ${vaultState.needsRebalance ? 'text-[var(--warning)]' : ''}`}>
              {vaultState.isLoading ? '—' : `${vaultState.portfolioDriftPct.toFixed(1)}%`}
            </p>
          </div>

          {/* Rules */}
          <div className="flex items-center gap-4 mb-6">
            <span className="text-xs text-[var(--muted)] uppercase tracking-[0.2em]">Rules</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <div className="space-y-4 mb-8">
            <div className="flex justify-between items-baseline">
              <span className="text-[var(--muted)]">Target allocation</span>
              <span className="text-sm">{allocationName || '—'}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[var(--muted)]">Drift threshold</span>
              <span className="tabular-nums">{formatDriftThreshold(vaultState.driftThresholdPct * 100)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[var(--muted)]">Max drift asset</span>
              <span className={vaultState.needsRebalance ? 'text-[var(--warning)]' : ''}>
                {vaultState.maxDriftAsset ?? '—'}
              </span>
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

          {hasBalance && (
            <div>
              {vaultState.needsRebalance ? (
                <button
                  onClick={handleRebalanceClick}
                  className="text-[var(--primary)] font-medium hover:opacity-80 transition-opacity"
                >
                  Rebalance now
                </button>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Portfolio is within tolerance
                </p>
              )}
            </div>
          )}

          {/* Vault info */}
          <div className="mt-8 pt-6 border-t border-[var(--border)]">
            {vaultState.lastRebalanceAt && (
              <p className="text-xs text-[var(--muted)] mb-2">
                Last rebalanced: {vaultState.lastRebalanceAt.toLocaleDateString()}
              </p>
            )}
            {vaultAddress && (
              <p className="text-xs text-[var(--muted)] opacity-40 tabular-nums tracking-wide">
                Vault: {vaultAddress.slice(0, 6)}...{vaultAddress.slice(-4)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Rebalance confirmation dialog */}
      <ConfirmDialog
        isOpen={showRebalanceConfirm}
        onClose={() => setShowRebalanceConfirm(false)}
        onConfirm={handleRebalanceConfirm}
        title="Rebalance portfolio"
        description="This will restore your allocation to target weights by swapping assets through USDC."
        details={[
          { label: 'Current max drift', value: `${vaultState.portfolioDriftPct.toFixed(1)}%` },
          { label: 'Max drift asset', value: vaultState.maxDriftAsset ?? '—' },
          { label: 'Assets to rebalance', value: `${vaultState.assets.filter(a => a.driftPct > 0.5).length}` },
          { label: 'Network fee', value: estimateUsd(300000) },
        ]}
        confirmText="Rebalance"
      />
    </div>
  )
}

export default function DetailsPageV2() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-[85vh] items-center justify-center">
        <span className="text-[var(--muted)]">—</span>
      </div>
    }>
      <DetailsContentV2 />
    </Suspense>
  )
}
