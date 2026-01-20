/**
 * Chain-Verified Transaction Orchestrator
 *
 * Implements strict, chain-verified transaction sequencing for the
 * Create Vault & Deposit flow. No optimistic assumptions.
 *
 * Required on-chain steps:
 * 1. createVault(allocation) via MeezanFactory
 * 2. wait for transaction receipt
 * 3. extract vault address from VaultDeployed event
 * 4. verify vault exists via factory read
 * 5. approve USDC spending for the vault
 * 6. wait for approval receipt
 * 7. verify allowance on-chain
 * 8. call depositUSDC(amount) on the vault
 * 9. wait for deposit receipt
 * 10. verify holdings on-chain
 */

import { createPublicClient, http, decodeEventLog, type Address, type Hash } from 'viem'
import { base } from 'viem/chains'
import { CONTRACTS, FACTORY_ABI, VAULT_ABI, ERC20_ABI } from './contracts'

// Public client for chain reads with exponential backoff
export const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org', {
    retryCount: 5,
    retryDelay: 2000,
  }),
  pollingInterval: 5_000, // Poll every 5 seconds (reduce rate limit pressure)
})

/**
 * Retry helper with exponential backoff for RPC calls
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; description?: string } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelay = 2000, description = 'RPC call' } = options

  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const errorMsg = error instanceof Error ? error.message : String(error)

      // Check for rate limit errors
      const isRateLimit = errorMsg.includes('429') || errorMsg.includes('rate limit')

      if (attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s, etc. (longer for rate limits)
        const delay = isRateLimit
          ? baseDelay * Math.pow(2, attempt + 1) // Start at 4s for rate limits
          : baseDelay * Math.pow(2, attempt)
        console.log(`${description} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}

// ============================================
// TYPES
// ============================================

export type TxStep =
  | 'idle'
  | 'create_vault'
  | 'approve_usdc'
  | 'deposit'
  | 'complete'

export type TxSubState =
  | 'awaiting_wallet'      // Waiting for user to confirm in wallet
  | 'tx_submitted'         // Transaction submitted, waiting for receipt
  | 'confirming_onchain'   // Receipt received, verifying on-chain
  | 'confirmed'            // Verified on-chain, step complete
  | 'error'                // Step failed

export type OrchestratorState = {
  step: TxStep
  subState: TxSubState
  vaultAddress: Address | null
  txHash: Hash | null
  error: { title: string; message: string; action?: string } | null
  // Track what we've verified on-chain
  vaultVerified: boolean
  allowanceVerified: boolean
  depositVerified: boolean
}

export const INITIAL_STATE: OrchestratorState = {
  step: 'idle',
  subState: 'awaiting_wallet',
  vaultAddress: null,
  txHash: null,
  error: null,
  vaultVerified: false,
  allowanceVerified: false,
  depositVerified: false,
}

// UI Messages for each state
export function getStateMessage(state: OrchestratorState): { title: string; subtitle: string } {
  const { step, subState } = state

  if (subState === 'error') {
    return {
      title: state.error?.title || 'Error',
      subtitle: state.error?.message || 'Something went wrong',
    }
  }

  switch (step) {
    case 'idle':
      return { title: 'Ready', subtitle: '' }

    case 'create_vault':
      switch (subState) {
        case 'awaiting_wallet':
          return { title: 'Create Vault', subtitle: 'Confirm in your wallet' }
        case 'tx_submitted':
          return { title: 'Creating Vault', subtitle: 'Transaction submitted...' }
        case 'confirming_onchain':
          return { title: 'Creating Vault', subtitle: 'Verifying on chain...' }
        case 'confirmed':
          return { title: 'Vault Created', subtitle: 'Proceeding to approval...' }
        default:
          return { title: 'Create Vault', subtitle: '' }
      }

    case 'approve_usdc':
      switch (subState) {
        case 'awaiting_wallet':
          return { title: 'Approve USDC', subtitle: 'Confirm in your wallet' }
        case 'tx_submitted':
          return { title: 'Approving USDC', subtitle: 'Transaction submitted...' }
        case 'confirming_onchain':
          return { title: 'Approving USDC', subtitle: 'Verifying allowance...' }
        case 'confirmed':
          return { title: 'USDC Approved', subtitle: 'Proceeding to deposit...' }
        default:
          return { title: 'Approve USDC', subtitle: '' }
      }

    case 'deposit':
      switch (subState) {
        case 'awaiting_wallet':
          return { title: 'Deposit Funds', subtitle: 'Confirm in your wallet' }
        case 'tx_submitted':
          return { title: 'Depositing', subtitle: 'Transaction submitted...' }
        case 'confirming_onchain':
          return { title: 'Depositing', subtitle: 'Verifying deposit...' }
        case 'confirmed':
          return { title: 'Deposit Complete', subtitle: 'Allocation complete!' }
        default:
          return { title: 'Deposit Funds', subtitle: '' }
      }

    case 'complete':
      return { title: 'Complete', subtitle: 'Your vault is ready' }

    default:
      return { title: '', subtitle: '' }
  }
}

// ============================================
// CHAIN VERIFICATION FUNCTIONS
// ============================================

/**
 * Extract vault address from VaultDeployed event in transaction receipt
 */
