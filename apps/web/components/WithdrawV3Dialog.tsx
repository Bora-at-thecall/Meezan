'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { formatUnits, type Address } from 'viem'
import { useWatchContractEvent } from 'wagmi'
import { Button } from './Button'
import {
  useVaultStateV3,
  useWithdrawAllV3,
  useConvertAndWithdraw,
  useRequestConversion,
  useCancelConversion,
  useConversionInfo,
  type AssetHolding
} from '@/lib/hooks-v3'
import { VAULT_V3_ABI } from '@/lib/contracts-v3'
import { getBasescanTxLink } from '@/lib/security'
import {
  trackDialogOpened,
  trackPathSelected,
  trackWithdrawSuccess,
  trackWithdrawFailure,
  trackSlippageExceeded,
  trackFallbackChosen,
  trackConversionRequested,
  trackConversionCancelled,
  trackConversionExecuted,
} from '@/lib/analytics-v3'
import { useChainId } from 'wagmi'

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Withdrawal path options for V3
 * - direct: withdrawAll() - escape hatch, always works
 * - instant: convertAndWithdraw() - atomic swap to USDC
 * - background: requestConversion() - executor handles swap
 */
type WithdrawPath = 'direct' | 'instant' | 'background'

/**
 * State machine for withdrawal flow
 * Flow: select → confirm → processing → success/error
 * On instant failure: error → fallback to background or direct
 */
type DialogStep =
  | 'select'           // Choose withdrawal path
  | 'confirm'          // Confirm selected path
  | 'processing'       // Transaction in progress
  | 'success'          // Completed
  | 'error'            // Failed - offer fallback options
  | 'background_pending' // Background conversion requested, waiting for executor

/**
 * How background conversion ended (for accurate messaging)
 * - executed: ConversionExecuted event detected (executor completed)
 * - cancelled: User called cancelConversion()
 * - withdrawn: User called withdrawAll() (auto-cancelled)
 */
type BackgroundOutcome = 'pending' | 'executed' | 'cancelled' | 'withdrawn'

/**
 * Slippage tolerance for instant conversion
 * POLICY: Hard ceiling at 2% - user absorbs up to 2% slippage loss
 * After one failed attempt, steer to background or direct withdrawal
 *
 * This is a RISK POLICY, not an implementation detail.
 * Do not increase without explicit product/risk approval.
 */
const SLIPPAGE_BPS = 200 // 2% - hard ceiling, no escalation

interface WithdrawV3DialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (path: WithdrawPath) => void
  vaultAddress: Address | null
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

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

  if (symbol === 'BTC' || symbol === 'cbBTC' || symbol === 'mWBTC') {
    if (value < 0.0001) return '<0.0001'
    return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
  } else if (symbol === 'USDC' || symbol === 'mUSDC') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } else {
    if (value < 0.001) return '<0.001'
    return value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 4 })
  }
}

