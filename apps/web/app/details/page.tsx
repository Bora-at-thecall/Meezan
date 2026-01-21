'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { type Address, formatUnits } from 'viem'
import { useVaultState, useRebalance, useGasEstimate, useVaultActivity, useOracleHealth, useBtcPrice } from '@/lib/hooks'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ActivityLog } from '@/components/ActivityLog'
import { OracleStatus } from '@/components/OracleStatus'
import { SystemStatus } from '@/components/SystemStatus'
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
          {rebalanceState === 'confirming' ? 'Approve the transaction' : 'Adjusting allocation'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[85vh]">
      {/* Back link */}
      <button
        onClick={() => router.push('/portfolio')}
        className="text-[var(--muted)] text-sm mb-10 text-left hover:text-[var(--foreground)] transition-colors"
      >
        ← Portfolio
      </button>

      {/* Header - allocation and drift side by side */}
      <div className="flex justify-between items-start mb-10">
        <div>
          <p className="text-[10px] text-[var(--muted)] uppercase tracking-[0.15em] mb-2">Target</p>
          <p className="text-xl font-light">{allocationName || '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[var(--muted)] uppercase tracking-[0.15em] mb-2">Drift</p>
          <p className={`text-xl font-light tabular-nums ${drift < driftThreshold ? 'text-[var(--foreground)]' : 'text-[var(--warning)]'}`}>
            {isLoading ? '—' : `${drift.toFixed(1)}%`}
          </p>
        </div>
      </div>

      {/* Forward-looking signal - understated */}
      {!isLoading && hasBalance && (
        <div className="mb-10 text-center">
          {drift >= driftThreshold ? (
            <p className="text-sm text-[var(--warning)]">
              Rebalance available
            </p>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              {(driftThreshold - drift).toFixed(1)}% below {driftThreshold}% threshold
            </p>
          )}
        </div>
      )}

      {/* Holdings breakdown - balance sheet style */}
      <div className="flex-1">
        {/* Signature divider */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="text-[10px] text-[var(--muted)] uppercase tracking-[0.2em]">Holdings</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        <div className="space-y-5">
          {/* Bitcoin */}
          <div className="flex justify-between items-baseline">
            <div>
              <span>Bitcoin</span>
              <span className="text-sm text-[var(--muted)] ml-2 tabular-nums">
                {isLoading ? '' : formatBtc(holdings.btc)}
              </span>
            </div>
            <div className="text-right">
              <span className="tabular-nums">{isLoading ? '—' : formatUsd(values.btc)}</span>
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
              <span className="text-sm text-[var(--muted)] ml-2 tabular-nums">
                {isLoading ? '' : Number(formatUnits(holdings.usdc, 6)).toFixed(2)}
              </span>
            </div>
            <div className="text-right">
              <span className="tabular-nums">{isLoading ? '—' : formatUsd(values.usdc)}</span>
              <span className="text-sm text-[var(--muted)] ml-3 tabular-nums">
                {isLoading ? '' : `${allocations.current.usdc.toFixed(1)}%`}
                {hasBalance && !isLoading && (
                  <span className="opacity-50"> / {allocations.target.usdc.toFixed(0)}%</span>
                )}
              </span>
            </div>
          </div>

          {/* Total */}
          <div className="pt-4 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-between items-baseline">
              <span className="text-[var(--muted)]">Total</span>
              <span className="text-xl tabular-nums">{isLoading ? '—' : formatUsd(values.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Activity log with causality */}
      {hasBalance && (
        <div className="mt-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-[10px] text-[var(--muted)] uppercase tracking-[0.2em]">Activity</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
          <ActivityLog activities={activities} isLoading={activitiesLoading} showCausality={true} />
        </div>
      )}

      {/* Rebalance action - weighty */}
      {hasBalance && (
        <div className="py-8 mt-8">
          <div className="h-px bg-[var(--border)] mb-6" />
          {canRebalance ? (
            <div className="text-center">
              <button
                onClick={handleRebalanceClick}
                className="text-[var(--primary)] font-medium hover:opacity-80 transition-opacity"
              >
                Rebalance now
              </button>
              <p className="text-xs text-[var(--muted)] mt-3">
                Restores allocation to {allocationName || 'target'}
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-[var(--muted)]">
                No action needed
              </p>
              <p className="text-xs text-[var(--muted)] mt-2 opacity-60">
                Rebalance triggers at {driftThreshold}% drift
              </p>
            </div>
          )}
        </div>
      )}

      {/* System status - understated footer */}
      <div className="mt-auto pt-6 flex flex-col items-center gap-3">
        <OracleStatus health={oracleHealth} isLoading={oracleLoading} />
        {vaultAddress && (
          <p className="text-[10px] text-[var(--muted)] opacity-40 tabular-nums tracking-wide">
            {vaultAddress.slice(0, 6)}...{vaultAddress.slice(-4)}
          </p>
        )}
      </div>

      {/* Rebalance confirmation dialog */}
      <ConfirmDialog
        isOpen={showRebalanceConfirm}
        onClose={() => setShowRebalanceConfirm(false)}
        onConfirm={handleRebalanceConfirm}
        title="Rebalance portfolio"
        description={`This will restore your allocation to ${allocationName || 'target'} by swapping assets.`}
        details={[
          { label: 'Current drift', value: `${drift.toFixed(1)}%` },
          { label: 'Network fee', value: estimateUsd(200000) },
        ]}
        confirmText="Rebalance"
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
