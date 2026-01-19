'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { type Address } from 'viem'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { useVaultState, useWithdraw } from '@/lib/hooks'
import { getUserVaults, getStoredVault } from '@/lib/store'
import { parseError } from '@/lib/errors'

type WithdrawState = 'idle' | 'confirming' | 'pending' | 'success' | 'error'

function PortfolioContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null)
  const [withdrawState, setWithdrawState] = useState<WithdrawState>('idle')
  const [withdrawError, setWithdrawError] = useState<{ title: string; message: string } | null>(null)

  const { values, allocations, allocation } = useVaultState(vaultAddress)
  const { withdraw, isPending, isConfirming, isSuccess, error: rawWithdrawError } = useWithdraw(vaultAddress)

  // Find vault
  useEffect(() => {
    if (!address) return

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
    }
  }, [address, searchParams])

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  // Track withdraw state
  useEffect(() => {
    if (isPending) setWithdrawState('confirming')
    else if (isConfirming) setWithdrawState('pending')
    else if (isSuccess) setWithdrawState('success')
  }, [isPending, isConfirming, isSuccess])

  // Handle withdraw errors
  useEffect(() => {
    if (rawWithdrawError) {
      const parsed = parseError(rawWithdrawError)
      setWithdrawError({ title: parsed.title, message: parsed.message })
      setWithdrawState('error')
    }
  }, [rawWithdrawError])

  // Reset after success
  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => {
        setWithdrawState('idle')
      }, 3000)
    }
  }, [isSuccess])

  if (!isConnected) return null

  const handleWithdraw = () => {
    setWithdrawError(null)
    setWithdrawState('confirming')
    withdraw()
  }

  const dismissError = () => {
    setWithdrawError(null)
    setWithdrawState('idle')
  }

  // No vault found
  if (!vaultAddress && address) {
    const userVaults = getUserVaults(address)
    if (userVaults.length === 0) {
      return (
        <div className="flex flex-col min-h-[85vh] items-center justify-center text-center">
          <h1 className="text-2xl font-semibold mb-2">No vault found</h1>
          <p className="text-[var(--muted)] mb-8">
            Create a vault to get started.
          </p>
          <Link href="/setup">
            <Button>Create Vault</Button>
          </Link>
        </div>
      )
    }
  }

  // Withdraw success state
  if (withdrawState === 'success') {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Withdrawal complete</h2>
          <p className="text-[var(--muted)]">Funds have been sent to your wallet.</p>
        </div>
      </div>
    )
  }

  // Withdraw processing state
  if (withdrawState === 'confirming' || withdrawState === 'pending') {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full border-4 border-[var(--border)] border-t-[var(--primary)] animate-spin mb-6" />
          <h2 className="text-xl font-semibold mb-2">
            {withdrawState === 'confirming' ? 'Confirm in wallet' : 'Processing...'}
          </h2>
          <p className="text-[var(--muted)]">
            {withdrawState === 'confirming'
              ? 'Approve the withdrawal in your wallet'
              : 'Waiting for confirmation...'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[85vh]">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-[var(--muted)] mb-1">
          {allocation?.name ?? '—'} allocation
        </p>
        <h1 className="text-2xl font-semibold">Your Vault</h1>
      </div>

      {/* Total Value */}
      <Card variant="elevated" padding="large" className="text-center mb-6">
        <p className="text-5xl font-semibold tracking-tight">
          ${values.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </p>
        <p className="text-sm text-[var(--muted)] mt-3">
          Current: {allocations.current.btc.toFixed(0)}% BTC / {allocations.current.usdc.toFixed(0)}% USDC
        </p>
      </Card>

      {/* Allocation breakdown */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card variant="default" padding="default">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-sm text-[var(--muted)]">BTC</span>
          </div>
          <p className="text-xl font-semibold">
            ${values.btc.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </Card>
        <Card variant="default" padding="default">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-sm text-[var(--muted)]">USDC</span>
          </div>
          <p className="text-xl font-semibold">
            ${values.usdc.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </Card>
      </div>

      {/* Allocation bar */}
      <div className="h-2 rounded-full overflow-hidden bg-[var(--background-secondary)] mb-6">
        <div
          className="h-full bg-orange-500 transition-all duration-500"
          style={{ width: `${allocations.current.btc}%` }}
        />
      </div>

      {/* Error display */}
      {withdrawError && (
        <Card variant="default" className="bg-red-500/10 border border-red-500/20 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-red-400 font-medium">{withdrawError.title}</p>
              <p className="text-xs text-red-400/70 mt-1">{withdrawError.message}</p>
            </div>
            <button onClick={dismissError} className="text-red-400 hover:text-red-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </Card>
      )}

      {/* Actions - Withdraw is PRIMARY and always visible */}
      <div className="mt-auto space-y-3">
        {/* Withdraw - always prominent */}
        <Button
          size="large"
          onClick={handleWithdraw}
          disabled={values.total === 0}
        >
          Withdraw All
        </Button>

        {/* Secondary actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/setup" className="block">
            <Button size="large" variant="secondary" className="w-full">
              Deposit More
            </Button>
          </Link>
          <Link href={`/details${vaultAddress ? `?vault=${vaultAddress}` : ''}`} className="block">
            <Button size="large" variant="secondary" className="w-full">
              Details
            </Button>
          </Link>
        </div>

        {/* Reassurance */}
        <p className="text-center text-xs text-[var(--muted)] pt-2">
          Withdraw sends all funds to your wallet.
        </p>
      </div>
    </div>
  )
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[85vh]">
        <div className="w-8 h-8 rounded-full border-3 border-[var(--border)] border-t-[var(--primary)] animate-spin" />
      </div>
    }>
      <PortfolioContent />
    </Suspense>
  )
}