function formatSlippage(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function WithdrawV3Dialog({
  isOpen,
  onClose,
  onSuccess,
  vaultAddress,
}: WithdrawV3DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [step, setStep] = useState<DialogStep>('select')
  const [selectedPath, setSelectedPath] = useState<WithdrawPath>('instant')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Track how background conversion ended (for accurate messaging)
  const [backgroundOutcome, setBackgroundOutcome] = useState<BackgroundOutcome>('pending')

  // ─────────────────────────────────────────────────────────────────────────────
  // Hooks
  // ─────────────────────────────────────────────────────────────────────────────

  const chainId = useChainId()
  const chain = chainId === 8453 ? 'mainnet' : 'testnet' as const

  const vaultState = useVaultStateV3(vaultAddress)
  const conversionInfo = useConversionInfo(vaultAddress, SLIPPAGE_BPS)

  const withdrawAll = useWithdrawAllV3(vaultAddress)
  const convertAndWithdraw = useConvertAndWithdraw(vaultAddress)
  const requestConversion = useRequestConversion(vaultAddress)
  const cancelConversion = useCancelConversion(vaultAddress)

  // Watch for ConversionExecuted event (definitive signal that executor completed)
  useWatchContractEvent({
    address: vaultAddress ?? undefined,
    abi: VAULT_V3_ABI,
    eventName: 'ConversionExecuted',
    enabled: isOpen && step === 'background_pending' && !!vaultAddress,
    onLogs: () => {
      // ConversionExecuted event received - executor completed the conversion
      setBackgroundOutcome('executed')
      setStep('success')
      onSuccess('background')
    },
  })

  // Derived state
  const assetsWithBalance = vaultState.assets.filter(a => a.balance > BigInt(0))
  const hasNonUsdcAssets = vaultState.hasNonStablecoinAssets
  const isUsdcOnly = !hasNonUsdcAssets && assetsWithBalance.length > 0
  const canUseBackground = vaultState.canRequestBackground
  const conversionAlreadyPending = vaultState.conversionRequested

  // ─────────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────────

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null)
      setTxHash(null)
      setBackgroundOutcome('pending')

      // Track dialog opened
      trackDialogOpened({
        totalValueUsd: vaultState.totalValueUsd,
        assetCount: assetsWithBalance.length,
        hasNonUsdcAssets,
        chain,
      })

      if (conversionAlreadyPending) {
        // Already have a pending conversion
        setStep('background_pending')
        setSelectedPath('background')
      } else if (isUsdcOnly) {
        // USDC-only vault - skip to confirm direct
        setStep('confirm')
        setSelectedPath('direct')
      } else {
        setStep('select')
        setSelectedPath('instant')
      }
    }
  }, [isOpen, isUsdcOnly, conversionAlreadyPending, vaultState.totalValueUsd, assetsWithBalance.length, hasNonUsdcAssets, chain])

  // Track withdrawAll transaction
  // Note: If withdrawing while in background_pending, this is "withdraw assets" path
  useEffect(() => {
    if (withdrawAll.hash) setTxHash(withdrawAll.hash)
    if (withdrawAll.isPending) setStep('processing')
    if (withdrawAll.isSuccess) {
      // Check if we were in background_pending (user chose "withdraw assets now")
      if (selectedPath === 'background' || step === 'background_pending') {
        setBackgroundOutcome('withdrawn')
      }
      setStep('success')
      onSuccess('direct')
    }
    if (withdrawAll.error) {
      const msg = extractErrorMessage(withdrawAll.error)
      setErrorMessage(msg)
      setStep('error')
      trackWithdrawFailure({ path: 'direct', errorMessage: msg, chain })
    }
  }, [withdrawAll.isPending, withdrawAll.isSuccess, withdrawAll.error, withdrawAll.hash, onSuccess, selectedPath, step, chain])

  // Track convertAndWithdraw transaction
  useEffect(() => {
    if (convertAndWithdraw.hash) setTxHash(convertAndWithdraw.hash)
    if (convertAndWithdraw.isPending) setStep('processing')
    if (convertAndWithdraw.isSuccess) {
      setStep('success')
      onSuccess('instant')
    }
    if (convertAndWithdraw.error) {
      const msg = extractErrorMessage(convertAndWithdraw.error)
      setErrorMessage(msg)
      setStep('error')

      // Track specific error type
      if (msg.includes('slippage') || msg.includes('Too little received')) {
        trackSlippageExceeded({
          slippageBps: SLIPPAGE_BPS,
          estimatedUsdcOut: Number(conversionInfo.totalEstimatedUsdc) / 1e6,
          chain,
        })
      } else {
        trackWithdrawFailure({ path: 'instant', errorMessage: msg, chain })
      }
    }
  }, [convertAndWithdraw.isPending, convertAndWithdraw.isSuccess, convertAndWithdraw.error, convertAndWithdraw.hash, onSuccess, chain, conversionInfo.totalEstimatedUsdc])

  // Track requestConversion transaction
  useEffect(() => {
    if (requestConversion.hash) setTxHash(requestConversion.hash)
    if (requestConversion.isPending) setStep('processing')
    if (requestConversion.isSuccess) {
      setStep('background_pending')
    }
    if (requestConversion.error) {
      setErrorMessage(extractErrorMessage(requestConversion.error))
      setStep('error')
    }
  }, [requestConversion.isPending, requestConversion.isSuccess, requestConversion.error, requestConversion.hash])

  // Track cancelConversion transaction
  useEffect(() => {
    if (cancelConversion.isSuccess) {
      // User explicitly cancelled - track this for messaging
      setBackgroundOutcome('cancelled')
      vaultState.refetch()
      setStep('select')
    }
    if (cancelConversion.error) {
      setErrorMessage(extractErrorMessage(cancelConversion.error))
    }
  }, [cancelConversion.isSuccess, cancelConversion.error, vaultState])

  // NOTE: Background conversion completion is now detected via ConversionExecuted event
  // (see useWatchContractEvent above) - NOT via flag polling
  // This ensures we only show "Conversion complete" when executor actually completed

  // Escape key handling
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && step !== 'processing') {
        handleClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, step])

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleClose = () => {
    if (step !== 'processing') {
      onClose()
    }
  }

  const handleContinue = () => {
    setStep('confirm')
  }

  const handleConfirm = useCallback(() => {
    setErrorMessage(null)

    if (selectedPath === 'direct') {
      withdrawAll.withdrawAll()
    } else if (selectedPath === 'instant') {
      // Build minAmountsOut from conversion info
      const minAmounts = conversionInfo.conversionAssets.map(a => a.estimatedMinUsdc)
      convertAndWithdraw.convertAndWithdraw(minAmounts)
    } else if (selectedPath === 'background') {
      requestConversion.requestConversion()
    }
  }, [selectedPath, withdrawAll, convertAndWithdraw, requestConversion, conversionInfo])

  const handleFallbackToBackground = () => {
    trackFallbackChosen({
      from: 'instant',
      to: 'background',
      reason: errorMessage || 'slippage_exceeded',
    })
    setSelectedPath('background')
    setErrorMessage(null)
    setStep('confirm')
  }

  const handleFallbackToDirect = () => {
    trackFallbackChosen({
      from: selectedPath === 'background' ? 'background' : 'instant',
      to: 'direct',
      reason: errorMessage || 'user_choice',
    })
    setSelectedPath('direct')
    setErrorMessage(null)
    setStep('confirm')
  }

  const handleCancelPending = () => {
    cancelConversion.cancelConversion()
  }

  const handleWithdrawAfterConversion = () => {
    // After background conversion completes, user can withdraw USDC directly
    withdrawAll.withdrawAll()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  if (!isOpen) return null

  const assetSummary = assetsWithBalance
    .map(a => `${formatBalance(a.balance, a.decimals, a.symbol)} ${a.symbol}`)
    .join(' + ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-[var(--background)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* STEP: SELECT */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {step === 'select' && (
          <>
            <h2 className="text-lg font-semibold mb-2">Withdraw Funds</h2>

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
                  <span className="tabular-nums">{formatUsd(vaultState.totalValueUsd)}</span>
                </div>
              </div>
            </div>

            {/* Withdrawal options */}
            <p className="text-sm text-[var(--muted)] mb-3">How would you like to withdraw?</p>

            <div className="space-y-3 mb-4">
              {/* Option 1: Instant conversion (Path B) */}
              {hasNonUsdcAssets && (
                <label
                  className={`block p-4 rounded-xl border cursor-pointer transition-colors ${
                    selectedPath === 'instant'
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                      : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="withdrawPath"
                      value="instant"
                      checked={selectedPath === 'instant'}
                      onChange={() => setSelectedPath('instant')}
                      className="mt-1 accent-[var(--primary)]"
                    />
                    <div>
                      <p className="font-medium">Withdraw as USDC</p>
                      <p className="text-sm text-[var(--muted)] mt-1">
                        Convert all assets to USDC and withdraw in one transaction.
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-2">
                        Est. ~{formatUsd(Number(conversionInfo.totalEstimatedUsdc) / 1e6)} USDC
                      </p>
                    </div>
                  </div>
                </label>
              )}

              {/* Option 2: Direct withdrawal (Path A) */}
              <label
                className={`block p-4 rounded-xl border cursor-pointer transition-colors ${
                  selectedPath === 'direct'
                    ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                    : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="withdrawPath"
                    value="direct"
                    checked={selectedPath === 'direct'}
                    onChange={() => setSelectedPath('direct')}
                    className="mt-1 accent-[var(--primary)]"
                  />
                  <div>
                    <p className="font-medium">Withdraw as current assets</p>
                    <p className="text-sm text-[var(--muted)] mt-1">
                      Receive {assetsWithBalance.map(a => a.symbol).join(' + ')} directly. No conversion.
                    </p>
                  </div>
                </div>
              </label>

              {/* Option 3: Background conversion (Path C) - only if available */}
              {hasNonUsdcAssets && canUseBackground && (
                <label
                  className={`block p-4 rounded-xl border cursor-pointer transition-colors ${
                    selectedPath === 'background'
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                      : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="withdrawPath"
                      value="background"
                      checked={selectedPath === 'background'}
                      onChange={() => setSelectedPath('background')}
                      className="mt-1 accent-[var(--primary)]"
                    />
                    <div>
                      <p className="font-medium">Request background conversion</p>
                      <p className="text-sm text-[var(--muted)] mt-1">
                        Request conversion. You can cancel and withdraw assets anytime.
                      </p>
                    </div>
                  </div>
                </label>
              )}
            </div>

            <p className="text-xs text-[var(--muted)] mb-6">
              You can always withdraw your current assets immediately.
            </p>

            <div className="flex gap-3">
              <Button variant="secondary" size="default" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button variant="primary" size="default" onClick={handleContinue} className="flex-1">
                Continue
              </Button>
            </div>
          </>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* STEP: CONFIRM */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {step === 'confirm' && (
          <>
            <h2 className="text-lg font-semibold mb-2">Confirm Withdrawal</h2>

            {selectedPath === 'instant' && (
              <>
                <p className="text-sm text-[var(--muted)] mb-4">
                  Your assets will be converted to USDC and sent to your wallet in one transaction.
                </p>

                <div className="bg-[var(--background-secondary)] rounded-xl p-4 mb-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">Converting</span>
                    <span className="font-medium">{assetSummary}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">Est. USDC received</span>
                    <span className="font-medium tabular-nums">
                      ~{formatUsd(Number(conversionInfo.totalEstimatedUsdc) / 1e6)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">Slippage tolerance</span>
                    <span className="font-medium tabular-nums">{formatSlippage(SLIPPAGE_BPS)}</span>
                  </div>
                </div>
              </>
            )}

            {selectedPath === 'direct' && (
              <>
                <p className="text-sm text-[var(--muted)] mb-4">
                  Your assets will be sent directly to your wallet.
                </p>

                <div className="bg-[var(--background-secondary)] rounded-xl p-4 mb-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">You will receive</span>
                    <span className="font-medium">{assetSummary}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">Total value</span>
                    <span className="font-medium tabular-nums">{formatUsd(vaultState.totalValueUsd)}</span>
                  </div>
                </div>
              </>
            )}

            {selectedPath === 'background' && (
              <>
                <p className="text-sm text-[var(--muted)] mb-4">
                  You're requesting the protocol to attempt conversion to USDC.
                  You can cancel and withdraw your current assets at any time.
                </p>

                <div className="bg-[var(--background-secondary)] rounded-xl p-4 mb-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">Assets to convert</span>
                    <span className="font-medium">{assetSummary}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">Est. value</span>
                    <span className="font-medium tabular-nums">{formatUsd(vaultState.totalValueUsd)}</span>
                  </div>
                </div>

                <p className="text-xs text-[var(--muted)] mb-4">
                  Conversion is best-effort. Your assets remain withdrawable at any time.
                </p>
              </>
            )}

            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="default"
                onClick={() => setStep('select')}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                variant="primary"
                size="default"
                onClick={handleConfirm}
                className="flex-1"
              >
                {selectedPath === 'background' ? 'Request Conversion' : 'Withdraw'}
              </Button>
            </div>
          </>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* STEP: PROCESSING */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {step === 'processing' && (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            <p className="text-lg mb-2">
              {withdrawAll.isPending || convertAndWithdraw.isPending || requestConversion.isPending
                ? 'Confirm in wallet'
                : 'Confirming on Base...'}
            </p>
            <p className="text-sm text-[var(--muted)] mb-4">
              {withdrawAll.isPending || convertAndWithdraw.isPending || requestConversion.isPending
                ? 'Approve the transaction to continue'
                : 'Your transaction is being confirmed'}
            </p>
            {txHash && (
              <a
                href={getBasescanTxLink(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--primary)] hover:underline"
              >
                View on Basescan
              </a>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* STEP: SUCCESS */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {step === 'success' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            {/* Background conversion: executor completed */}
            {backgroundOutcome === 'executed' && (
              <>
                <p className="text-xl font-semibold mb-2">Conversion complete</p>
                <p className="text-[var(--muted)] mb-4">
                  USDC ready to withdraw.
                </p>
                <p className="text-xs text-[var(--muted)] mb-4">
                  Small dust amounts may remain in original assets.
                </p>
              </>
            )}

            {/* User withdrew assets while conversion was pending */}
            {backgroundOutcome === 'withdrawn' && (
              <>
                <p className="text-xl font-semibold mb-2">Assets withdrawn</p>
                <p className="text-[var(--muted)] mb-4">
                  Your assets have been sent to your wallet.
                </p>
              </>
            )}

            {/* Instant conversion (Path B) */}
            {selectedPath === 'instant' && backgroundOutcome === 'pending' && (
              <>
                <p className="text-xl font-semibold mb-2">Withdrawal complete</p>
                <p className="text-[var(--muted)] mb-4">
                  USDC has been sent to your wallet.
                </p>
              </>
            )}

            {/* Direct withdrawal (Path A) - not during background pending */}
            {selectedPath === 'direct' && backgroundOutcome === 'pending' && (
              <>
                <p className="text-xl font-semibold mb-2">Withdrawal complete</p>
                <p className="text-[var(--muted)] mb-4">
                  Funds have been sent to your wallet.
                </p>
              </>
            )}
            {txHash && (
              <a
                href={getBasescanTxLink(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--primary)] hover:underline"
              >
                View on Basescan
              </a>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* STEP: ERROR (with retry/fallback options) */}
        {/* Optimized for panic scenarios: short sentences, clear options */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {step === 'error' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-yellow-500/20 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-lg font-semibold mb-2">
                {selectedPath === 'instant' ? 'Conversion failed' : 'Transaction failed'}
              </p>
              {/* Simplified error message for panic scenarios */}
              <p className="text-sm text-[var(--muted)]">
                {selectedPath === 'instant'
                  ? 'Price moved too much. Your assets are safe.'
                  : errorMessage || 'Something went wrong. Your assets are safe.'}
              </p>
            </div>

            {/* Fallback options for instant conversion failures */}
            {selectedPath === 'instant' && (
              <div className="space-y-3">
                {/* Clear, direct options - no explanations needed in panic */}
                <Button
                  variant="primary"
                  size="default"
                  onClick={handleFallbackToDirect}
                  className="w-full"
                >
                  Withdraw assets now
                </Button>

                {canUseBackground && (
                  <Button
                    variant="secondary"
                    size="default"
                    onClick={handleFallbackToBackground}
                    className="w-full"
                  >
                    Try background conversion
                  </Button>
                )}

                <button
                  onClick={handleClose}
                  className="w-full text-sm text-[var(--muted)] hover:text-[var(--foreground)] py-2"
                >
                  Close
                </button>
              </div>
            )}

            {/* Simple dismiss for other failures */}
            {selectedPath !== 'instant' && (
              <div className="flex gap-3">
                <Button variant="secondary" size="default" onClick={handleClose} className="flex-1">
                  Close
                </Button>
                <Button variant="primary" size="default" onClick={() => setStep('select')} className="flex-1">
                  Try again
                </Button>
              </div>
            )}
          </>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* STEP: BACKGROUND PENDING */}
        {/* Simplified copy - users in this state may be anxious */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {step === 'background_pending' && (
          <>
            <h2 className="text-lg font-semibold mb-2">Conversion in Progress</h2>
            <p className="text-sm text-[var(--muted)] mb-4">
              We're converting your assets to USDC.
            </p>

            <div className="bg-[var(--background-secondary)] rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                <div>
                  <p className="font-medium">Processing</p>
                  <p className="text-sm text-[var(--muted)]">You can withdraw anytime</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {/* Primary action: Get assets now (escape hatch) */}
              <Button
                variant="primary"
                size="default"
                onClick={handleFallbackToDirect}
                className="w-full"
              >
                Withdraw assets now
              </Button>

              {/* Secondary: Cancel and wait */}
              <Button
                variant="secondary"
                size="default"
                onClick={handleCancelPending}
                disabled={cancelConversion.isPending}
                className="w-full"
              >
                {cancelConversion.isPending ? 'Cancelling...' : 'Cancel request'}
              </Button>

              <button
                onClick={handleClose}
                className="w-full text-sm text-[var(--muted)] hover:text-[var(--foreground)] py-2"
              >
                Check back later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function extractErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error'

  if (typeof error === 'object' && error !== null) {
    // Check for common error shapes
    if ('shortMessage' in error && typeof error.shortMessage === 'string') {
      return error.shortMessage
    }
    if ('message' in error && typeof error.message === 'string') {
      // Clean up common prefixes
      const msg = error.message
      if (msg.includes('User rejected')) return 'Transaction rejected by user'
      if (msg.includes('insufficient funds')) return 'Insufficient funds for gas'
      if (msg.includes('slippage')) return 'Slippage too high - try increasing tolerance'
      return msg.length > 100 ? msg.slice(0, 100) + '...' : msg
    }
  }

  return String(error)
}