export async function extractVaultAddressFromReceipt(txHash: Hash): Promise<Address | null> {
  try {
    console.log('Waiting for transaction receipt:', txHash)
    // Use longer timeout and explicit polling
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120_000, // 2 minutes
      pollingInterval: 3_000, // Check every 3 seconds
      confirmations: 1, // Just need 1 confirmation
    })
    console.log('Got receipt, status:', receipt.status)

    if (receipt.status !== 'success') {
      console.error('Transaction failed:', txHash)
      return null
    }

    // Find VaultDeployed event in logs
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: FACTORY_ABI,
          data: log.data,
          topics: log.topics,
        })

        if (decoded.eventName === 'VaultDeployed') {
          // The vault address is in the indexed args
          const vaultAddress = (decoded.args as { vault: Address }).vault
          console.log('Extracted vault address from event:', vaultAddress)
          return vaultAddress
        }
      } catch {
        // Not a VaultDeployed event, continue
        continue
      }
    }

    console.error('VaultDeployed event not found in receipt')
    return null
  } catch (error) {
    console.error('Error extracting vault address:', error)
    return null
  }
}

/**
 * Verify vault exists on-chain via factory read
 */
export async function verifyVaultExists(
  owner: Address,
  allocation: number,
): Promise<Address | null> {
  try {
    const vaultAddress = await withRetry(
      () => publicClient.readContract({
        address: CONTRACTS.factory,
        abi: FACTORY_ABI,
        functionName: 'getVault',
        args: [owner, allocation],
      }),
      { description: 'verifyVaultExists' },
    )

    const isZeroAddress = vaultAddress === '0x0000000000000000000000000000000000000000'
    if (isZeroAddress) {
      console.log('Vault does not exist for', owner, allocation)
      return null
    }

    console.log('Verified vault exists:', vaultAddress)
    return vaultAddress
  } catch (error) {
    console.error('Error verifying vault:', error)
    return null
  }
}

/**
 * Verify USDC allowance on-chain
 */
export async function verifyAllowance(
  owner: Address,
  spender: Address,
  requiredAmount: bigint,
): Promise<boolean> {
  try {
    const allowance = await withRetry(
      () => publicClient.readContract({
        address: CONTRACTS.usdc,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [owner, spender],
      }),
      { description: 'verifyAllowance' },
    )

    const sufficient = allowance >= requiredAmount
    console.log('Verified allowance:', allowance, 'required:', requiredAmount, 'sufficient:', sufficient)
    return sufficient
  } catch (error) {
    console.error('Error verifying allowance:', error)
    return false
  }
}

/**
 * Wait for transaction receipt and verify success
 */
export async function waitForReceipt(txHash: Hash): Promise<boolean> {
  try {
    console.log('Waiting for receipt:', txHash)
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120_000, // 2 minutes
      pollingInterval: 3_000, // Check every 3 seconds
      confirmations: 1,
    })
    const success = receipt.status === 'success'
    console.log('Transaction', txHash, 'success:', success)
    return success
  } catch (error) {
    console.error('Error waiting for receipt:', error)
    return false
  }
}

/**
 * Verify vault has holdings (deposit succeeded)
 */
export async function verifyVaultHasHoldings(vaultAddress: Address): Promise<boolean> {
  try {
    const holdings = await withRetry(
      () => publicClient.readContract({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'holdings',
      }),
      { description: 'verifyVaultHasHoldings' },
    )

    // Check if either token has a balance
    const [btcBalance, usdcBalance] = holdings as [bigint, bigint]
    const hasHoldings = btcBalance > BigInt(0) || usdcBalance > BigInt(0)
    console.log('Vault holdings - BTC:', btcBalance, 'USDC:', usdcBalance, 'has holdings:', hasHoldings)
    return hasHoldings
  } catch (error) {
    console.error('Error verifying holdings:', error)
    return false
  }
}

// ============================================
// ERROR PARSING
// ============================================

export function parseTransactionError(error: unknown): { title: string; message: string; action?: string } {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

  // User rejected
  if (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('rejected the request') ||
    message.includes('user cancelled') ||
    message.includes('user refused')
  ) {
    return {
      title: 'Transaction Cancelled',
      message: 'You cancelled the transaction. No funds were moved.',
      action: 'Try again when ready.',
    }
  }

  // Insufficient funds for gas
  if (
    message.includes('insufficient funds') ||
    message.includes('insufficient balance')
  ) {
    return {
      title: 'Insufficient ETH',
      message: 'You need ETH on Base to pay for gas.',
      action: 'Add ETH to your wallet.',
    }
  }

  // Rate limit errors
  if (message.includes('429') || message.includes('rate limit')) {
    return {
      title: 'Network Busy',
      message: 'The network is experiencing high traffic.',
      action: 'Wait a moment and try again.',
    }
  }

  // Network errors
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('disconnected')
  ) {
    return {
      title: 'Network Error',
      message: 'Unable to connect to the network.',
      action: 'Check your connection and try again.',
    }
  }

  // Contract reverts
  if (message.includes('revert') || message.includes('execution reverted')) {
    if (message.includes('slippage')) {
      return {
        title: 'Price Changed',
        message: 'The price moved while processing.',
        action: 'Try again.',
      }
    }
    return {
      title: 'Transaction Failed',
      message: 'The transaction could not be completed.',
      action: 'Try again.',
    }
  }

  // Generic fallback
  return {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred.',
    action: 'Please try again.',
  }
}
