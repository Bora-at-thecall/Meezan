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
import { getUserVaults, getStoredVault, storeVault } from '@/lib/store'
import { parseError } from '@/lib/errors'
import { verifyVaultExists } from '@/lib/tx-orchestrator'
import { ALLOCATION_PRESETS } from '@/lib/contracts'

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
  const [mounted, setMounted] = useState(false)

  const { values, allocationName, holdings, drift, driftThreshold, lastUpdated, isLoading, refetch } = useVaultState(vaultAddress)
  const { withdraw, isPending, isConfirming, isSuccess, error: rawWithdrawError } = useWithdraw(vaultAddress)
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

  useEffect(() => {
    if (isPending) setWithdrawState('confirming')
    else if (isConfirming) setWithdrawState('pending')
    else if (isSuccess) {
      setWithdrawState('success')
      setTimeout(() => refetch(), 2000)
    }
  }, [isPending, isConfirming, isSuccess, refetch])

  useEffect(() => {
    if (rawWithdrawError) {
      const parsed = parseError(rawWithdrawError)
      setWithdrawError({ title: parsed.title, message: parsed.message })
      setWithdrawState('error')
    }
  }, [rawWithdrawError])

  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => setWithdrawState('idle'), 3000)
    }
  }, [isSuccess])

  if (!mounted || !isConnected) return null

  const handleWithdrawClick = () => {
    setShowWithdrawConfirm(true)
  }

  const handleWithdrawConfirm = () => {
    setShowWithdrawConfirm(false)
    setWithdrawError(null)
    setWithdrawState('confirming')
    withdraw()
  }

  const dismissError = () => {
    setWithdrawError(null)
    setWithdrawState('idle')
  }

  // No vault state
  if (!vaultAddress && address) {
    const userVaults = getUserVaults(address)
    if (userVaults.length === 0) {
      return (
        <div className="flex flex-col min-h-[85vh] items-center justify-center text-center">
          <p className="text-[var(--muted)] mb-8">No vault yet</p>
          <Link href="/setup">
            <Button>Create Vault</Button>
          </Link>
        </div>
      )
    }
  }

  // Transaction states
  if (withdrawState === 'success') {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center">
        <p className="text-lg mb-2">Withdrawal complete</p>
        <p className="text-sm text-[var(--muted)]">Funds sent to your wallet</p>
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

  const hasBalance = values.total > 0

  return (
    <div className="flex flex-col min-h-[85vh]">
      {/* Balance - the hero */}
      <div className="flex-1 flex flex-col justify-center items-center py-12">
        <p className="text-[72px] sm:text-[80px] font-extralight tracking-tight tabular-nums">
          {isLoading ? (
            <span className="opacity-10">—</span>
          ) : (
            formatUsd(values.total)
          )}
        </p>

        {/* System status - understated */}
        {hasBalance && !isLoading && (
          <div className="mt-8">
            <SystemStatusCompact
              drift={drift}
              driftThreshold={driftThreshold}
              lastUpdated={lastUpdated}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>

      {/* Holdings - balance sheet style */}
      {hasBalance && !isLoading && (
        <div className="py-10">
          {/* Signature divider - the balance motif */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-[10px] text-[var(--muted)] uppercase tracking-[0.2em]">Holdings</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-baseline">
              <span className="text-[var(--muted)]">Bitcoin</span>
              <div className="text-right">
                <span className="tabular-nums">{formatUsd(values.btc)}</span>
                <span className="text-[var(--muted)] text-sm ml-3 tabular-nums">{formatBtc(holdings.btc)}</span>
              </div>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[var(--muted)]">USDC</span>
              <div className="text-right">
                <span className="tabular-nums">{formatUsd(values.usdc)}</span>
                <span className="text-[var(--muted)] text-sm ml-3 tabular-nums">{Number(formatUnits(holdings.usdc, 6)).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions - serious, weighty */}
      <div className="py-8 mt-auto">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>
        <div className="flex justify-center gap-10 text-sm">
          <Link href="/setup" className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
            Deposit
          </Link>
          {hasBalance && (
            <>
              <button onClick={handleWithdrawClick} className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                Withdraw
              </button>
              <Link href={`/details?vault=${vaultAddress}`} className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                Details
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Withdraw confirmation dialog */}
      <ConfirmDialog
        isOpen={showWithdrawConfirm}
        onClose={() => setShowWithdrawConfirm(false)}
        onConfirm={handleWithdrawConfirm}
        title="Withdraw all funds"
        description="This withdraws all BTC and USDC to your connected wallet."
        details={[
          { label: 'Total value', value: formatUsd(values.total) },
          { label: 'Network fee', value: estimateUsd(150000) },
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
