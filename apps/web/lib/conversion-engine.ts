/**
 * Meezan Conversion Engine
 *
 * Converts withdrawn assets (cbBTC, WETH) to USDC using:
 * - Uniswap Universal Router for batched execution
 * - Permit2 for gasless token approvals
 *
 * All contract addresses are hardcoded and verified against official sources.
 * No dynamic token/address input is accepted.
 */

import { type Address, type Hex, encodeAbiParameters, encodeFunctionData, parseAbiParameters } from 'viem'

// ============================================================================
// VERIFIED CONTRACT ADDRESSES - BASE MAINNET (Chain ID: 8453)
// ============================================================================
//
// Sources:
// - Universal Router: https://docs.uniswap.org/contracts/v3/reference/deployments/base-deployments
// - Permit2: https://github.com/Uniswap/permit2 (canonical deployment)
// - QuoterV2: https://docs.uniswap.org/contracts/v3/reference/deployments/base-deployments
// - Tokens: Verified on Basescan
//
// Verification date: 2026-01-24
// ============================================================================

export const CONVERSION_CONTRACTS = {
  /** Universal Router - handles batched swaps with Permit2 */
  universalRouter: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD' as Address,

  /** Permit2 - gasless approval via signatures */
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,

  /** QuoterV2 - on-chain quote fallback */
  quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as Address,
} as const

export const CONVERSION_TOKENS = {
  /** Coinbase Wrapped BTC - 8 decimals */
  cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' as Address,

  /** Wrapped Ether - 18 decimals */
  WETH: '0x4200000000000000000000000000000000000006' as Address,

  /** USD Coin - 6 decimals */
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
} as const

/** Pool fees for direct swaps (basis points * 100) */
export const POOL_FEES = {
  'cbBTC/USDC': 3000, // 0.3%
  'WETH/USDC': 500,   // 0.05%
} as const

// ============================================================================
// UNIVERSAL ROUTER COMMAND ENCODING
// ============================================================================

/** Universal Router command bytes */
const UR_COMMANDS = {
  V3_SWAP_EXACT_IN: 0x00,
  PERMIT2_PERMIT_BATCH: 0x0a,
} as const

/**
 * Build command bytes for Universal Router execute()
 * @param commands Array of command bytes
 * @returns Hex-encoded command string
 */
export function buildCommandBytes(commands: number[]): Hex {
  const hex = commands.map((c) => c.toString(16).padStart(2, '0')).join('')
  return `0x${hex}` as Hex
}

/**
 * Encode V3 swap path: tokenIn (20 bytes) + fee (3 bytes) + tokenOut (20 bytes)
 * @param tokenIn Input token address
 * @param fee Pool fee in hundredths of a bip (e.g., 3000 = 0.3%)
 * @param tokenOut Output token address
 * @returns Encoded path bytes
 */
export function encodeV3Path(tokenIn: Address, fee: number, tokenOut: Address): Hex {
  // Remove 0x prefix, pad fee to 6 hex chars (3 bytes)
  const tokenInHex = tokenIn.slice(2).toLowerCase()
  const feeHex = fee.toString(16).padStart(6, '0')
  const tokenOutHex = tokenOut.slice(2).toLowerCase()
  return `0x${tokenInHex}${feeHex}${tokenOutHex}` as Hex
}

/**
 * Encode V3_SWAP_EXACT_IN input for Universal Router
 */
export function encodeSwapExactInInput(
  recipient: Address,
  amountIn: bigint,
  amountOutMin: bigint,
  path: Hex,
  payerIsUser: boolean
): Hex {
  return encodeAbiParameters(
    parseAbiParameters('address, uint256, uint256, bytes, bool'),
    [recipient, amountIn, amountOutMin, path, payerIsUser]
  )
}

// ============================================================================
// PERMIT2 TYPES AND ENCODING
// ============================================================================

/** Permit2 EIP-712 domain - NOTE: no "version" field per Permit2 spec */
export const PERMIT2_DOMAIN = {
  name: 'Permit2',
  chainId: 8453, // Base
  verifyingContract: CONVERSION_CONTRACTS.permit2,
} as const

/** Permit2 EIP-712 types for batch permit */
export const PERMIT2_TYPES = {
  PermitBatch: [
    { name: 'details', type: 'PermitDetails[]' },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
  PermitDetails: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' },
  ],
} as const

/** Single token permit details */
export interface PermitDetails {
  token: Address
  amount: bigint // will be cast to uint160
  expiration: number // uint48
  nonce: number // uint48
}

/** Batch permit structure */
export interface PermitBatch {
  details: PermitDetails[]
  spender: Address
  sigDeadline: bigint
}

/**
 * Build Permit2 batch message for EIP-712 signing
 */
