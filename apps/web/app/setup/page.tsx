'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ALLOCATION_PRESETS, type AllocationPresetType, CONTRACTS } from '@/lib/contracts'
import { useCreateVault, useApproveUsdc, useDeposit, useUsdcBalance, useUsdcAllowance } from '@/lib/hooks'
import { storeVault, getStoredVault } from '@/lib/store'
import { parseError } from '@/lib/errors'
import { parseUnits, type Address } from 'viem'

// Clear step definitions
type Step = 'allocation' | 'amount' | 'review' | 'processing'

// Processing sub-states for clear feedback
type ProcessingPhase =
  | 'creating_vault'
  | 'awaiting_vault_confirm'
  | 'approving_usdc'
  | 'awaiting_approve_confirm'
  | 'depositing'
  | 'awaiting_deposit_confirm'
  | 'complete'

const PHASE_MESSAGES: Record<ProcessingPhase, { title: string; subtitle: string }> = {
  creating_vault: {
    title: 'Creating your vault',
    subtitle: 'Confirm in your wallet',
  },
  awaiting_vault_confirm: {
    title: 'Creating your vault',
    subtitle: 'Waiting for confirmation...',
  },
  approving_usdc: {
    title: 'Approving USDC',
    subtitle: 'Confirm in your wallet',
  },
  awaiting_approve_confirm: {
    title: 'Approving USDC',
    subtitle: 'Waiting for confirmation...',
  },
  depositing: {
    title: 'Depositing funds',
    subtitle: 'Confirm in your wallet',
  },
  awaiting_deposit_confirm: {
    title: 'Depositing funds',
    subtitle: 'Waiting for confirmation...',
  },
  complete: {
    title: 'Complete',
    subtitle: 'Redirecting...',
  },
}

