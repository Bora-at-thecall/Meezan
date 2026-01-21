/**
 * Security configuration for Meezan frontend
 *
 * IMPORTANT: Contract addresses are hardcoded here and MUST NOT be loaded from:
 * - URL parameters
 * - localStorage
 * - Environment variables at runtime
 * - External APIs
 *
 * Any change to these addresses requires a code change and deployment.
 */

import { type Address } from 'viem'
import { base } from 'wagmi/chains'

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFIED CONTRACT ADDRESSES - Base Mainnet (Chain ID 8453)
// ═══════════════════════════════════════════════════════════════════════════════

export const VERIFIED_CONTRACTS = {
  // Meezan Factory - deploys user vaults
  factory: '0x9e3B4B3bF1A018f488D0b3a302F5b37CDB51c8Eb' as Address,

  // Tokens
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' as Address,

  // Chainlink Price Feeds
  btcUsdFeed: '0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D' as Address,
  usdcUsdFeed: '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B' as Address,

  // Uniswap V3 SwapRouter
  swapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481' as Address,
} as const

// ═══════════════════════════════════════════════════════════════════════════════
// ALLOWED CHAINS - Only Base mainnet
// ═══════════════════════════════════════════════════════════════════════════════

export const ALLOWED_CHAIN_IDS = [base.id] as const // [8453]
export const ALLOWED_CHAIN = base

// ═══════════════════════════════════════════════════════════════════════════════
// BASESCAN VERIFICATION LINKS
// ═══════════════════════════════════════════════════════════════════════════════

export function getBasescanLink(address: Address, type: 'address' | 'token' = 'address'): string {
  return `https://basescan.org/${type}/${address}`
}

export function getBasescanTxLink(txHash: string): string {
  return `https://basescan.org/tx/${txHash}`
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validates that a chain ID is allowed
 */
export function isAllowedChain(chainId: number): boolean {
  return ALLOWED_CHAIN_IDS.includes(chainId as typeof ALLOWED_CHAIN_IDS[number])
}

/**
 * Validates that an address matches expected contract address
 */
export function isVerifiedContract(address: Address, expectedKey: keyof typeof VERIFIED_CONTRACTS): boolean {
  return address.toLowerCase() === VERIFIED_CONTRACTS[expectedKey].toLowerCase()
}

/**
 * Validates a vault address format (doesn't verify on-chain)
 */
export function isValidVaultAddress(address: string): address is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY WARNINGS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Security messages for UI display
 */
export const SECURITY_MESSAGES = {
  wrongNetwork: 'Please connect to Base network',
  verifyContract: 'Always verify contract addresses on Basescan before interacting',
  nonCustodial: 'Your funds stay in your own vault contract. Meezan cannot access, move, or freeze your money.',
} as const