export function buildPermitBatchMessage(
  tokens: { address: Address; amount: bigint; nonce: number }[],
  spender: Address,
  deadlineSeconds: number = 1800 // 30 minutes
): PermitBatch {
  const now = Math.floor(Date.now() / 1000)
  const expiration = now + deadlineSeconds
  const sigDeadline = BigInt(now + deadlineSeconds)

  return {
    details: tokens.map((t) => ({
      token: t.address,
      amount: t.amount,
      expiration,
      nonce: t.nonce,
    })),
    spender,
    sigDeadline,
  }
}

/**
 * Encode PERMIT2_PERMIT_BATCH input for Universal Router
 * The permit batch struct + signature are ABI-encoded together
 */
export function encodePermitBatchInput(permitBatch: PermitBatch, signature: Hex): Hex {
  // Encode the PermitBatch struct
  const detailsEncoded = permitBatch.details.map((d) => ({
    token: d.token,
    amount: d.amount,
    expiration: d.expiration,
    nonce: d.nonce,
  }))

  // The Universal Router expects: abi.encode(IAllowanceTransfer.PermitBatch, bytes signature)
  // PermitBatch = (PermitDetails[] details, address spender, uint256 sigDeadline)
  // PermitDetails = (address token, uint160 amount, uint48 expiration, uint48 nonce)

  return encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          {
            type: 'tuple[]',
            name: 'details',
            components: [
              { type: 'address', name: 'token' },
              { type: 'uint160', name: 'amount' },
              { type: 'uint48', name: 'expiration' },
              { type: 'uint48', name: 'nonce' },
            ],
          },
          { type: 'address', name: 'spender' },
          { type: 'uint256', name: 'sigDeadline' },
        ],
      },
      { type: 'bytes' },
    ],
    [
      {
        details: detailsEncoded,
        spender: permitBatch.spender,
        sigDeadline: permitBatch.sigDeadline,
      },
      signature,
    ]
  )
}

// ============================================================================
// UNIVERSAL ROUTER EXECUTE ENCODING
// ============================================================================

/** Universal Router execute function ABI */
export const UNIVERSAL_ROUTER_ABI = [
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
] as const

/** Permit2 allowance function ABI (for reading nonces) */
export const PERMIT2_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
] as const

/** ERC20 approve and allowance ABI */
export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

// ============================================================================
// CONVERSION PLAN BUILDER
// ============================================================================

/** Asset to convert */
export interface ConversionAsset {
  id: 'cbBTC' | 'WETH'
  address: Address
  amount: bigint
  decimals: number
}

/** Quote for a single swap */
export interface SwapQuote {
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  amountOut: bigint
  amountOutMin: bigint
  fee: number
  path: Hex
}

/** Full conversion plan */
export interface ConversionPlan {
  assets: ConversionAsset[]
  quotes: SwapQuote[]
  permitBatch: PermitBatch
  totalUsdcOut: bigint
  totalUsdcOutMin: bigint
  deadline: bigint
}

/** Transaction request ready for wallet */
export interface ConversionTxRequest {
  to: Address
  data: Hex
  value: bigint
}

/**
 * Calculate minimum output with slippage
 * @param amountOut Expected output
 * @param slippageBps Slippage in basis points (100 = 1%)
 */
export function applySlippage(amountOut: bigint, slippageBps: number = 100): bigint {
  return (amountOut * BigInt(10000 - slippageBps)) / BigInt(10000)
}

/**
 * Build swap quotes for conversion assets
 * Uses direct pool paths (no multi-hop for simplicity)
 */
export function buildSwapQuotes(
  assets: ConversionAsset[],
  slippageBps: number = 100
): SwapQuote[] {
  return assets.map((asset) => {
    const fee = asset.id === 'cbBTC' ? POOL_FEES['cbBTC/USDC'] : POOL_FEES['WETH/USDC']
    const path = encodeV3Path(asset.address, fee, CONVERSION_TOKENS.USDC)

    // For now, amountOut is a placeholder - will be replaced with actual quote
    // In production, we'd call QuoterV2 or Uniswap API
    const amountOut = asset.amount // Placeholder
    const amountOutMin = applySlippage(amountOut, slippageBps)

    return {
      tokenIn: asset.address,
      tokenOut: CONVERSION_TOKENS.USDC,
      amountIn: asset.amount,
      amountOut,
      amountOutMin,
      fee,
      path,
    }
  })
}

/**
 * Build complete conversion plan
 */
