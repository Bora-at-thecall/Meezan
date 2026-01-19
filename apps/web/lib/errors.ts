// Human-readable error messages for wallet/contract errors

type ErrorCode =
  | 'user_rejected'
  | 'insufficient_funds'
  | 'insufficient_allowance'
  | 'network_error'
  | 'contract_error'
  | 'unknown'

interface ParsedError {
  code: ErrorCode
  title: string
  message: string
  action?: string
}

export function parseError(error: Error | null | undefined): ParsedError {
  if (!error) {
    return {
      code: 'unknown',
      title: 'Something went wrong',
      message: 'An unexpected error occurred.',
      action: 'Please try again.',
    }
  }

  const message = error.message?.toLowerCase() || ''

  // User rejected the transaction
  if (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('rejected the request') ||
    message.includes('user cancelled')
  ) {
    return {
      code: 'user_rejected',
      title: 'Transaction cancelled',
      message: 'You declined the transaction in your wallet.',
      action: 'Try again when ready.',
    }
  }

  // Insufficient funds for gas
  if (
    message.includes('insufficient funds') ||
    message.includes('insufficient balance') ||
    message.includes('exceeds balance')
  ) {
    return {
      code: 'insufficient_funds',
      title: 'Insufficient funds',
      message: 'You don\'t have enough ETH to pay for gas.',
      action: 'Add ETH to your wallet on Base.',
    }
  }

  // Allowance issues
  if (
    message.includes('allowance') ||
    message.includes('exceeds allowance')
  ) {
    return {
      code: 'insufficient_allowance',
      title: 'Approval needed',
      message: 'The vault needs permission to use your USDC.',
      action: 'Approve the transaction in your wallet.',
    }
  }

  // Network/RPC errors
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('disconnected') ||
    message.includes('rpc') ||
    message.includes('fetch failed')
  ) {
    return {
      code: 'network_error',
      title: 'Connection issue',
      message: 'Unable to connect to the network.',
      action: 'Check your internet connection and try again.',
    }
  }

  // Contract revert errors
  if (
    message.includes('revert') ||
    message.includes('execution reverted')
  ) {
    // Try to extract specific revert reason
    if (message.includes('slippage')) {
      return {
        code: 'contract_error',
        title: 'Price moved too much',
        message: 'The price changed while processing.',
        action: 'Try again in a moment.',
      }
    }
    if (message.includes('stale')) {
      return {
        code: 'contract_error',
        title: 'Price feed unavailable',
        message: 'Price data is temporarily outdated.',
        action: 'Try again in a few minutes.',
      }
    }
    if (message.includes('dust')) {
      return {
        code: 'contract_error',
        title: 'Amount too small',
        message: 'The amount is below the minimum threshold.',
        action: 'Try a larger amount.',
      }
    }
    if (message.includes('paused')) {
      return {
        code: 'contract_error',
        title: 'Vault paused',
        message: 'This vault is temporarily paused.',
        action: 'Contact the vault owner.',
      }
    }

    return {
      code: 'contract_error',
      title: 'Transaction failed',
      message: 'The transaction could not be completed.',
      action: 'Please try again.',
    }
  }

  // Generic fallback
  return {
    code: 'unknown',
    title: 'Something went wrong',
    message: 'An unexpected error occurred.',
    action: 'Please try again.',
  }
}

// Transaction state for clear UX
export type TxState =
  | 'idle'
  | 'awaiting_approval'    // Waiting for user to approve in wallet
  | 'pending'              // Transaction submitted, waiting for confirmation
  | 'success'              // Transaction confirmed
  | 'error'                // Transaction failed

export function getTxStateMessage(state: TxState, context: string): string {
  switch (state) {
    case 'idle':
      return ''
    case 'awaiting_approval':
      return `Approve ${context} in your wallet`
    case 'pending':
      return `Confirming ${context}...`
    case 'success':
      return `${context} complete`
    case 'error':
      return `${context} failed`
  }
}
