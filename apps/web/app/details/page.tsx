'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { type Address, formatUnits } from 'viem'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { useVaultState, useRebalance } from '@/lib/hooks'
import { getUserVaults } from '@/lib/store'
import { parseError } from '@/lib/errors'

type RebalanceState = 'idle' | 'confirming' | 'pending' | 'success' | 'error'

function DetailsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()
  const [showTechnical, setShowTechnical] = useState(false)
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null)
  const [rebalanceState, setRebalanceState] = useState<RebalanceState>('idle')
  const [rebalanceError, setRebalanceError] = useState<{ title: string; message: string } | null>(null)

  const { holdings, values, allocations, drift, allocation } = useVaultState(vaultAddress)
  const { rebalance, isPending, isConfirming, isSuccess, error: rawRebalanceError } = useRebalance(vaultAddress)

  const DRIFT_THRESHOLD = 5

  useEffect(() => {
    if (!address) return

    const vaultParam = searchParams.get('vault')
    if (vaultParam) {
      setVaultAddress(vaultParam as Address)
      return
    }

    const userVaults = getUserVaults(address)
    if (userVaults.length > 0) {
      setVaultAddress(userVaults[0].address)
    }
  }, [address, searchParams])

  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  // Track rebalance state
  useEffect(() => {
    if (isPending) setRebalanceState('confirming')
    else if (isConfirming) setRebalanceState('pending')
    else if (isSuccess) setRebalanceState('success')
  }, [isPending, isConfirming, isSuccess])

  // Handle rebalance errors
  useEffect(() => {
    if (rawRebalanceError) {
      const parsed = parseError(rawRebalanceError)
      setRebalanceError({ title: parsed.title, message: parsed.message })
      setRebalanceState('error')
    }
  }, [rawRebalanceError])

  // Reset after success
  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => {
        setRebalanceState('idle')
      }, 3000)
    }
  }, [isSuccess])

  if (!isConnected) return null

  const handleRebalance = () => {
    setRebalanceError(null)
    setRebalanceState('confirming')
    rebalance()
  }

  const dismissError = () => {
    setRebalanceError(null)
    setRebalanceState('idle')
  }

  const isRebalancing = rebalanceState === 'confirming' || rebalanceState === 'pending'

  const btcBalance = holdings.btc ? formatUnits(holdings.btc, 8) : '0'
  const usdcBalance = holdings.usdc ? formatUnits(holdings.usdc, 6) : '0'

  const canRebalance = drift >= DRIFT_THRESHOLD

  return (
    <div className="flex flex-col min-h-[85vh]">
      <button
        onClick={() => router.push('/portfolio')}
        className="text-[var(--primary)] text-sm mb-8 text-left hover:opacity-70 font-medium"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-semibold mb-8">Details</h1>

      {/* Holdings */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-4">Holdings</h2>

        <div className="space-y-3">
          <Card variant="elevated" padding="default">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <span className="text-orange-400 font-semibold text-sm">BTC</span>
                </div>
                <div>
                  <div className="font-semibold">BTC</div>
                  <div className="text-sm text-[var(--muted)]">
                    {parseFloat(btcBalance).toFixed(6)} BTC
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">
                  ${values.btc.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-sm text-[var(--muted)]">
                  {allocations.current.btc.toFixed(1)}%
                  <span className="text-[var(--foreground-secondary)]"> / {allocations.target.btc.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </Card>

          <Card variant="elevated" padding="default">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-blue-400 font-semibold text-sm">USD</span>
                </div>
                <div>
                  <div className="font-semibold">USDC</div>
                  <div className="text-sm text-[var(--muted)]">
                    {parseFloat(usdcBalance).toLocaleString()} USDC
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">
                  ${values.usdc.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-sm text-[var(--muted)]">
                  {allocations.current.usdc.toFixed(1)}%
                  <span className="text-[var(--foreground-secondary)]"> / {allocations.target.usdc.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Rebalancing */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-4">Rebalancing</h2>

        <Card variant="default" padding="default" className="mb-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[var(--muted)]">Current drift</span>
            <span className={`font-semibold ${canRebalance ? 'text-[var(--error)]' : ''}`}>
              {drift.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[var(--muted)]">Threshold</span>
            <span>{DRIFT_THRESHOLD}%</span>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-2 rounded-full overflow-hidden bg-[var(--border)]">
            <div
              className={`h-full transition-all duration-500 ${canRebalance ? 'bg-[var(--error)]' : 'bg-[var(--primary)]'}`}
              style={{ width: `${Math.min((drift / DRIFT_THRESHOLD) * 100, 100)}%` }}
            />
          </div>
        </Card>

        {/* Rebalance error display */}
        {rebalanceError && (
          <Card variant="default" className="bg-red-500/10 border border-red-500/20 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-red-400 font-medium">{rebalanceError.title}</p>
                <p className="text-xs text-red-400/70 mt-1">{rebalanceError.message}</p>
              </div>
              <button onClick={dismissError} className="text-red-400 hover:text-red-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </Card>
        )}

        {/* Rebalance success display */}
        {rebalanceState === 'success' && (
          <Card variant="default" className="bg-green-500/10 border border-green-500/20 mb-4">
            <p className="text-sm text-green-400 font-medium text-center">Rebalance complete</p>
          </Card>
        )}

        <Button
          size="large"
          variant={canRebalance ? 'primary' : 'secondary'}
          onClick={handleRebalance}
          disabled={!canRebalance || isRebalancing}
        >
          {rebalanceState === 'confirming' ? 'Confirm in wallet...' :
           rebalanceState === 'pending' ? 'Processing...' : 'Rebalance'}
        </Button>
        {!canRebalance && (
          <p className="text-xs text-[var(--muted)] text-center mt-3">
            Drift must exceed {DRIFT_THRESHOLD}% to rebalance
          </p>
        )}
      </section>

      {/* Technical Details */}
      <section>
        <button
          onClick={() => setShowTechnical(!showTechnical)}
          className="flex justify-between items-center w-full text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-4"
        >
          <span>Technical</span>
          <svg
            className={`w-4 h-4 transition-transform ${showTechnical ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showTechnical && (
          <Card variant="default" padding="default" className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Allocation</span>
              <span className="font-medium">{allocation?.name ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Vault</span>
              <span className="font-mono text-xs">
                {vaultAddress ? `${vaultAddress.slice(0, 8)}...${vaultAddress.slice(-6)}` : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Slippage cap</span>
              <span>1%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Network</span>
              <span>Base</span>
            </div>
            {vaultAddress && (
              <a
                href={`https://basescan.org/address/${vaultAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-[var(--primary)] hover:underline pt-2"
              >
                View on Basescan →
              </a>
            )}
          </Card>
        )}
      </section>
    </div>
  )
}

export default function DetailsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[85vh]">
        <div className="w-8 h-8 rounded-full border-3 border-[var(--border)] border-t-[var(--primary)] animate-spin" />
      </div>
    }>
      <DetailsContent />
    </Suspense>
  )
}
