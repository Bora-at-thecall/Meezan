'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { type Address, formatUnits } from 'viem'
import { useVaultState, useRebalance } from '@/lib/hooks'
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
  const [mounted, setMounted] = useState(false)

  const { holdings, values, allocations, drift, allocation, isLoading, refetch } = useVaultState(vaultAddress)
  const { rebalance, isPending, isConfirming, isSuccess, error: rawRebalanceError } = useRebalance(vaultAddress)

  const DRIFT_THRESHOLD = 5

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

  const handleRebalance = () => {
    setRebalanceError(null)
    setRebalanceState('confirming')
    rebalance()
  }

  const dismissError = () => {
    setRebalanceError(null)
    setRebalanceState('idle')
  }

  const canRebalance = drift >= DRIFT_THRESHOLD
  const hasBalance = values.total > 0

  // Transaction states - minimal
  if (rebalanceState === 'success') {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center">
        <p className="text-lg mb-2">Allocation restored</p>
        <p className="text-sm text-[var(--muted)]">Back to {allocation?.name || 'target'}</p>
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
        className="text-[var(--muted)] text-sm mb-12 text-left hover:text-[var(--foreground)]"
      >
        Back
      </button>

      {/* Allocation state */}
      <div className="mb-12">
        <p className="text-sm text-[var(--muted)] mb-1">Target allocation</p>
        <p className="text-2xl font-light">{allocation?.name || '—'}</p>
      </div>

      {/* Drift - the key metric */}
      <div className="mb-12">
        <p className="text-sm text-[var(--muted)] mb-1">Current drift</p>
        <p className={`text-2xl font-light ${drift < DRIFT_THRESHOLD ? 'text-[var(--foreground)]' : 'text-[var(--warning)]'}`}>
          {isLoading ? '—' : `${drift.toFixed(1)}%`}
        </p>
        {!isLoading && drift < DRIFT_THRESHOLD && (
          <p className="text-sm text-[var(--muted)] mt-2">Within tolerance</p>
        )}
      </div>

      {/* Holdings breakdown - balance sheet style */}
      <div className="flex-1">
        <p className="text-sm text-[var(--muted)] mb-4">Holdings</p>

        <div className="space-y-6">
          {/* Bitcoin */}
          <div className="border-b border-[var(--border)] pb-4">
            <div className="flex justify-between items-baseline mb-2">
              <span>Bitcoin</span>
              <span className="tabular-nums">{isLoading ? '—' : formatUsd(values.btc)}</span>
            </div>
            <div className="flex justify-between text-sm text-[var(--muted)]">
              <span>{isLoading ? '—' : formatBtc(holdings.btc)} BTC</span>
              <span>
                {isLoading ? '—' : `${allocations.current.btc.toFixed(1)}%`}
                {hasBalance && !isLoading && (
                  <span className="opacity-50"> / {allocations.target.btc.toFixed(0)}%</span>
                )}
              </span>
            </div>
          </div>

          {/* USDC */}
          <div className="border-b border-[var(--border)] pb-4">
            <div className="flex justify-between items-baseline mb-2">
              <span>USDC</span>
              <span className="tabular-nums">{isLoading ? '—' : formatUsd(values.usdc)}</span>
            </div>
            <div className="flex justify-between text-sm text-[var(--muted)]">
              <span>{isLoading ? '—' : `${Number(formatUnits(holdings.usdc, 6)).toFixed(2)}`} USDC</span>
              <span>
                {isLoading ? '—' : `${allocations.current.usdc.toFixed(1)}%`}
                {hasBalance && !isLoading && (
                  <span className="opacity-50"> / {allocations.target.usdc.toFixed(0)}%</span>
                )}
              </span>
            </div>
          </div>

          {/* Total */}
          <div className="flex justify-between items-baseline">
            <span className="text-[var(--muted)]">Total</span>
            <span className="text-xl tabular-nums">{isLoading ? '—' : formatUsd(values.total)}</span>
          </div>
        </div>
      </div>

      {/* Rebalance action - available when needed */}
      {hasBalance && (
        <div className="pt-8 border-t border-[var(--border)] mt-8">
          {canRebalance ? (
            <button
              onClick={handleRebalance}
              className="w-full text-center py-3 text-[var(--primary)]"
            >
              Restore to {allocation?.name || 'target'}
            </button>
          ) : (
            <p className="text-center text-sm text-[var(--muted)]">
              Rebalance available above 5% drift
            </p>
          )}
        </div>
      )}

      {/* Vault address - institutional detail */}
      {vaultAddress && (
        <p className="text-xs text-[var(--muted)] text-center mt-8 opacity-50">
          {vaultAddress.slice(0, 6)}...{vaultAddress.slice(-4)}
        </p>
      )}
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
