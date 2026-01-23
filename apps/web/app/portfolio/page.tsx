'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { type Address, formatUnits } from 'viem'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SystemStatusCompact } from '@/components/SystemStatus'
import { useVaultState, useWithdraw, useGasEstimate } from '@/lib/hooks'
import { getUserVaults, getStoredVault, storeVault, removeVault } from '@/lib/store'
import { parseError } from '@/lib/errors'
import { verifyVaultExists } from '@/lib/tx-orchestrator'
import { ALLOCATION_PRESETS } from '@/lib/contracts'

type WithdrawState = 'idle' | 'confirming' | 'pending' | 'success' | 'error'

// Captured withdrawal details for success screen
interface WithdrawDetails {
  totalValue: number
  btcValue: number
  usdcValue: number
  btcAmount: string
  usdcAmount: string
  txHash: string
  timestamp: Date
}

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
  return btc.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

function PortfolioContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null)
  const [withdrawState, setWithdrawState] = useState<WithdrawState>('idle')
  const [withdrawError, setWithdrawError] = useState<{ title: string; message: string } | null>(null)
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false)
  const [withdrawDetails, setWithdrawDetails] = useState<WithdrawDetails | null>(null)
  const [mounted, setMounted] = useState(false)

  const { values, allocationName, holdings, drift, driftThreshold, lastUpdated, isLoading, refetch } = useVaultState(vaultAddress)
  const { withdraw, isPending, isConfirming, isSuccess, error: rawWithdrawError, hash, reset: resetWithdraw, isWrongNetwork } = useWithdraw(vaultAddress)
  const { estimateUsd } = useGasEstimate()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !address) return

    const findVault = async () => {
      const riskParam = searchParams.get('risk')
      if (riskParam) {
        const storedVault = getStoredVault(address, parseInt(riskParam))
        if (storedVault) {
          setVaultAddress(storedVault)
          return
        }
      }

      const userVaults = getUserVaults(address)
      if (userVaults.length > 0) {
        setVaultAddress(userVaults[0].address)
        return
      }

      for (const preset of ALLOCATION_PRESETS) {
        const onChainVault = await verifyVaultExists(address, preset.id)
        if (onChainVault) {
          storeVault(address, preset.id, onChainVault)
          setVaultAddress(onChainVault)
          return
        }
      }
    }

    findVault()
  }, [mounted, address, searchParams])

  useEffect(() => {
    if (mounted && !isConnected) {
      router.push('/')
    }
  }, [mounted, isConnected, router])

  // Track withdraw transaction state
  useEffect(() => {
    console.log('Withdraw state tracking:', { isPending, isConfirming, isSuccess, hash, currentState: withdrawState })

    if (isPending) {
      // User needs to confirm in wallet
      setWithdrawState('confirming')
    } else if (hash && isConfirming) {
      // Transaction submitted, waiting for on-chain confirmation
      setWithdrawState('pending')
      // Capture the hash in our details
      setWithdrawDetails(prev => prev ? { ...prev, txHash: hash } : null)
    } else if (hash && isSuccess) {
      // Transaction confirmed on-chain
      setWithdrawState('success')
      // Ensure hash is captured
      setWithdrawDetails(prev => prev ? { ...prev, txHash: hash } : null)
    }
    // Note: Don't set state back to idle here - that's handled separately
  }, [isPending, isConfirming, isSuccess, hash])

  // Refetch after successful withdrawal
  useEffect(() => {
    if (isSuccess) {
      const timeout = setTimeout(() => refetch(), 2000)
      return () => clearTimeout(timeout)
    }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // Remove vault from localStorage after successful withdrawal and redirect
  useEffect(() => {
    if (isSuccess && vaultAddress && address) {
      // Remove the vault from localStorage since it's now empty
      removeVault(address, vaultAddress)

      // Redirect to home after user clicks away from success screen
      // (handled in the "View empty portfolio" button click)
    }
  }, [isSuccess, vaultAddress, address])

  useEffect(() => {
    if (rawWithdrawError) {
      const parsed = parseError(rawWithdrawError)
      setWithdrawError({ title: parsed.title, message: parsed.message })
      setWithdrawState('error')
    }
  }, [rawWithdrawError])

  // Don't auto-dismiss success screen - let user control when to leave
  // They need time to see what happened and verify the transaction

  // Timeout for confirming state - if no hash after 60 seconds, assume connection issue
  useEffect(() => {
    if (withdrawState === 'confirming' && !hash) {
      const timeout = setTimeout(() => {
        setWithdrawError({
          title: 'Connection timeout',
          message: 'The wallet connection may have been interrupted. Please check your wallet for any pending transactions.',
        })
        setWithdrawState('error')
      }, 60000) // 60 second timeout
      return () => clearTimeout(timeout)
    }
  }, [withdrawState, hash])

  if (!mounted || !isConnected) return null

  const handleWithdrawClick = () => {
    setShowWithdrawConfirm(true)
  }

  const handleWithdrawConfirm = () => {
    setShowWithdrawConfirm(false)
    setWithdrawError(null)
    resetWithdraw() // Reset any previous transaction state

    // Capture current values BEFORE withdrawal (they'll be $0 after)
    setWithdrawDetails({
      totalValue: values.total,
      btcValue: values.btc,
      usdcValue: values.usdc,
      btcAmount: formatBtc(holdings.btc),
      usdcAmount: Number(formatUnits(holdings.usdc, 6)).toFixed(2),
      txHash: '', // Will be updated when we have the hash
      timestamp: new Date(),
    })

    setWithdrawState('confirming')
    console.log('Withdraw initiated for vault:', vaultAddress)
    if (!vaultAddress) {
      console.error('No vault address!')
      setWithdrawError({ title: 'Error', message: 'No vault address found' })
      setWithdrawState('error')
      return
    }
    withdraw()
  }

  const dismissError = () => {
    setWithdrawError(null)
    setWithdrawState('idle')
    resetWithdraw()
  }

  // No vault state
  if (!vaultAddress && address) {
    const userVaults = getUserVaults(address)
    if (userVaults.length === 0) {
      return (
        <div className="flex flex-col min-h-[85vh] items-center justify-center text-center">
          <p className="text-[var(--muted)] mb-8">No vault yet</p>
          <Link href="/setup-v2">
            <Button>Create Vault</Button>
          </Link>
        </div>
      )
    }
  }

  // Transaction states
  if (withdrawState === 'success' && withdrawDetails) {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center px-4">
        {/* Success icon */}
        <div className="w-16 h-16 rounded-full bg-[var(--success)]/10 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-light mb-2">Withdrawal complete</h1>
        <p className="text-[var(--muted)] mb-8">USDC sent to your wallet</p>

        {/* Withdrawal summary */}
        <div className="w-full max-w-sm space-y-4 mb-8">
          <div className="flex items-center gap-4">
            <span className="text-xs text-[var(--muted)] uppercase tracking-[0.2em]">Summary</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <div className="space-y-3 text-left">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Portfolio value</span>
              <span className="font-medium tabular-nums">{formatUsd(withdrawDetails.totalValue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted)]">Received as</span>
              <span className="tabular-nums">USDC</span>
            </div>
            {withdrawDetails.btcValue > 0 && (
              <div className="flex justify-between text-sm text-[var(--muted)] opacity-70">
                <span>BTC converted</span>
                <span className="tabular-nums">{withdrawDetails.btcAmount} BTC</span>
              </div>
            )}
          </div>

          {/* Transaction details */}
          <div className="pt-4 border-t border-[var(--border)] space-y-3">
            {withdrawDetails.txHash && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">Transaction</span>
                <a
                  href={`https://basescan.org/tx/${withdrawDetails.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--primary)] hover:opacity-80 tabular-nums"
                >
                  {withdrawDetails.txHash.slice(0, 8)}...{withdrawDetails.txHash.slice(-6)} ↗
                </a>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted)]">Network</span>
              <span>Base</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted)]">Time</span>
              <span className="tabular-nums">
                {withdrawDetails.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/setup-v2">
            <Button>Deposit again</Button>
          </Link>
          <button
            onClick={() => router.push('/')}
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors py-2"
          >
            Go to home
          </button>
        </div>

        {/* Wallet address hint */}
        {address && (
          <p className="text-xs text-[var(--muted)] mt-8 opacity-60">
            Sent to {address.slice(0, 6)}...{address.slice(-4)}
          </p>
        )}
      </div>
    )
  }

  if (withdrawState === 'error' && withdrawError) {
    const isConnectionError = withdrawError.message.includes('connection') || withdrawError.message.includes('wallet')
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center px-4">
        <p className="text-lg mb-2">{withdrawError.title}</p>
        <p className="text-sm text-[var(--muted)] mb-8 max-w-md">{withdrawError.message}</p>
        <div className="flex gap-4">
          <button onClick={dismissError} className="text-[var(--primary)] text-sm">
            Dismiss
          </button>
          {isConnectionError && vaultAddress && (
            <a
              href={`https://basescan.org/address/${vaultAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--foreground-secondary)] text-sm hover:text-[var(--foreground)]"
            >
              Check Basescan ↗
            </a>
          )}
        </div>
      </div>
    )
  }

  if (withdrawState === 'confirming') {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center px-4">
        <p className="text-lg mb-2">Confirm in wallet</p>
        <p className="text-sm text-[var(--muted)] mb-6">Approve the transaction in MetaMask</p>
        <button
          onClick={() => {
            setWithdrawState('idle')
            setWithdrawError(null)
            resetWithdraw()
          }}
          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (withdrawState === 'pending') {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center px-4">
        <p className="text-lg mb-2">Transaction submitted</p>
        <p className="text-sm text-[var(--muted)] mb-6">Waiting for on-chain confirmation...</p>
        {hash && (
          <a
            href={`https://basescan.org/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--primary)] mb-4"
          >
            View on Basescan: {hash.slice(0, 10)}...{hash.slice(-8)} ↗
          </a>
        )}
      </div>
    )
  }

  const hasBalance = values.total > 0
  const needsRebalance = drift >= driftThreshold

  return (
    <div className="flex flex-col min-h-[85vh]">
      {/* Network warning */}
      {isWrongNetwork && (
        <div className="bg-[var(--warning)] text-black px-4 py-3 text-center text-sm mb-4 rounded">
          Please switch to Base network in your wallet to interact with your vault
        </div>
      )}

      {/* Hero section - Balance */}
      <div className="py-8 md:py-12">
        <p className="text-[64px] md:text-[80px] font-extralight tracking-tight tabular-nums text-center">
          {isLoading ? (
            <span className="opacity-10">—</span>
          ) : (
            formatUsd(values.total)
          )}
        </p>
      </div>

      {/* Two-column layout on desktop: Holdings | Status & Actions */}
      {hasBalance && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 py-10">
          {/* Left column: Holdings */}
          <div>
            <div className="flex items-center gap-4 mb-6">
              <span className="text-xs text-[var(--muted)] uppercase tracking-[0.2em]">Holdings</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <div className="space-y-5">
              <div className="flex justify-between items-baseline">
                <span>Bitcoin</span>
                <div className="text-right">
                  <span className="text-lg tabular-nums">{formatUsd(values.btc)}</span>
                  <span className="text-[var(--foreground-secondary)] text-sm ml-3 tabular-nums">{formatBtc(holdings.btc)}</span>
                </div>
              </div>
              <div className="flex justify-between items-baseline">
                <span>USDC</span>
                <div className="text-right">
                  <span className="text-lg tabular-nums">{formatUsd(values.usdc)}</span>
                  <span className="text-[var(--foreground-secondary)] text-sm ml-3 tabular-nums">{Number(formatUnits(holdings.usdc, 6)).toFixed(2)}</span>
                </div>
              </div>

              {/* Total row */}
              <div className="pt-4 mt-2 border-t border-[var(--border)]">
                <div className="flex justify-between items-baseline">
                  <span className="text-[var(--muted)]">Total</span>
                  <span className="text-xl tabular-nums font-medium">{formatUsd(values.total)}</span>
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
                <span className="text-[var(--muted)]">Current drift</span>
                <span className={`text-lg tabular-nums ${needsRebalance ? 'text-[var(--warning)] font-medium' : ''}`}>
                  {drift.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[var(--muted)]">Threshold</span>
                <span className="tabular-nums">{driftThreshold.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[var(--muted)]">Allocation</span>
                <span>{allocationName || '—'}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[var(--muted)]">Status</span>
                <span className={needsRebalance ? 'text-[var(--warning)] font-medium' : 'text-[var(--muted)]'}>
                  {needsRebalance ? 'Rebalance available' : 'No action needed'}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4 mb-6">
              <span className="text-xs text-[var(--muted)] uppercase tracking-[0.2em]">Actions</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <div className="flex flex-wrap gap-4">
              <Link href="/setup-v2" className="text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors">
                Deposit
              </Link>
              <button
                onClick={handleWithdrawClick}
                disabled={isWrongNetwork}
                className={`text-sm transition-colors ${isWrongNetwork ? 'text-[var(--muted)] cursor-not-allowed' : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'}`}
              >
                Withdraw
              </button>
              <Link href={`/details?vault=${vaultAddress}`} className="text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors">
                Details
              </Link>
            </div>

            {/* Vault address */}
            {vaultAddress && (
              <a
                href={`https://basescan.org/address/${vaultAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--muted)] opacity-50 mt-6 tabular-nums block hover:opacity-70 transition-opacity"
              >
                Vault: {vaultAddress.slice(0, 6)}...{vaultAddress.slice(-4)} ↗
              </a>
            )}
          </div>
        </div>
      )}

      {/* Empty state actions */}
      {(!hasBalance || isLoading) && (
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
        title="Withdraw to USDC"
        description="Converts all holdings to USDC and sends to your wallet."
        details={[
          { label: 'Total value', value: formatUsd(values.total) },
          { label: 'You receive', value: 'USDC' },
          { label: 'Network fee', value: estimateUsd(250000) },
        ]}
        confirmText="Withdraw"
      />
    </div>
  )
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-[85vh] items-center justify-center">
        <span className="text-[var(--muted)] opacity-20">—</span>
      </div>
    }>
      <PortfolioContent />
    </Suspense>
  )
}
