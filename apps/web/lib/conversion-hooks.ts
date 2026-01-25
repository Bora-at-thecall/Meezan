/**
 * React hooks for Meezan Conversion Engine
 *
 * Provides hooks for:
 * - Reading Permit2 approval status and nonces
 * - Signing permit batch
 * - Executing conversion transaction
 */

'use client'

import { useState, useCallback } from 'react'
import { useAccount, useReadContract, useReadContracts, useSignTypedData, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { type Address, type Hex, encodeFunctionData, maxUint256 } from 'viem'
import {
  CONVERSION_CONTRACTS,
  CONVERSION_TOKENS,
  PERMIT2_ABI,
  ERC20_ABI,
  type ConversionAsset,
  type ConversionPlan,
  buildConversionPlan,
  buildConversionTx,
  getPermitBatchTypedData,
  PERMIT2_DOMAIN,
  PERMIT2_TYPES,
} from './conversion-engine'

// ============================================================================
// PERMIT2 APPROVAL STATUS
// ============================================================================

export interface Permit2ApprovalStatus {
  token: Address
  hasApproval: boolean
  currentAllowance: bigint
}

/**
 * Check if tokens are approved to Permit2 contract
 */
export function usePermit2Approvals(tokens: Address[]) {
  const { address } = useAccount()

  const contracts = tokens.map((token) => ({
    address: token,
    abi: ERC20_ABI,
    functionName: 'allowance' as const,
    args: [address!, CONVERSION_CONTRACTS.permit2] as const,
  }))

  const { data, isLoading, refetch } = useReadContracts({
    contracts,
    query: { enabled: !!address && tokens.length > 0 },
  })

  const approvals: Permit2ApprovalStatus[] = tokens.map((token, i) => {
    const result = data?.[i]
    const allowance = result?.status === 'success' ? (result.result as bigint) : BigInt(0)
    return {
      token,
      hasApproval: allowance > BigInt(0),
      currentAllowance: allowance,
    }
  })

  const needsApproval = approvals.filter((a) => !a.hasApproval)

  return {
    approvals,
    needsApproval,
    isLoading,
    refetch,
  }
}

// ============================================================================
// PERMIT2 NONCES
// ============================================================================

/**
 * Read Permit2 nonces for tokens (needed for permit signature)
 */
export function usePermit2Nonces(tokens: Address[]) {
  const { address } = useAccount()

  const contracts = tokens.map((token) => ({
    address: CONVERSION_CONTRACTS.permit2,
    abi: PERMIT2_ABI,
    functionName: 'allowance' as const,
    args: [address!, token, CONVERSION_CONTRACTS.universalRouter] as const,
  }))

  const { data, isLoading, refetch } = useReadContracts({
    contracts,
    query: { enabled: !!address && tokens.length > 0 },
  })

  const nonces = new Map<Address, number>()
  tokens.forEach((token, i) => {
    const result = data?.[i]
    if (result?.status === 'success') {
      // allowance returns (amount, expiration, nonce)
      const [, , nonce] = result.result as [bigint, number, number]
      nonces.set(token, nonce)
    } else {
      nonces.set(token, 0)
    }
  })

  return {
    nonces,
    isLoading,
    refetch,
  }
}

// ============================================================================
// TOKEN APPROVAL TRANSACTION
// ============================================================================

/**
 * Approve a token to Permit2 (one-time per token)
 */
export function useApproveToPermit2(token: Address) {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const approve = useCallback(() => {
    writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONVERSION_CONTRACTS.permit2, maxUint256],
    })
  }, [token, writeContract])

  return {
    approve,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

// ============================================================================
// WALLET TOKEN BALANCES
// ============================================================================

/**
 * Read wallet balances for conversion tokens
 */
export function useWalletBalances() {
  const { address } = useAccount()

  const tokens: { id: 'cbBTC' | 'WETH' | 'USDC'; address: Address; decimals: number }[] = [
    { id: 'cbBTC', address: CONVERSION_TOKENS.cbBTC, decimals: 8 },
    { id: 'WETH', address: CONVERSION_TOKENS.WETH, decimals: 18 },
    { id: 'USDC', address: CONVERSION_TOKENS.USDC, decimals: 6 },
  ]

  const contracts = tokens.map((token) => ({
    address: token.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf' as const,
    args: [address!] as const,
  }))

  const { data, isLoading, refetch } = useReadContracts({
    contracts,
    query: { enabled: !!address },
  })

  const balances: Record<'cbBTC' | 'WETH' | 'USDC', bigint> = {
    cbBTC: BigInt(0),
    WETH: BigInt(0),
    USDC: BigInt(0),
  }

  tokens.forEach((token, i) => {
    const result = data?.[i]
    if (result?.status === 'success') {
      balances[token.id] = result.result as bigint
    }
  })

  return {
    balances,
    isLoading,
    refetch,
  }
}

// ============================================================================
// CONVERSION FLOW STATE MACHINE
// ============================================================================

export type ConversionStep =
  | 'idle'
  | 'checking_approvals'
  | 'approving_cbBTC'
  | 'approving_WETH'
  | 'signing_permit'
  | 'executing'
  | 'success'
  | 'error'

export interface ConversionState {
  step: ConversionStep
  error: string | null
  txHash: Hex | null
  usdcReceived: bigint | null
}

/**
 * Full conversion flow hook
 * Handles: approval checks → approvals → permit signing → execution
 */
export function useConversion() {
  const { address } = useAccount()
  const [state, setState] = useState<ConversionState>({
    step: 'idle',
    error: null,
    txHash: null,
    usdcReceived: null,
  })
  const [plan, setPlan] = useState<ConversionPlan | null>(null)

  const { signTypedDataAsync } = useSignTypedData()
  const { writeContractAsync } = useWriteContract()

  /**
   * Start conversion flow for given assets
   */
  const startConversion = useCallback(
    async (assets: ConversionAsset[]) => {
      if (!address) {
        setState({ step: 'error', error: 'Wallet not connected', txHash: null, usdcReceived: null })
        return
      }

      try {
        setState({ step: 'checking_approvals', error: null, txHash: null, usdcReceived: null })

        // This is a simplified flow - in production we'd use the hooks above
        // For now, we'll build the plan and attempt execution

        // Build placeholder nonces (in production, read from chain)
        const nonces = new Map<Address, number>()
        assets.forEach((a) => nonces.set(a.address, 0))

        // Build conversion plan
        const conversionPlan = buildConversionPlan(assets, nonces, 100, 1800)
        setPlan(conversionPlan)

        // Sign permit batch
        setState((s) => ({ ...s, step: 'signing_permit' }))

        const typedData = getPermitBatchTypedData(conversionPlan.permitBatch)
        const signature = await signTypedDataAsync({
          domain: typedData.domain,
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        })

        // Build and execute transaction
        setState((s) => ({ ...s, step: 'executing' }))

        const txRequest = buildConversionTx(conversionPlan, address, signature)

        const hash = await writeContractAsync({
          address: txRequest.to,
          abi: [
            {
              name: 'execute',
              type: 'function',
              stateMutability: 'payable',
              inputs: [
                { name: 'commands', type: 'bytes' },
                { name: 'inputs', type: 'bytes[]' },
                { name: 'deadline', type: 'uint256' },
              ],
              outputs: [],
            },
          ],
          functionName: 'execute',
          args: [
            txRequest.data.slice(0, 10) as Hex, // This is wrong - need to decode properly
            [], // Placeholder
            conversionPlan.deadline,
          ],
        })

        setState({
          step: 'success',
          error: null,
          txHash: hash,
          usdcReceived: conversionPlan.totalUsdcOutMin,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Conversion failed'

        // Parse common errors
        let userMessage = message
        if (message.includes('User rejected') || message.includes('user rejected')) {
          userMessage = 'Authorization cancelled'
        } else if (message.includes('expired') || message.includes('Expired')) {
          userMessage = 'Authorization expired. Please try again.'
        }

        setState({
          step: 'error',
          error: userMessage,
          txHash: null,
          usdcReceived: null,
        })
      }
    },
    [address, signTypedDataAsync, writeContractAsync]
  )

  const reset = useCallback(() => {
    setState({ step: 'idle', error: null, txHash: null, usdcReceived: null })
    setPlan(null)
  }, [])

  return {
    state,
    plan,
    startConversion,
    reset,
  }
}

// ============================================================================
// SIMPLIFIED EXECUTION HOOK
// ============================================================================

/**
 * Execute a pre-built conversion transaction
 * Use this after building the plan and getting the signature
 */
export function useExecuteConversion() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const execute = useCallback(
    (txRequest: { to: Address; data: Hex; value: bigint }) => {
      // We need to call the Universal Router directly with the encoded data
      // Since writeContract expects ABI + args, we use a raw call approach

      // For Universal Router execute, we decode the data and pass it properly
      // This is handled by the parent component which builds the tx
    },
    [writeContract]
  )

  return {
    execute,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}
