'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { type Address } from 'viem'
import { Button } from '@/components/Button'
import { useWithdrawAllV2 } from '@/lib/hooks-v2'
import { removeVaultV2 } from '@/lib/contracts-v2'
import { getBasescanTxLink } from '@/lib/security'
import { parseError } from '@/lib/errors'

interface UpgradeV3BannerProps {
  legacyVaultAddress: Address
  totalValueUsd: number
}

type UpgradeStep = 'ready' | 'withdrawing' | 'withdrawn' | 'error'

/**
 * Upgrade banner shown when user has a legacy V2 vault and V3 is available.
 * Flow: Withdraw V2 → Navigate to /setup (which now creates V3)
 */
export function UpgradeV3Banner({ legacyVaultAddress, totalValueUsd }: UpgradeV3BannerProps) {
  const router = useRouter()
  const { address } = useAccount()
  const [step, setStep] = useState<UpgradeStep>('ready')
  const [error, setError] = useState<string | null>(null)

  const {
    withdrawAll,
    isPending,
    isConfirming,
    isSuccess,
    error: withdrawError,
    hash,
  } = useWithdrawAllV2(legacyVaultAddress)

  // Handle withdraw completion
  if (isSuccess && step === 'withdrawing') {
    setStep('withdrawn')
    // Clean up V2 vault from localStorage
    if (address) {
      removeVaultV2(address, legacyVaultAddress)
    }
    // Navigate to setup after short delay
    setTimeout(() => {
      router.push('/setup')
    }, 2000)
  }

  // Handle errors
  if (withdrawError && step === 'withdrawing') {
    const parsed = parseError(withdrawError)
    setError(parsed.message)
    setStep('error')
  }

  const handleUpgrade = async () => {
    setStep('withdrawing')
    setError(null)
    withdrawAll()
  }

  const handleRetry = () => {
    setStep('ready')
    setError(null)
  }

  // Withdrawn state - redirect to setup
  if (step === 'withdrawn') {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="font-medium text-green-400 mb-1">Withdrawal complete</h3>
            <p className="text-sm text-[var(--muted)]">
              Your assets are in your wallet. Redirecting to create your new portfolio...
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (step === 'error') {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-red-400 mb-1">Withdrawal failed</h3>
            <p className="text-sm text-[var(--muted)] mb-4">{error}</p>
            <Button size="default" variant="secondary" onClick={handleRetry}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Withdrawing state
  if (step === 'withdrawing') {
    return (
      <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/10 p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-[var(--primary)]/20 flex items-center justify-center flex-shrink-0">
            <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <h3 className="font-medium mb-1">
              {isPending ? 'Confirm in wallet...' : 'Withdrawing assets...'}
            </h3>
            <p className="text-sm text-[var(--muted)]">
              {isPending
                ? 'Approve the transaction to withdraw your assets.'
                : 'Your assets are being sent to your wallet.'}
            </p>
            {hash && (
              <a
                href={getBasescanTxLink(hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--primary)] hover:underline mt-2 inline-block"
              >
                View on Basescan
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Ready state - show upgrade prompt
  return (
    <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-6 mb-8">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-[var(--primary)]/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="font-medium mb-1">Upgrade available</h3>
          <p className="text-sm text-[var(--muted)] mb-4">
            A new version is available with instant USDC conversion. Upgrade to withdraw as USDC in a single transaction.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="default" onClick={handleUpgrade}>
              Upgrade now
            </Button>
            <p className="text-xs text-[var(--muted)] self-center">
              This will withdraw your assets, then create a new portfolio.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