export default function SetupPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()

  // UI state
  const [step, setStep] = useState<Step>('allocation')
  const [selectedAllocation, setSelectedAllocation] = useState<AllocationPresetType | null>(null)
  const [amount, setAmount] = useState('')
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null)
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>('creating_vault')
  const [error, setError] = useState<{ title: string; message: string; action?: string } | null>(null)

  // Contract hooks
  const { formatted: usdcBalance } = useUsdcBalance()
  const { allowance, refetch: refetchAllowance } = useUsdcAllowance(vaultAddress)

  const {
    createVault,
    isPending: isCreatePending,
    isConfirming: isCreateConfirming,
    isSuccess: isCreateSuccess,
    error: createError,
    hash: createHash,
  } = useCreateVault()

  const {
    approve,
    isPending: isApprovePending,
    isConfirming: isApproveConfirming,
    isSuccess: isApproveSuccess,
    error: approveError,
  } = useApproveUsdc()

  const {
    deposit,
    isPending: isDepositPending,
    isConfirming: isDepositConfirming,
    isSuccess: isDepositSuccess,
    error: depositError,
  } = useDeposit(vaultAddress)

  const factoryConfigured = CONTRACTS.factory !== '0x0000000000000000000000000000000000000000'

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  // Track processing phases
  useEffect(() => {
    if (isCreatePending) setProcessingPhase('creating_vault')
    else if (isCreateConfirming) setProcessingPhase('awaiting_vault_confirm')
    else if (isApprovePending) setProcessingPhase('approving_usdc')
    else if (isApproveConfirming) setProcessingPhase('awaiting_approve_confirm')
    else if (isDepositPending) setProcessingPhase('depositing')
    else if (isDepositConfirming) setProcessingPhase('awaiting_deposit_confirm')
  }, [isCreatePending, isCreateConfirming, isApprovePending, isApproveConfirming, isDepositPending, isDepositConfirming])

  // Handle vault creation success - get vault address from logs
  useEffect(() => {
    if (isCreateSuccess && createHash && selectedAllocation && address && !vaultAddress) {
      // Vault was created, now we need to get the address
      // For now, use the stored vault lookup or factory query
      const checkVault = async () => {
        // Small delay to let the chain update
        await new Promise(r => setTimeout(r, 2000))

        // Try to get from storage or re-fetch
        const stored = getStoredVault(address, selectedAllocation.id)
        if (stored) {
          setVaultAddress(stored)
        }
      }
      checkVault()
    }
  }, [isCreateSuccess, createHash, selectedAllocation, address, vaultAddress])

  // Handle approval success - proceed to deposit
  useEffect(() => {
    if (isApproveSuccess && vaultAddress) {
      refetchAllowance()
      // Small delay then deposit
      setTimeout(() => {
        deposit(amount)
      }, 1000)
    }
  }, [isApproveSuccess, vaultAddress, amount, deposit, refetchAllowance])

  // Handle deposit success - save and redirect
  useEffect(() => {
    if (isDepositSuccess && vaultAddress && selectedAllocation && address) {
      setProcessingPhase('complete')
      storeVault(address, selectedAllocation.id, vaultAddress)
      setTimeout(() => {
        router.push('/portfolio')
      }, 1500)
    }
  }, [isDepositSuccess, vaultAddress, selectedAllocation, address, router])

  // Handle errors with human-readable messages
  useEffect(() => {
    const rawError = createError || approveError || depositError
    if (rawError) {
      const parsed = parseError(rawError)
      setError({
        title: parsed.title,
        message: parsed.message,
        action: parsed.action,
      })
      setStep('review') // Go back to review to retry
    }
  }, [createError, approveError, depositError])

  // Allocation selection
  const handleAllocationSelect = useCallback((allocation: AllocationPresetType) => {
    setSelectedAllocation(allocation)
    setError(null)

    if (address) {
      const existingVault = getStoredVault(address, allocation.id)
      if (existingVault) {
        setVaultAddress(existingVault)
      } else {
        setVaultAddress(null)
      }
    }
  }, [address])

  // Amount input
  const handleAmountChange = (value: string) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setAmount(value)
      setError(null)
    }
  }

  // Navigation
  const goToAmount = () => {
    if (selectedAllocation) {
      setStep('amount')
    }
  }

  const goToReview = () => {
    const depositAmount = parseFloat(amount)
    if (depositAmount <= 0) {
      setError({
        title: 'Enter an amount',
        message: 'Please enter how much USDC to deposit.',
      })
      return
    }
    if (depositAmount > parseFloat(usdcBalance)) {
      setError({
        title: 'Insufficient balance',
        message: `You have ${parseFloat(usdcBalance).toLocaleString()} USDC available.`,
      })
      return
    }
    setError(null)
    setStep('review')
  }

  const goBack = () => {
    setError(null)
    if (step === 'amount') setStep('allocation')
    if (step === 'review') setStep('amount')
  }

  // Start the deposit flow
  const handleConfirm = async () => {
    if (!selectedAllocation || !factoryConfigured) return

    setError(null)
    setStep('processing')

    const depositAmount = parseUnits(amount, 6)

    // If vault already exists, go straight to approve/deposit
    if (vaultAddress) {
      if (allowance < depositAmount) {
        setProcessingPhase('approving_usdc')
        approve(vaultAddress, depositAmount)
      } else {
        setProcessingPhase('depositing')
        deposit(amount)
      }
      return
    }

    // Need to create vault first
    setProcessingPhase('creating_vault')
    createVault(selectedAllocation.id)
  }

  if (!isConnected) return null

  // ============================================
  // STEP 1: Allocation Selection
  // ============================================
  if (step === 'allocation') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={() => router.push('/')}
          className="text-[var(--primary)] text-sm mb-8 text-left hover:opacity-70 font-medium"
        >
          ← Back
        </button>

        {/* Progress indicator */}
        <div className="flex gap-2 mb-8">
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--border)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--border)]" />
        </div>

        <h1 className="text-3xl font-semibold mb-2">Choose allocation</h1>
        <p className="text-[var(--muted)] mb-8">
          How much of your deposit should be in Bitcoin?
        </p>

        <div className="space-y-3 flex-1">
          {ALLOCATION_PRESETS.map((allocation) => (
            <button
              key={allocation.id}
              onClick={() => handleAllocationSelect(allocation)}
              className={`w-full p-5 rounded-2xl text-left transition-all ${
                selectedAllocation?.id === allocation.id
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)]'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold text-lg">{allocation.name}</div>
                  <div className={`text-sm ${selectedAllocation?.id === allocation.id ? 'text-white/70' : 'text-[var(--muted)]'}`}>
                    {allocation.btcPct}% BTC · {100 - allocation.btcPct}% USDC
                  </div>
                </div>
                {selectedAllocation?.id === allocation.id && (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>

        <Button size="large" onClick={goToAmount} disabled={!selectedAllocation} className="mt-6">
          Continue
        </Button>
      </div>
    )
  }

  // ============================================
  // STEP 2: Amount Input
  // ============================================
  if (step === 'amount') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={goBack}
          className="text-[var(--primary)] text-sm mb-8 text-left hover:opacity-70 font-medium"
        >
          ← Back
        </button>

        {/* Progress indicator */}
        <div className="flex gap-2 mb-8">
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--border)]" />
        </div>

        <h1 className="text-3xl font-semibold mb-2">Enter amount</h1>
        <p className="text-[var(--muted)] mb-8">
          How much USDC to deposit?
        </p>

        <div className="flex-1 flex flex-col justify-center">
          <div className="text-center mb-8">
            <div className="inline-flex items-baseline">
              <span className="text-4xl text-[var(--muted)] mr-1">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                className="text-6xl font-semibold bg-transparent text-center w-48 focus:outline-none"
                style={{ caretColor: 'var(--primary)' }}
                autoFocus
              />
            </div>
          </div>

          <button
            onClick={() => setAmount(usdcBalance)}
            className="mx-auto mb-4"
          >
            <Card variant="default" className="text-center px-6 py-3 hover:bg-[var(--background-tertiary)] transition-colors">
              <p className="text-sm text-[var(--muted)]">
                Available: <span className="text-[var(--foreground)] font-medium">${parseFloat(usdcBalance).toLocaleString()}</span>
              </p>
            </Card>
          </button>

          {error && (
            <Card variant="default" className="bg-red-500/10 border border-red-500/20 mt-3">
              <p className="text-sm text-red-400 text-center font-medium">{error.title}</p>
              <p className="text-xs text-red-400/70 text-center mt-1">{error.message}</p>
            </Card>
          )}
        </div>

        <Button
          size="large"
          onClick={goToReview}
          disabled={!amount || parseFloat(amount) <= 0}
          className="mt-6"
        >
          Continue
        </Button>
      </div>
    )
  }

  // ============================================
  // STEP 3: Review
  // ============================================
  if (step === 'review') {
    const btcAmount = (parseFloat(amount) * (selectedAllocation?.btcPct ?? 0) / 100)
    const usdcAmount = (parseFloat(amount) * (100 - (selectedAllocation?.btcPct ?? 0)) / 100)

    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={goBack}
          className="text-[var(--primary)] text-sm mb-8 text-left hover:opacity-70 font-medium"
        >
          ← Back
        </button>

        {/* Progress indicator */}
        <div className="flex gap-2 mb-8">
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
        </div>

        <h1 className="text-3xl font-semibold mb-8">Review</h1>

        <div className="flex-1 space-y-4">
          {/* Total deposit */}
          <Card variant="elevated" padding="large">
            <div className="text-sm text-[var(--muted)] mb-1">Depositing</div>
            <div className="font-semibold text-3xl">${parseFloat(amount).toLocaleString()}</div>
          </Card>

          {/* Allocation breakdown */}
          <Card variant="elevated" padding="large">
            <div className="text-sm text-[var(--muted)] mb-3">Will be split into</div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span>BTC</span>
                </div>
                <span className="font-medium">~${btcAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span>USDC</span>
                </div>
                <span className="font-medium">~${usdcAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            {/* Visual bar */}
            <div className="h-2 rounded-full overflow-hidden bg-[var(--border)] flex mt-4">
              <div className="bg-orange-500" style={{ width: `${selectedAllocation?.btcPct}%` }} />
              <div className="bg-blue-500" style={{ width: `${100 - (selectedAllocation?.btcPct ?? 0)}%` }} />
            </div>
          </Card>

          {/* Error display */}
          {error && (
            <Card variant="default" className="bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-red-400 font-medium">{error.title}</p>
              <p className="text-xs text-red-400/70 mt-1">{error.message}</p>
              {error.action && (
                <p className="text-xs text-[var(--muted)] mt-2">{error.action}</p>
              )}
            </Card>
          )}

          {/* Info about what happens next */}
          <Card variant="default" padding="default">
            <p className="text-xs text-[var(--muted)]">
              {vaultAddress
                ? 'You will be asked to approve USDC spending, then confirm the deposit.'
                : 'You will be asked to create your vault, approve USDC spending, then confirm the deposit.'}
            </p>
          </Card>
        </div>

        <div className="mt-8 space-y-3">
          <Button
            size="large"
            onClick={handleConfirm}
            disabled={!factoryConfigured}
          >
            {vaultAddress ? 'Deposit' : 'Create Vault & Deposit'}
          </Button>

          {!factoryConfigured && (
            <p className="text-center text-xs text-[var(--warning)]">
              Preview mode — deployment pending
            </p>
          )}
        </div>
      </div>
    )
  }

  // ============================================
  // STEP 4: Processing
  // ============================================
  const phase = PHASE_MESSAGES[processingPhase]

  return (
    <div className="flex flex-col min-h-[85vh] items-center justify-center">
      <div className="text-center max-w-xs">
        {/* Spinner or checkmark */}
        <div className="mb-8">
          {processingPhase === 'complete' ? (
            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="w-16 h-16 mx-auto rounded-full border-4 border-[var(--border)] border-t-[var(--primary)] animate-spin" />
          )}
        </div>

        <h2 className="text-xl font-semibold mb-2">{phase.title}</h2>
        <p className="text-[var(--muted)]">{phase.subtitle}</p>

        {/* Progress steps */}
        <div className="mt-8 space-y-2">
          <ProcessingStep
            label="Create vault"
            status={getStepStatus('vault', processingPhase, vaultAddress)}
            show={!vaultAddress}
          />
          <ProcessingStep
            label="Approve USDC"
            status={getStepStatus('approve', processingPhase, vaultAddress)}
            show={true}
          />
          <ProcessingStep
            label="Deposit funds"
            status={getStepStatus('deposit', processingPhase, vaultAddress)}
            show={true}
          />
        </div>
      </div>
    </div>
  )
}

// Helper component for processing steps
function ProcessingStep({
  label,
  status,
  show,
}: {
  label: string
  status: 'pending' | 'active' | 'complete'
  show: boolean
}) {
  if (!show) return null

  return (
    <div className="flex items-center gap-3 text-sm">
      {status === 'complete' && (
        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
      {status === 'active' && (
        <div className="w-5 h-5 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
      )}
      {status === 'pending' && (
        <div className="w-5 h-5 rounded-full border-2 border-[var(--border)]" />
      )}
      <span className={status === 'pending' ? 'text-[var(--muted)]' : ''}>{label}</span>
    </div>
  )
}

// Helper to determine step status
function getStepStatus(
  step: 'vault' | 'approve' | 'deposit',
  phase: ProcessingPhase,
  hasVault: Address | null,
): 'pending' | 'active' | 'complete' {
  const phaseOrder: ProcessingPhase[] = [
    'creating_vault',
    'awaiting_vault_confirm',
    'approving_usdc',
    'awaiting_approve_confirm',
    'depositing',
    'awaiting_deposit_confirm',
    'complete',
  ]

  const currentIndex = phaseOrder.indexOf(phase)

  if (step === 'vault') {
    if (hasVault) return 'complete' // Already had vault
    if (currentIndex <= 1) return 'active'
    return 'complete'
  }

  if (step === 'approve') {
    if (hasVault) {
      // Started with vault, approve is first step
      if (currentIndex <= 1) return 'pending'
      if (currentIndex <= 3) return 'active'
      return 'complete'
    }
    // Needed to create vault first
    if (currentIndex <= 1) return 'pending'
    if (currentIndex <= 3) return 'active'
    return 'complete'
  }

  if (step === 'deposit') {
    if (currentIndex <= 3) return 'pending'
    if (currentIndex <= 5) return 'active'
    return 'complete'
  }

  return 'pending'
}
