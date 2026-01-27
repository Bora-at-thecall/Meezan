'use client'

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { type Address, formatUnits } from 'viem'
import { useVaultState, useRebalance, useGasEstimate, useVaultActivity, useOracleHealth, useBtcPrice } from '@/lib/hooks'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ActivityLog } from '@/components/ActivityLog'
import { OracleStatus } from '@/components/OracleStatus'
import { SystemStatus } from '@/components/SystemStatus'
import { ProfileMenu } from '@/components/ProfileMenu'
import { AppFooter } from '@/components/AppFooter'
import { getUserVaults } from '@/lib/store'
import { parseError } from '@/lib/errors'

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

function formatBtc(satoshis: bigint): string {
  const btc = Number(formatUnits(satoshis, 8))
  if (btc === 0) return '0'
  if (btc < 0.0001) return '<0.0001'
  return btc.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 })
}

function DetailsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null)
  const [rebalanceState, setRebalanceState] = useState<RebalanceState>('idle')
  const [rebalanceError, setRebalanceError] = useState<{ title: string; message: string } | null>(null)
  const [showRebalanceConfirm, setShowRebalanceConfirm] = useState(false)
  const [mounted, setMounted] = useState(false)

  const { holdings, values, allocations, drift, driftThreshold, allocationName, isLoading, refetch } = useVaultState(vaultAddress)
  const { rebalance, isPending, isConfirming, isSuccess, error: rawRebalanceError } = useRebalance(vaultAddress)
  const { estimateUsd } = useGasEstimate()
  const { activities, isLoading: activitiesLoading } = useVaultActivity(vaultAddress)
  const { overall: oracleHealth, isLoading: oracleLoading } = useOracleHealth()
  const { price: btcPrice } = useBtcPrice()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !address) return

    const vaultParam = searchParams.get('vault')
    if (vaultParam) {
      setVaultAddress(vaultParam as Address)
      return
    }

    const userVaults = getUserVaults(address)
    if (userVaults.length > 0) {
      setVaultAddress(userVaults[0].address)
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
      setTimeout(() => refetch(), 2000)
    }
  }, [isPending, isConfirming, isSuccess, refetch])

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

  const canRebalance = drift >= driftThreshold
  const hasBalance = values.total > 0

  // Transaction states - minimal
  if (rebalanceState === 'success') {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center">
        <p className="text-lg mb-2">Allocation restored</p>
        <p className="text-sm text-[var(--muted)]">Back to {allocationName || 'target'}</p>
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
          {rebalanceState === 'confirming' ? 'Confirm in your wallet' : 'Adjusting allocation'}
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
            <p className="text-3xl font-light tabular-nums">{isLoading ? '—' : formatUsd(values.total)}</p>
          </div>

          {/* Holdings */}
          <div className="flex items-center gap-4 mb-6">
            <span className="text-xs text-[var(--muted)] uppercase tracking-[0.2em]">Holdings</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <div className="space-y-5">
            {/* Bitcoin */}
            <div className="flex justify-between items-baseline">
              <div>
                <span>Bitcoin</span>
                <span className="text-[var(--foreground-secondary)] text-sm ml-2 tabular-nums">
                  {isLoading ? '' : formatBtc(holdings.btc)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-lg tabular-nums">{isLoading ? '—' : formatUsd(values.btc)}</span>
                <span className="text-sm text-[var(--muted)] ml-3 tabular-nums">
                  {isLoading ? '' : `${allocations.current.btc.toFixed(1)}%`}
                  {hasBalance && !isLoading && (
                    <span className="opacity-50"> / {allocations.target.btc.toFixed(0)}%</span>
                  )}
                </span>
              </div>
            </div>

            {/* USDC */}
            <div className="flex justify-between items-baseline">
              <div>
                <span>USDC</span>
                <span className="text-[var(--foreground-secondary)] text-sm ml-2 tabular-nums">
                  {isLoading ? '' : Number(formatUnits(holdings.usdc, 6)).toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-lg tabular-nums">{isLoading ? '—' : formatUsd(values.usdc)}</span>
                <span className="text-sm text-[var(--muted)] ml-3 tabular-nums">
                  {isLoading ? '' : `${allocations.current.usdc.toFixed(1)}%`}
                  {hasBalance && !isLoading && (
                    <span className="opacity-50"> / {allocations.target.usdc.toFixed(0)}%</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Activity log */}
          {hasBalance && (
            <div className="mt-10">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs text-[var(--muted)] uppercase tracking-[0.2em]">Activity</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>
              <ActivityLog activities={activities} isLoading={activitiesLoading} showCausality={true} />
            </div>
          )}
        </div>

        {/* Right column: Rules & Status */}
        <div>
          {/* Drift Status Header */}
          <div className="mb-6">
            <p className="text-xs text-[var(--muted)] uppercase tracking-[0.15em] mb-2">Current Drift</p>
            <p className={`text-3xl font-light tabular-nums ${canRebalance ? 'text-[var(--warning)]' : ''}`}>
              {isLoading ? '—' : `${drift.toFixed(1)}%`}
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
              <span>{allocationName || '—'}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[var(--muted)]">Drift threshold</span>
              <span className="tabular-nums">{driftThreshold}%</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[var(--muted)]">Status</span>
              <span className={canRebalance ? 'text-[var(--warning)] font-medium' : 'text-[var(--muted)]'}>
                {canRebalance ? 'Adjustment available' : 'Within your targets'}
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
              {canRebalance ? (
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

          {/* Oracle and Vault info */}
          <div className="mt-8 pt-6 border-t border-[var(--border)] space-y-3">
            <OracleStatus health={oracleHealth} isLoading={oracleLoading} />
            {vaultAddress && (
              <a
                href={`https://basescan.org/address/${vaultAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--muted)] opacity-40 tabular-nums tracking-wide hover:opacity-70 transition-opacity"
              >
                Address: {vaultAddress.slice(0, 6)}...{vaultAddress.slice(-4)} ↗
              </a>
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
        description={`This will adjust your holdings to match ${allocationName || 'your targets'}.`}
        details={[
          { label: 'Current drift', value: `${drift.toFixed(1)}%` },
          { label: 'Processing fee', value: estimateUsd(200000) },
        ]}
        confirmText="Restore balance"
      />
    </div>
  )
}

export default function DetailsPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-[85vh] items-center justify-center">
        <span className="text-[var(--muted)]">—</span>
      </div>
    }>
      <DetailsContent />
    </Suspense>
  )
}