export function buildConversionPlan(
  assets: ConversionAsset[],
  nonces: Map<Address, number>,
  slippageBps: number = 100,
  deadlineSeconds: number = 1800
): ConversionPlan {
  const quotes = buildSwapQuotes(assets, slippageBps)

  const tokens = assets.map((a) => ({
    address: a.address,
    amount: a.amount,
    nonce: nonces.get(a.address) ?? 0,
  }))

  const permitBatch = buildPermitBatchMessage(
    tokens,
    CONVERSION_CONTRACTS.universalRouter,
    deadlineSeconds
  )

  const totalUsdcOut = quotes.reduce((sum, q) => sum + q.amountOut, BigInt(0))
  const totalUsdcOutMin = quotes.reduce((sum, q) => sum + q.amountOutMin, BigInt(0))

  const now = Math.floor(Date.now() / 1000)
  const deadline = BigInt(now + deadlineSeconds)

  return {
    assets,
    quotes,
    permitBatch,
    totalUsdcOut,
    totalUsdcOutMin,
    deadline,
  }
}

/**
 * Build Universal Router execute transaction
 * @param plan Conversion plan with quotes and permit
 * @param recipient Address to receive USDC
 * @param signature Permit2 batch signature from wallet
 */
export function buildConversionTx(
  plan: ConversionPlan,
  recipient: Address,
  signature: Hex
): ConversionTxRequest {
  // Build command bytes: PERMIT2_PERMIT_BATCH + V3_SWAP_EXACT_IN for each asset
  const commands: number[] = [UR_COMMANDS.PERMIT2_PERMIT_BATCH]
  plan.quotes.forEach(() => commands.push(UR_COMMANDS.V3_SWAP_EXACT_IN))

  const commandBytes = buildCommandBytes(commands)

  // Build inputs array
  const inputs: Hex[] = []

  // First input: permit batch
  inputs.push(encodePermitBatchInput(plan.permitBatch, signature))

  // Following inputs: swap exact in for each quote
  plan.quotes.forEach((quote) => {
    inputs.push(
      encodeSwapExactInInput(
        recipient,
        quote.amountIn,
        quote.amountOutMin,
        quote.path,
        true // payerIsUser = true (router pulls via Permit2)
      )
    )
  })

  // Encode execute call
  const data = encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [commandBytes, inputs, plan.deadline],
  })

  return {
    to: CONVERSION_CONTRACTS.universalRouter,
    data,
    value: BigInt(0),
  }
}

// ============================================================================
// HELPER: GET EIP-712 TYPED DATA FOR SIGNING
// ============================================================================

/**
 * Get typed data object for wallet signing
 * Compatible with viem's signTypedData
 */
export function getPermitBatchTypedData(permitBatch: PermitBatch) {
  return {
    domain: PERMIT2_DOMAIN,
    types: PERMIT2_TYPES,
    primaryType: 'PermitBatch' as const,
    message: {
      details: permitBatch.details.map((d) => ({
        token: d.token,
        amount: d.amount,
        expiration: d.expiration,
        nonce: d.nonce,
      })),
      spender: permitBatch.spender,
      sigDeadline: permitBatch.sigDeadline,
    },
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/** Validate that an address is one of our known tokens */
export function isKnownToken(address: Address): boolean {
  const normalized = address.toLowerCase()
  return Object.values(CONVERSION_TOKENS).some(
    (t) => t.toLowerCase() === normalized
  )
}

/** Get token ID from address */
export function getTokenId(address: Address): 'cbBTC' | 'WETH' | 'USDC' | null {
  const normalized = address.toLowerCase()
  for (const [id, addr] of Object.entries(CONVERSION_TOKENS)) {
    if (addr.toLowerCase() === normalized) {
      return id as 'cbBTC' | 'WETH' | 'USDC'
    }
  }
  return null
}

/** Validate amount fits in uint160 */
export function validateUint160(amount: bigint): boolean {
  const MAX_UINT160 = (BigInt(1) << BigInt(160)) - BigInt(1)
  return amount >= BigInt(0) && amount <= MAX_UINT160
}

// ============================================================================
// QUOTE FETCHING (API + FALLBACK)
// ============================================================================

/** Quote response from Uniswap API */
export interface UniswapQuoteResponse {
  amountOut: string
  gasEstimate: string
}

/** Quote response from our API route */
export interface QuoteApiResponse {
  amountOut: string
  amountOutMin: string
  gasEstimate: string
  source: 'api' | 'estimate'
  error?: string
}

/**
 * Fetch quote from our API route (which proxies to Uniswap)
 * This avoids CORS issues with direct browser calls
 */
export async function fetchSwapQuote(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint
): Promise<{ amountOut: bigint; amountOutMin: bigint; source: 'api' | 'estimate' }> {
  try {
    const response = await fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenIn,
        tokenOut,
        amount: amountIn.toString(),
        chainId: 8453,
      }),
    })

    if (response.ok) {
      const data = (await response.json()) as QuoteApiResponse
      return {
        amountOut: BigInt(data.amountOut),
        amountOutMin: BigInt(data.amountOutMin),
        source: data.source,
      }
    }
  } catch {
    // API failed, return zero (caller should handle)
  }

  // Return zero to indicate failure - caller should show error
  return { amountOut: BigInt(0), amountOutMin: BigInt(0), source: 'estimate' }
}
