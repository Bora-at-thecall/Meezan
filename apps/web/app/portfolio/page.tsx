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

function PortfolioContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null)
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  const { values, allocations, drift, allocation } = useVaultState(vaultAddress)
  const { withdraw, isPending, isSuccess } = useWithdraw(vaultAddress)

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

  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  useEffect(() => {
    if (isSuccess) {
      setIsWithdrawing(false)
    }
  }, [isSuccess])

  if (!isConnected) return null

  const handleWithdraw = () => {
    setIsWithdrawing(true)
    withdraw()
  }

  // No vault found
  if (!vaultAddress && address) {
    const userVaults = getUserVaults(address)
    if (userVaults.length === 0) {
      return (
        <div className="flex flex-col min-h-[85vh] items-center justify-center text-center">
          <h1 className="text-2xl font-semibold mb-2">No funds deposited</h1>
          <p className="text-[var(--muted)] mb-8">
            Deposit USDC to get started.
          </p>
          <Link href="/setup">
            <Button>Deposit</Button>
          </Link>
        </div>
      )
    }
  }

  return (
    <div className="flex flex-col min-h-[85vh]">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-[var(--muted)] mb-1">
          {allocation?.name ?? '—'}
        </p>
        <h1 className="text-2xl font-semibold">Balance</h1>
      </div>

      {/* Total Value */}
      <Card variant="elevated" padding="large" className="text-center mb-6">
        <p className="text-5xl font-semibold tracking-tight">
          ${values.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </p>
        <p className="text-sm text-[var(--muted)] mt-3">
          Current: {allocations.current.btc.toFixed(0)} / {allocations.current.usdc.toFixed(0)}
        </p>
      </Card>

      {/* Allocation */}
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
      <div className="h-2 rounded-full overflow-hidden bg-[var(--background-secondary)] mb-8">
        <div
          className="h-full bg-orange-500 transition-all duration-500"
          style={{ width: `${allocations.current.btc}%` }}
        />
      </div>

      {/* Actions */}
      <div className="mt-auto space-y-3">
        <Link href={`/details${vaultAddress ? `?vault=${vaultAddress}` : ''}`} className="block">
          <Button size="large" variant="secondary">
            Details
          </Button>
        </Link>
        <Button
          size="large"
          onClick={handleWithdraw}
          disabled={isPending || isWithdrawing || values.total === 0}
        >
          {isPending || isWithdrawing ? 'Processing...' : 'Withdraw'}
        </Button>
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
