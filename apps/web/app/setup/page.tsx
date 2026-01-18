'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ALLOCATION_PRESETS, type AllocationPresetType, CONTRACTS } from '@/lib/contracts'
import { useCreateVault, useAcceptOwnership, useApproveUsdc, useDeposit, useUsdcBalance, useUsdcAllowance } from '@/lib/hooks'
import { storeVault, getStoredVault } from '@/lib/store'
import { parseUnits, type Address } from 'viem'

type Step = 'allocation' | 'amount' | 'confirm' | 'processing'

export default function SetupPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const [step, setStep] = useState<Step>('allocation')
  const [selectedAllocation, setSelectedAllocation] = useState<AllocationPresetType | null>(null)
  const [amount, setAmount] = useState('')
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { formatted: usdcBalance } = useUsdcBalance()
  const { createVault, isPending: isCreating, isSuccess: isCreated, error: createError } = useCreateVault()
  const { accept, isPending: isAccepting, isSuccess: isAccepted, error: acceptError } = useAcceptOwnership(vaultAddress)
  const { approve, isPending: isApproving, isSuccess: isApproved, error: approveError } = useApproveUsdc()
  const { deposit, isPending: isDepositing, isSuccess: isDeposited, error: depositError } = useDeposit(vaultAddress)
  const { allowance, refetch: refetchAllowance } = useUsdcAllowance(vaultAddress)

  const factoryConfigured = CONTRACTS.factory !== '0x0000000000000000000000000000000000000000'

  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  useEffect(() => {
    if (isCreated && selectedAllocation && address) {
      // Continue to approval
    }
  }, [isCreated, selectedAllocation, address])

  useEffect(() => {
    if (isApproved) {
      refetchAllowance()
      const depositAmount = parseFloat(amount)
      if (depositAmount > 0) {
        deposit(amount)
      }
    }
  }, [isApproved, amount, deposit, refetchAllowance])

  useEffect(() => {
    if (isDeposited && vaultAddress && selectedAllocation && address) {
      storeVault(address, selectedAllocation.id, vaultAddress)
      router.push('/portfolio')
    }
  }, [isDeposited, vaultAddress, selectedAllocation, address, router])

  useEffect(() => {
    const err = createError || acceptError || approveError || depositError
    if (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setStep('confirm')
    }
  }, [createError, acceptError, approveError, depositError])

  if (!isConnected) return null

  const handleAllocationSelect = (allocation: AllocationPresetType) => {
    setSelectedAllocation(allocation)
    if (address) {
      const existingVault = getStoredVault(address, allocation.id)
      if (existingVault) {
        setVaultAddress(existingVault)
      } else {
        setVaultAddress(null)
      }
    }
  }

  const handleAmountChange = (value: string) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setAmount(value)
      setError(null)
    }
  }

  const goToAmount = () => {
    if (selectedAllocation) {
      setStep('amount')
    }
  }

  const goToConfirm = () => {
    const depositAmount = parseFloat(amount)
    if (depositAmount > 0) {
      if (depositAmount > parseFloat(usdcBalance)) {
        setError('Amount exceeds your USDC balance')
        return
      }
      setStep('confirm')
    }
  }

  const goBack = () => {
    setError(null)
    if (step === 'amount') setStep('allocation')
    if (step === 'confirm') setStep('amount')
  }

  const handleConfirm = async () => {
    if (!selectedAllocation || !factoryConfigured) return

    setError(null)
    setStep('processing')

    if (vaultAddress) {
      const depositAmount = parseUnits(amount, 6)
      if (allowance < depositAmount) {
        approve(vaultAddress, depositAmount)
      } else {
        deposit(amount)
      }
      return
    }

    createVault(selectedAllocation.id)
  }

  // Step 1: Allocation Selection
  if (step === 'allocation') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={() => router.push('/')}
          className="text-[var(--primary)] text-sm mb-8 text-left hover:opacity-70 font-medium"
        >
          ← Back
        </button>

        <h1 className="text-3xl font-semibold mb-2">Select allocation</h1>
        <p className="text-[var(--muted)] mb-8">
          BTC / USDC split
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
                <div className="font-semibold text-lg">{allocation.name}</div>
                {selectedAllocation?.id === allocation.id && (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>

        <p className="text-xs text-[var(--muted)] text-center mt-4 mb-4">
          Left number is BTC %. Right number is USDC %.
        </p>

        <Button size="large" onClick={goToAmount} disabled={!selectedAllocation}>
          Continue
        </Button>
      </div>
    )
  }

  // Step 2: Amount Input
  if (step === 'amount') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={goBack}
          className="text-[var(--primary)] text-sm mb-8 text-left hover:opacity-70 font-medium"
        >
          ← Back
        </button>

        <h1 className="text-3xl font-semibold mb-2">Enter amount</h1>
        <p className="text-[var(--muted)] mb-8">
          USDC to deposit
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

          <Card variant="default" className="text-center">
            <p className="text-sm text-[var(--muted)]">
              Available: <span className="text-[var(--foreground)] font-medium">${parseFloat(usdcBalance).toLocaleString()}</span>
            </p>
          </Card>

          {error && (
            <Card variant="default" className="mt-3 bg-[var(--error-bg)]">
              <p className="text-sm text-[var(--error)] text-center">{error}</p>
            </Card>
          )}
        </div>

        <div className="mt-8">
          <Button
            size="large"
            onClick={goToConfirm}
            disabled={!amount || parseFloat(amount) <= 0}
          >
            Continue
          </Button>
        </div>
      </div>
    )
  }

  // Step 3: Confirmation
  if (step === 'confirm') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={goBack}
          className="text-[var(--primary)] text-sm mb-8 text-left hover:opacity-70 font-medium"
        >
          ← Back
        </button>

        <h1 className="text-3xl font-semibold mb-8">Review</h1>

        <div className="flex-1 space-y-4">
          <Card variant="elevated" padding="large">
            <div className="text-sm text-[var(--muted)] mb-1">Allocation</div>
            <div className="font-semibold text-lg">{selectedAllocation?.name}</div>
            <div className="text-sm text-[var(--muted)] mt-1">
              {selectedAllocation?.btcPct}% BTC · {100 - (selectedAllocation?.btcPct ?? 0)}% USDC
            </div>
          </Card>

          <Card variant="elevated" padding="large">
            <div className="text-sm text-[var(--muted)] mb-1">Amount</div>
            <div className="font-semibold text-3xl">${parseFloat(amount).toLocaleString()}</div>
          </Card>

          {error && (
            <Card variant="default" className="bg-[var(--error-bg)]">
              <p className="text-sm text-[var(--error)]">{error}</p>
            </Card>
          )}

          {!factoryConfigured && (
            <Card variant="default" className="bg-[var(--warning-bg)]">
              <p className="text-sm text-[var(--warning)]">
                Not yet deployed. This is a preview.
              </p>
            </Card>
          )}
        </div>

        <div className="mt-8 space-y-3">
          <Button
            size="large"
            onClick={handleConfirm}
            disabled={!factoryConfigured}
          >
            Confirm
          </Button>
          <p className="text-center text-xs text-[var(--muted)]">
            You will be asked to approve the transaction in your wallet.
          </p>
        </div>
      </div>
    )
  }

  // Processing state - simplified, no technical details
  return (
    <div className="flex flex-col min-h-[85vh] items-center justify-center">
      <div className="text-center">
        <div className="mb-6">
          <div className="w-12 h-12 mx-auto rounded-full border-4 border-[var(--border)] border-t-[var(--primary)] animate-spin" />
        </div>
        <h2 className="text-xl font-semibold mb-2">
          Processing...
        </h2>
        <p className="text-[var(--muted)]">
          Please confirm in your wallet
        </p>
      </div>
    </div>
  )
}
