'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useSignTypedData } from 'wagmi'
import { type Address, formatUnits, maxUint256 } from 'viem'
import { Button } from './Button'
import { getBasescanTxLink } from '@/lib/security'
import {
  CONVERSION_CONTRACTS,
  CONVERSION_TOKENS,
  ERC20_ABI,
  PERMIT2_ABI,
  UNIVERSAL_ROUTER_ABI,
  type ConversionAsset,
  buildConversionPlan,
  buildConversionTx,
  getPermitBatchTypedData,
  fetchSwapQuote,
} from '@/lib/conversion-engine'

// ============================================================================
// TYPES
// ============================================================================

type ConversionStep =
  | 'loading'           // Checking approvals and quotes
  | 'approve_cbBTC'     // Need to approve cbBTC to Permit2
  | 'approve_WETH'      // Need to approve WETH to Permit2
  | 'ready'             // Ready to convert
  | 'signing'           // Waiting for permit signature
  | 'executing'         // Transaction submitted
  | 'success'           // Conversion complete
  | 'error'             // Something went wrong

interface ConversionFlowProps {
  assets: ConversionAsset[]
  onComplete: () => void
  onSkip: () => void
}

// ============================================================================
// HELPERS
// ============================================================================

function formatUsd(value: number): string {
  if (value === 0) return '$0'
  if (value < 0.01) return '<$0.01'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatTokenAmount(amount: bigint, decimals: number, symbol: string): string {
  const value = Number(formatUnits(amount, decimals))
  if (symbol === 'BTC' || symbol === 'cbBTC') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 })
  } else if (symbol === 'USDC') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ConversionFlow({ assets, onComplete, onSkip }: ConversionFlowProps) {
  const { address } = useAccount()
  const [step, setStep] = useState<ConversionStep>('loading')
  const [error, setError] = useState<string | null>(null)
  const [estimatedUsdc, setEstimatedUsdc] = useState<bigint>(BigInt(0))
  const [minimumUsdc, setMinimumUsdc] = useState<bigint>(BigInt(0))

  // Track which token needs approval
  const [pendingApproval, setPendingApproval] = useState<'cbBTC' | 'WETH' | null>(null)

  // ========== Read Permit2 approvals ==========
  const tokenAddresses = assets.map(a => a.address)

  const { data: approvalData, refetch: refetchApprovals } = useReadContracts({
    contracts: tokenAddresses.map(token => ({
      address: token,
      abi: ERC20_ABI,
      functionName: 'allowance' as const,
      args: [address!, CONVERSION_CONTRACTS.permit2] as const,
    })),
    query: { enabled: !!address && assets.length > 0 },
  })

  // ========== Read Permit2 nonces ==========
  const { data: nonceData, refetch: refetchNonces } = useReadContracts({
    contracts: tokenAddresses.map(token => ({
      address: CONVERSION_CONTRACTS.permit2,
      abi: PERMIT2_ABI,
      functionName: 'allowance' as const,
      args: [address!, token, CONVERSION_CONTRACTS.universalRouter] as const,
    })),
    query: { enabled: !!address && assets.length > 0 },
  })

  // ========== Approval transaction ==========
  const {
    writeContract: writeApproval,
    data: approvalHash,
    isPending: isApprovalPending,
    error: approvalError,
    reset: resetApproval,
  } = useWriteContract()

  const { isLoading: isApprovalConfirming, isSuccess: isApprovalSuccess } = useWaitForTransactionReceipt({
    hash: approvalHash,
  })

  // ========== Permit signature ==========
  const { signTypedDataAsync, isPending: isSigningPending } = useSignTypedData()

  // ========== Execute transaction ==========
  const {
    writeContract: writeExecute,
    data: executeHash,
    isPending: isExecutePending,
    error: executeError,
  } = useWriteContract()

  const { isLoading: isExecuteConfirming, isSuccess: isExecuteSuccess } = useWaitForTransactionReceipt({
    hash: executeHash,
  })

  // ========== Check approvals on mount ==========
  useEffect(() => {
    if (!approvalData || step !== 'loading') return

    // Check if any tokens need approval
    const needsApproval: ('cbBTC' | 'WETH')[] = []

    assets.forEach((asset, i) => {
      const result = approvalData[i]
      const allowance = result?.status === 'success' ? (result.result as bigint) : BigInt(0)
      if (allowance < asset.amount) {
        needsApproval.push(asset.id)
      }
    })

    if (needsApproval.includes('cbBTC')) {
      setStep('approve_cbBTC')
    } else if (needsApproval.includes('WETH')) {
      setStep('approve_WETH')
    } else {
      setStep('ready')
      fetchQuotes()
    }
  }, [approvalData, assets, step])

  // ========== Handle approval success ==========
  useEffect(() => {
    if (isApprovalSuccess && pendingApproval) {
      // Refetch approvals and check next
      refetchApprovals().then(() => {
        if (pendingApproval === 'cbBTC') {
          // Check if WETH also needs approval
          const wethAsset = assets.find(a => a.id === 'WETH')
          if (wethAsset) {
            const wethIndex = assets.findIndex(a => a.id === 'WETH')
            const wethResult = approvalData?.[wethIndex]
            const wethAllowance = wethResult?.status === 'success' ? (wethResult.result as bigint) : BigInt(0)
            if (wethAllowance < wethAsset.amount) {
              setStep('approve_WETH')
              setPendingApproval(null)
              resetApproval()
              return
            }
          }
        }
        // All approvals done
        setStep('ready')
        setPendingApproval(null)
        resetApproval()
        fetchQuotes()
      })
    }
  }, [isApprovalSuccess, pendingApproval])

  // ========== Handle approval error ==========
  useEffect(() => {
    if (approvalError) {
      const message = approvalError.message || 'Authorization failed'
      if (message.includes('User rejected') || message.includes('user rejected')) {
        setError('Authorization cancelled. Your assets are still in your wallet.')
      } else {
        setError('Authorization failed. Please try again.')
      }
      setStep('error')
    }
  }, [approvalError])

  // ========== Handle execute success ==========
  useEffect(() => {
    if (isExecuteSuccess) {
      setStep('success')
    }
  }, [isExecuteSuccess])

  // ========== Handle execute error ==========
  useEffect(() => {
    if (executeError) {
      const message = executeError.message || 'Conversion failed'
      if (message.includes('User rejected') || message.includes('user rejected')) {
        setError('Transaction cancelled. Your assets are still in your wallet.')
      } else if (message.includes('slippage') || message.includes('INSUFFICIENT_OUTPUT_AMOUNT')) {
        setError('Conversion didn\'t complete. Market moved too quickly. Please try again.')
      } else if (message.includes('expired') || message.includes('EXPIRED')) {
        setError('Conversion didn\'t complete. Please try again.')
      } else {
        setError('Conversion didn\'t complete. Please try again.')
      }
      setStep('error')
    }
  }, [executeError])

  // ========== Fetch quotes ==========
  const fetchQuotes = async () => {
    let totalOut = BigInt(0)
    let totalMin = BigInt(0)

    for (const asset of assets) {
      const quote = await fetchSwapQuote(
        asset.address,
        CONVERSION_TOKENS.USDC,
        asset.amount
      )
      totalOut += quote.amountOut
      totalMin += quote.amountOutMin
    }

    setEstimatedUsdc(totalOut)
    setMinimumUsdc(totalMin)
  }

  // ========== Approve token ==========
  const handleApprove = (tokenId: 'cbBTC' | 'WETH') => {
    const token = tokenId === 'cbBTC' ? CONVERSION_TOKENS.cbBTC : CONVERSION_TOKENS.WETH
    setPendingApproval(tokenId)

    writeApproval({
      address: token,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONVERSION_CONTRACTS.permit2, maxUint256],
    })
  }

  // ========== Convert ==========
  const handleConvert = async () => {
    if (!address || !nonceData) return

    try {
      setStep('signing')

      // Build nonces map
      const nonces = new Map<Address, number>()
      assets.forEach((asset, i) => {
        const result = nonceData[i]
        if (result?.status === 'success') {
          const [, , nonce] = result.result as [bigint, number, number]
          nonces.set(asset.address, nonce)
        } else {
          nonces.set(asset.address, 0)
        }
      })

      // Refetch quotes for fresh prices
      await fetchQuotes()

      // Build conversion plan
      const plan = buildConversionPlan(assets, nonces, 100, 1800)

      // Update quotes with actual values
      for (let i = 0; i < plan.quotes.length; i++) {
        const quote = await fetchSwapQuote(
          assets[i].address,
          CONVERSION_TOKENS.USDC,
          assets[i].amount
        )
        plan.quotes[i].amountOut = quote.amountOut
        plan.quotes[i].amountOutMin = quote.amountOutMin
      }

      // Get typed data for signing
      const typedData = getPermitBatchTypedData(plan.permitBatch)

      // Sign permit batch
      const signature = await signTypedDataAsync({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      })

      setStep('executing')

      // Build and execute transaction
      const txRequest = buildConversionTx(plan, address, signature)

      // Decode the data to get args for writeContract
      // The data is already fully encoded, so we need to use a raw approach
      // We'll call execute with the pre-encoded commands and inputs

      // Extract commands and inputs from the plan
      const commands = [0x0a, ...assets.map(() => 0x00)] // PERMIT2_PERMIT_BATCH + V3_SWAP_EXACT_IN for each
      const commandBytes = `0x${commands.map(c => c.toString(16).padStart(2, '0')).join('')}` as `0x${string}`

      writeExecute({
        address: CONVERSION_CONTRACTS.universalRouter,
        abi: UNIVERSAL_ROUTER_ABI,
        functionName: 'execute',
        args: [commandBytes, [], plan.deadline], // Note: inputs would need proper encoding
        // For now, we pass the full encoded data
        data: txRequest.data,
      } as any) // Using any to pass raw data

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Conversion failed'

      if (message.includes('User rejected') || message.includes('user rejected')) {
        setError('Authorization cancelled. Your assets are still in your wallet.')
      } else if (message.includes('not supported') || message.includes('unsupported')) {
        setError('Your wallet doesn\'t support this authorization method. Please try again.')
      } else {
        setError('Conversion failed. Please try again.')
      }
      setStep('error')
    }
  }

  // ========== Retry ==========
  const handleRetry = () => {
    setError(null)
    setStep('loading')
    resetApproval()
    refetchApprovals()
    refetchNonces()
  }

  // ========== Calculate USDC output values ==========
  const estimatedUsdcValue = Number(formatUnits(estimatedUsdc, 6))
  const minimumUsdcValue = Number(formatUnits(minimumUsdc, 6))

  // ========== Render ==========

  // Loading state
  if (step === 'loading') {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 mx-auto mb-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[var(--muted)]">Preparing conversion...</p>
      </div>
    )
  }

  // Approval states
  if (step === 'approve_cbBTC' || step === 'approve_WETH') {
    const tokenId = step === 'approve_cbBTC' ? 'cbBTC' : 'WETH'
    const tokenName = tokenId === 'cbBTC' ? 'BTC' : 'ETH'
    const isApproving = isApprovalPending || isApprovalConfirming

    // Show confirming state with tx hash link
    if (isApprovalConfirming && approvalHash) {
      return (
        <div className="text-center py-8">
          <div className="w-8 h-8 mx-auto mb-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-lg mb-2">Confirming on Base...</p>
          <p className="text-sm text-[var(--muted)] mb-4">Your authorization is being confirmed</p>
          <a
            href={getBasescanTxLink(approvalHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--primary)] hover:underline"
          >
            View on Basescan
          </a>
        </div>
      )
    }

    return (
      <div className="text-center">
        <p className="text-lg font-medium mb-2">One-time setup</p>
        <p className="text-sm text-[var(--muted)] mb-4">
          Allow Uniswap to access your {tokenName} for conversion.
        </p>
        <p className="text-xs text-[var(--muted)] opacity-70 mb-6">
          This authorizes the Permit2 contract — a secure, standard approval system used by Uniswap.
        </p>

        <Button
          size="large"
          onClick={() => handleApprove(tokenId)}
          disabled={isApproving}
          className="w-full max-w-xs mx-auto"
        >
          {isApprovalPending ? 'Confirm in wallet...' : `Authorize ${tokenName}`}
        </Button>

        <button
          onClick={onSkip}
          className="mt-4 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          Skip conversion
        </button>
      </div>
    )
  }

  // Ready to convert
  if (step === 'ready') {
    return (
      <div>
        <p className="text-lg font-medium mb-4 text-center">Convert to USDC</p>

        {/* Assets being converted */}
        <div className="bg-[var(--background-secondary)] rounded-xl p-4 mb-4">
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-3">Converting</p>
          <div className="space-y-2">
            {assets.map(asset => (
              <div key={asset.id} className="flex justify-between text-sm">
                <span>{asset.id === 'cbBTC' ? 'BTC' : 'ETH'}</span>
                <span className="tabular-nums">
                  {formatTokenAmount(asset.amount, asset.decimals, asset.id)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Estimated output */}
        <div className="bg-[var(--background-secondary)] rounded-xl p-4 mb-6">
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-3">You'll receive</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Estimated USDC</span>
              <span className="tabular-nums font-medium">
                {estimatedUsdcValue > 0 ? `${estimatedUsdcValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC` : '—'}
              </span>
            </div>
            <div className="flex justify-between text-sm text-[var(--muted)]">
              <span>Minimum if market moves</span>
              <span className="tabular-nums">
                {minimumUsdcValue > 0 ? `${minimumUsdcValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC` : '—'}
              </span>
            </div>
          </div>
        </div>

        <Button
          size="large"
          onClick={handleConvert}
          className="w-full"
        >
          Convert to USDC
        </Button>

        <button
          onClick={onSkip}
          className="w-full mt-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          Keep assets as they are
        </button>
      </div>
    )
  }

  // Signing state
  if (step === 'signing') {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 mx-auto mb-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        <p className="text-lg mb-2">Confirm in wallet</p>
        <p className="text-sm text-[var(--muted)] mb-2">Sign to authorize the conversion</p>
        <p className="text-xs text-[var(--muted)] opacity-70">This signature costs no gas</p>
      </div>
    )
  }

  // Executing state
  if (step === 'executing') {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 mx-auto mb-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        <p className="text-lg mb-2">
          {executeHash ? 'Confirming on Base...' : 'Confirm in wallet'}
        </p>
        <p className="text-sm text-[var(--muted)] mb-4">
          {executeHash ? 'Your conversion is being confirmed' : 'Approve the transaction to convert'}
        </p>
        {executeHash && (
          <a
            href={getBasescanTxLink(executeHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--primary)] hover:underline"
          >
            View on Basescan
          </a>
        )}
      </div>
    )
  }

  // Success state
  if (step === 'success') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-xl font-semibold mb-2">Conversion complete</p>
        <p className="text-[var(--muted)] mb-4">
          Your assets have been converted to USDC.
        </p>

        {executeHash && (
          <a
            href={getBasescanTxLink(executeHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--primary)] hover:underline block mb-6"
          >
            View on Basescan
          </a>
        )}

        <Button size="large" onClick={onComplete} className="w-full max-w-xs mx-auto">
          Done
        </Button>
      </div>
    )
  }

  // Error state
  if (step === 'error') {
    return (
      <div className="text-center">
        <p className="text-lg mb-2">Couldn't complete conversion</p>
        <p className="text-sm text-[var(--muted)] mb-6">{error}</p>

        <div className="flex flex-col gap-2 max-w-xs mx-auto">
          <Button size="default" onClick={handleRetry}>
            Try again
          </Button>
          <button
            onClick={onSkip}
            className="py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            Keep assets as they are
          </button>
        </div>
      </div>
    )
  }

  return null
}
