'use client'

import { useState, useEffect, useRef } from 'react'
import { formatUnits } from 'viem'
import { Button } from './Button'
import type { AssetHolding } from '@/lib/hooks-v2'

// Base USDC address for reliable detection
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase()

type WithdrawOption = 'convert' | 'immediate'
type DialogStep = 'select' | 'confirm'

interface WithdrawOptionsDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (option: WithdrawOption) => void
  assets: AssetHolding[]
  totalValueUsd: number
  networkFeeEstimate: string
  isLoading?: boolean
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

function formatBalance(balance: bigint, decimals: number, symbol: string): string {
  const value = Number(formatUnits(balance, decimals))
  if (value === 0) return '0'

  if (symbol === 'BTC') {
    if (value < 0.0001) return '<0.0001'
    return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
  } else if (symbol === 'USDC') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } else {
    if (value < 0.001) return '<0.001'
    return value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 4 })
  }
}

export function WithdrawOptionsDialog({
  isOpen,
  onClose,
  onConfirm,
  assets,
  totalValueUsd,
  networkFeeEstimate,
  isLoading = false,
}: WithdrawOptionsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [selectedOption, setSelectedOption] = useState<WithdrawOption>('convert')
  const [step, setStep] = useState<DialogStep>('select')

  // Detect if vault is 100% USDC (no non-USDC assets with balance)
  const assetsWithBalance = assets.filter(a => a.balance > BigInt(0))
  const hasNonUsdcAssets = assetsWithBalance.some(
    a => a.assetId.toLowerCase() !== 'usdc'
  )
  const isUsdcOnly = !hasNonUsdcAssets && assetsWithBalance.length > 0

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      // If USDC-only, default to immediate (no conversion needed)
      setSelectedOption(isUsdcOnly ? 'immediate' : 'convert')
      // If USDC-only, skip to confirm step
      setStep(isUsdcOnly ? 'confirm' : 'select')
    }
  }, [isOpen, isUsdcOnly])

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleBack()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, step])

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleBack = () => {
    if (step === 'confirm' && !isUsdcOnly) {
      setStep('select')
    } else {
      onClose()
    }
  }

  const handleContinue = () => {
    setStep('confirm')
  }

  const handleConfirm = () => {
    onConfirm(selectedOption)
  }

  if (!isOpen) return null

  // Build asset summary string
  const assetSummary = assetsWithBalance
    .map(a => `${formatBalance(a.balance, a.decimals, a.symbol)} ${a.symbol}`)
    .join(' + ')

  // Non-USDC assets for conversion guidance
  const nonUsdcAssets = assetsWithBalance.filter(a => a.assetId.toLowerCase() !== 'usdc')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleBack}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-[var(--background)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        {/* USDC-only: Simple confirmation */}
        {isUsdcOnly ? (
          <>
            <h2 id="dialog-title" className="text-lg font-semibold mb-2">
              Withdraw USDC
            </h2>
            <p className="text-sm text-[var(--muted)] mb-4">
              You already hold USDC. Your funds will be sent directly to your wallet.
            </p>

            <div className="bg-[var(--background-secondary)] rounded-xl p-4 mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">You will receive</span>
                <span className="font-medium tabular-nums">{assetSummary}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">Network fee</span>
                <span className="font-medium tabular-nums">{networkFeeEstimate}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="default"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="default"
                onClick={handleConfirm}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? 'Processing...' : 'Withdraw'}
              </Button>
            </div>
          </>
        ) : step === 'select' ? (
          <>
            {/* Step 1: Options Selection */}
            <h2 id="dialog-title" className="text-lg font-semibold mb-2">
              Withdraw Funds
            </h2>

            {/* Holdings summary */}
            <div className="mb-6">
              <p className="text-sm text-[var(--muted)] mb-3">Your vault holds:</p>
              <div className="space-y-2">
                {assetsWithBalance.map(asset => (
                  <div key={asset.assetId} className="flex justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: asset.color }}
                      />
                      <span>{asset.symbol}</span>
                    </div>
                    <div className="text-right">
                      <span className="tabular-nums">{formatBalance(asset.balance, asset.decimals, asset.symbol)}</span>
                      <span className="text-[var(--muted)] ml-2 tabular-nums">({formatUsd(asset.valueUsd)})</span>
                    </div>
                  </div>
                ))}
                <div className="pt-2 mt-2 border-t border-[var(--border)] flex justify-between text-sm font-medium">
                  <span>Total</span>
                  <span className="tabular-nums">{formatUsd(totalValueUsd)}</span>
                </div>
              </div>
            </div>

            {/* Withdrawal options */}
            <p className="text-sm text-[var(--muted)] mb-3">How would you like to withdraw?</p>

            <div className="space-y-3 mb-4">
              {/* Option 1: Withdraw, then convert */}
              <label
                className={`block p-4 rounded-xl border cursor-pointer transition-colors ${
                  selectedOption === 'convert'
                    ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                    : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="withdrawOption"
                    value="convert"
                    checked={selectedOption === 'convert'}
                    onChange={() => setSelectedOption('convert')}
                    className="mt-1 accent-[var(--primary)]"
                  />
                  <div>
                    <p className="font-medium">Withdraw, then convert to USDC</p>
                    <p className="text-sm text-[var(--muted)] mt-1">
                      Your assets go to your wallet. We'll guide you through converting on Uniswap.
                    </p>
                  </div>
                </div>
              </label>

              {/* Option 2: Withdraw now */}
              <label
                className={`block p-4 rounded-xl border cursor-pointer transition-colors ${
                  selectedOption === 'immediate'
                    ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                    : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="withdrawOption"
                    value="immediate"
                    checked={selectedOption === 'immediate'}
                    onChange={() => setSelectedOption('immediate')}
                    className="mt-1 accent-[var(--primary)]"
                  />
                  <div>
                    <p className="font-medium">Withdraw now as current assets</p>
                    <p className="text-sm text-[var(--muted)] mt-1">
                      Receive {assetsWithBalance.map(a => a.symbol).join(' + ')} immediately. No conversion.
                    </p>
                  </div>
                </div>
              </label>
            </div>

            {/* Reassurance text */}
            <p className="text-xs text-[var(--muted)] mb-6">
              You can always withdraw your current assets immediately.
            </p>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="default"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="default"
                onClick={handleContinue}
                className="flex-1"
              >
                Continue
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Step 2: Confirmation */}
            <h2 id="dialog-title" className="text-lg font-semibold mb-2">
              Confirm Withdrawal
            </h2>

            {selectedOption === 'convert' ? (
              <>
                <p className="text-sm text-[var(--muted)] mb-4">
                  Your assets will be withdrawn to your wallet. After withdrawal, we'll guide you through converting to USDC on Uniswap.
                </p>

                <div className="bg-[var(--background-secondary)] rounded-xl p-4 mb-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">You will receive</span>
                    <span className="font-medium">{assetSummary}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">Total value</span>
                    <span className="font-medium tabular-nums">{formatUsd(totalValueUsd)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">Network fee</span>
                    <span className="font-medium tabular-nums">{networkFeeEstimate}</span>
                  </div>
                </div>

                <p className="text-xs text-[var(--muted)] mb-6">
                  Conversion happens in your wallet after withdrawal.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--muted)] mb-4">
                  Your assets will be sent directly to your wallet.
                </p>

                <div className="bg-[var(--background-secondary)] rounded-xl p-4 mb-6 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">You will receive</span>
                    <span className="font-medium">{assetSummary}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">Total value</span>
                    <span className="font-medium tabular-nums">{formatUsd(totalValueUsd)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">Network fee</span>
                    <span className="font-medium tabular-nums">{networkFeeEstimate}</span>
                  </div>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="default"
                onClick={handleBack}
                disabled={isLoading}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                variant="primary"
                size="default"
                onClick={handleConfirm}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? 'Processing...' : 'Withdraw'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
