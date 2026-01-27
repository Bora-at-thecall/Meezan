'use client'

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { type Address, formatUnits } from 'viem'
import { Button } from '@/components/Button'
import { ProfileMenu } from '@/components/ProfileMenu'
import { AppFooter } from '@/components/AppFooter'

// Base mainnet chain ID
const BASE_CHAIN_ID = 8453
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
  const chainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
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

  // Network check - block if not on Base
  if (chainId !== BASE_CHAIN_ID) {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center px-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-orange-500/20 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Wrong network</h2>
        <p className="text-[var(--muted)] mb-6 max-w-[300px]">
          Meezan runs on Base. Please switch networks to continue.
        </p>
        <Button
          size="large"
          onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}
          disabled={isSwitchingChain}
        >
          {isSwitchingChain ? 'Switching...' : 'Switch to Base'}
        </Button>
        <button
          onClick={() => router.push('/')}
          className="text-[var(--muted)] text-sm mt-6 hover:text-[var(--foreground)]"
        >
          Back to home
        </button>
      </div>
    )
  }

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
        <p className="text-[var(--foreground)] mb-2">Your funds are safe. Nothing was moved.</p>
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
          {rebalanceState === 'confirming' ? 'Confirm in wallet' : 'Restoring balance'}
        </p>
        <p className="text-sm text-[var(--muted)]">
          {rebalanceState === 'confirming' ? 'Confirm in your wallet' : 'Adjusting your allocation...'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[85vh]">
      {/* Header - Logo + Profile */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/portfolio"
            className="text-lg font-extralight tracking-tight text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
          >
            Meezan
          </Link>
          <span className="text-[var(--muted)] text-sm">/ Details</span>
        </div>
        <ProfileMenu />
      </header>

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
                {vaultState.needsRebalance ? 'Adjustment available' : 'Within your targets'}
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
                  Restore balance
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
                Last adjusted: {vaultState.lastRebalanceAt.toLocaleDateString()}
              </p>
            )}
            {vaultAddress && (
              <p className="text-xs text-[var(--muted)] opacity-40 tabular-nums tracking-wide">
                Address: {vaultAddress.slice(0, 6)}...{vaultAddress.slice(-4)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer - informational links */}
      <AppFooter />

      {/* Restore balance confirmation dialog */}
      <ConfirmDialog
        isOpen={showRebalanceConfirm}
        onClose={() => setShowRebalanceConfirm(false)}
        onConfirm={handleRebalanceConfirm}
        title="Restore your allocation"
        description="This will adjust your holdings to match your target weights."
        details={[
          { label: 'Current max drift', value: `${vaultState.portfolioDriftPct.toFixed(1)}%` },
          { label: 'Max drift asset', value: vaultState.maxDriftAsset ?? '—' },
          { label: 'Assets to adjust', value: `${vaultState.assets.filter(a => a.driftPct > 0.5).length}` },
          { label: 'Processing fee', value: estimateUsd(300000) },
        ]}
        confirmText="Restore balance"
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
