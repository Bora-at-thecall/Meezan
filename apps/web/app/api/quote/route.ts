/**
 * Quote API Route
 *
 * Proxies quote requests to Uniswap Routing API to avoid CORS issues.
 * Falls back to on-chain QuoterV2 if API fails.
 * Returns error if both fail (no fabricated estimates).
 */

import { NextRequest, NextResponse } from 'next/server'

// Token addresses for validation (Base mainnet)
const VALID_TOKENS = {
  cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf'.toLowerCase(),
  WETH: '0x4200000000000000000000000000000000000006'.toLowerCase(),
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase(),
}

// Pool fees for direct quotes (basis points * 100)
// cbBTC/USDC: 0.3% pool (3000)
// WETH/USDC: 0.05% pool (500)
const POOL_FEES: Record<string, number> = {
  [VALID_TOKENS.cbBTC]: 3000,
  [VALID_TOKENS.WETH]: 500,
}

// Uniswap V3 QuoterV2 on Base mainnet
const QUOTER_V2_ADDRESS = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a'

// Base RPC endpoints
const BASE_RPC_ENDPOINTS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
]

interface QuoteRequest {
  tokenIn: string
  tokenOut: string
  amount: string
  chainId?: number
}

interface QuoteResponse {
  amountOut: string
  amountOutMin: string
  gasEstimate: string
  source: 'api' | 'onchain'
}

/**
 * Encode quoteExactInputSingle call for QuoterV2
 * Function selector: 0xc6a5026a
 * Parameters: (address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96)
 */
function encodeQuoteExactInputSingle(
  tokenIn: string,
  tokenOut: string,
  fee: number,
  amountIn: bigint
): string {
  // Function selector for quoteExactInputSingle(address,address,uint24,uint256,uint160)
  const selector = 'c6a5026a'

  // Pad addresses to 32 bytes (remove 0x, pad to 64 chars)
  const tokenInPadded = tokenIn.slice(2).toLowerCase().padStart(64, '0')
  const tokenOutPadded = tokenOut.slice(2).toLowerCase().padStart(64, '0')

  // Fee as uint24, padded to 32 bytes
  const feePadded = fee.toString(16).padStart(64, '0')

  // Amount as uint256, padded to 32 bytes
  const amountPadded = amountIn.toString(16).padStart(64, '0')

  // sqrtPriceLimitX96 = 0 (no limit)
  const sqrtPriceLimitPadded = '0'.padStart(64, '0')

  return `0x${selector}${tokenInPadded}${tokenOutPadded}${feePadded}${amountPadded}${sqrtPriceLimitPadded}`
}

/**
 * Call QuoterV2 on-chain via RPC
 */
async function getOnChainQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint
): Promise<bigint | null> {
  const tokenInLower = tokenIn.toLowerCase()
  const fee = POOL_FEES[tokenInLower]

  if (!fee) {
    console.warn('[getOnChainQuote] No pool fee configured for token:', tokenIn)
    return null
  }

  const calldata = encodeQuoteExactInputSingle(tokenIn, tokenOut, fee, amountIn)

  for (const rpcUrl of BASE_RPC_ENDPOINTS) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [
            {
              to: QUOTER_V2_ADDRESS,
              data: calldata,
            },
            'latest',
          ],
        }),
      })

      if (!response.ok) {
        console.warn(`[getOnChainQuote] RPC ${rpcUrl} returned status ${response.status}`)
        continue
      }

      const data = await response.json()

      if (data.error) {
        // QuoterV2 reverts are expected for invalid swaps
        console.warn(`[getOnChainQuote] RPC error from ${rpcUrl}:`, data.error.message || data.error)
        continue
      }

      if (data.result && data.result !== '0x' && data.result.length >= 66) {
        // QuoterV2 returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)
        // We only need the first 32 bytes (amountOut)
        const amountOutHex = data.result.slice(0, 66) // 0x + 64 chars
        const amountOut = BigInt(amountOutHex)

        if (amountOut > BigInt(0)) {
          console.log(`[getOnChainQuote] Success from ${rpcUrl}: ${amountOut.toString()}`)
          return amountOut
        }
      }

      console.warn(`[getOnChainQuote] Invalid or zero result from ${rpcUrl}:`, data.result?.slice(0, 20))
    } catch (error) {
      console.warn(`[getOnChainQuote] RPC ${rpcUrl} failed:`, error)
      continue
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as QuoteRequest

    // Validate token addresses
    const tokenInLower = body.tokenIn.toLowerCase()
    const tokenOutLower = body.tokenOut.toLowerCase()

    const isValidTokenIn = Object.values(VALID_TOKENS).includes(tokenInLower)
    const isValidTokenOut = Object.values(VALID_TOKENS).includes(tokenOutLower)

    if (!isValidTokenIn || !isValidTokenOut) {
      return NextResponse.json(
        { error: 'Invalid token address' },
        { status: 400 }
      )
    }

    // Validate amount
    const amount = BigInt(body.amount)
    if (amount <= BigInt(0)) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      )
    }

    // =========================================================================
    // PRIMARY: Uniswap Routing API
    // =========================================================================
    try {
      const uniswapResponse = await fetch('https://api.uniswap.org/v2/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://app.uniswap.org', // Required by Uniswap API
        },
        body: JSON.stringify({
          tokenIn: body.tokenIn,
          tokenOut: body.tokenOut,
          amount: body.amount,
          type: 'EXACT_INPUT',
          chainId: body.chainId || 8453,
          protocols: ['V3'],
        }),
      })

      if (uniswapResponse.ok) {
        const data = await uniswapResponse.json()
        const amountOut = data.quote || data.amountOut

        if (amountOut) {
          // Apply 1% slippage for amountOutMin
          const amountOutBigInt = BigInt(amountOut)
          const amountOutMin = (amountOutBigInt * BigInt(99)) / BigInt(100)

          const response: QuoteResponse = {
            amountOut: amountOut,
            amountOutMin: amountOutMin.toString(),
            gasEstimate: data.gasEstimate || '200000',
            source: 'api',
          }

          return NextResponse.json(response)
        }
      }
    } catch (apiError) {
      console.warn('[Quote API] Uniswap API failed:', apiError)
    }

    // =========================================================================
    // FALLBACK: On-chain QuoterV2
    // =========================================================================
    console.log('[Quote API] Falling back to on-chain QuoterV2')

    const onChainAmountOut = await getOnChainQuote(
      body.tokenIn,
      body.tokenOut,
      amount
    )

    if (onChainAmountOut !== null && onChainAmountOut > BigInt(0)) {
      // Apply 1% slippage for amountOutMin
      const amountOutMin = (onChainAmountOut * BigInt(99)) / BigInt(100)

      const response: QuoteResponse = {
        amountOut: onChainAmountOut.toString(),
        amountOutMin: amountOutMin.toString(),
        gasEstimate: '250000',
        source: 'onchain',
      }

      return NextResponse.json(response)
    }

    // =========================================================================
    // BOTH FAILED: Return error (no fabricated estimates)
    // =========================================================================
    console.error('[Quote API] Both Uniswap API and on-chain QuoterV2 failed')

    return NextResponse.json(
      { error: 'Unable to get quote. Please try again.' },
      { status: 503 }
    )

  } catch (error) {
    console.error('Quote API error:', error)
    return NextResponse.json(
      { error: 'Failed to get quote' },
      { status: 500 }
    )
  }
}
