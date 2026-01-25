/**
 * Conversion Engine Test / Example
 *
 * This file demonstrates how to use the conversion engine to build
 * a transaction request for converting cbBTC + WETH → USDC
 *
 * This is NOT run as part of the build - it's documentation/verification
 */

import {
  CONVERSION_CONTRACTS,
  CONVERSION_TOKENS,
  buildCommandBytes,
  encodeV3Path,
  encodeSwapExactInInput,
  buildPermitBatchMessage,
  buildConversionPlan,
  buildConversionTx,
  getPermitBatchTypedData,
  applySlippage,
  type ConversionAsset,
} from './conversion-engine'

// ============================================================================
// EXAMPLE: Build a conversion for cbBTC + WETH → USDC
// ============================================================================

function exampleConversion() {
  // 1. Define assets to convert (simulating post-withdrawal balances)
  const assets: ConversionAsset[] = [
    {
      id: 'cbBTC',
      address: CONVERSION_TOKENS.cbBTC,
      amount: BigInt('123000'), // 0.00123 cbBTC (8 decimals)
      decimals: 8,
    },
    {
      id: 'WETH',
      address: CONVERSION_TOKENS.WETH,
      amount: BigInt('45600000000000000'), // 0.0456 WETH (18 decimals)
      decimals: 18,
    },
  ]

  // 2. Simulate reading nonces from Permit2 (in production, read from chain)
  const nonces = new Map<`0x${string}`, number>()
  nonces.set(CONVERSION_TOKENS.cbBTC, 0)
  nonces.set(CONVERSION_TOKENS.WETH, 0)

  // 3. Build conversion plan
  const plan = buildConversionPlan(assets, nonces, 100, 1800)

  console.log('=== Conversion Plan ===')
  console.log('Assets:', plan.assets.length)
  console.log('Quotes:', plan.quotes.length)
  console.log('Deadline:', plan.deadline.toString())

  // 4. Get typed data for signing (user would sign this in wallet)
  const typedData = getPermitBatchTypedData(plan.permitBatch)

  console.log('\n=== EIP-712 Typed Data ===')
  console.log('Domain:', JSON.stringify(typedData.domain, null, 2))
  console.log('Primary Type:', typedData.primaryType)
  console.log('Message spender:', typedData.message.spender)
  console.log('Message details count:', typedData.message.details.length)

  // 5. Simulate signature (in production, this comes from wallet)
  const mockSignature = '0x' + '00'.repeat(65) as `0x${string}`

  // 6. Build transaction request
  const recipient = '0x1234567890123456789012345678901234567890' as `0x${string}`
  const txRequest = buildConversionTx(plan, recipient, mockSignature)

  console.log('\n=== Transaction Request ===')
  console.log('To:', txRequest.to)
  console.log('Value:', txRequest.value.toString())
  console.log('Data length:', txRequest.data.length, 'chars')
  console.log('Data preview:', txRequest.data.slice(0, 66) + '...')

  return { plan, typedData, txRequest }
}

// ============================================================================
// EXAMPLE: Path encoding
// ============================================================================

function examplePathEncoding() {
  console.log('\n=== Path Encoding Examples ===')

  // cbBTC → USDC via 0.3% pool
  const path1 = encodeV3Path(CONVERSION_TOKENS.cbBTC, 3000, CONVERSION_TOKENS.USDC)
  console.log('cbBTC → USDC (0.3%):', path1)
  console.log('  Length:', (path1.length - 2) / 2, 'bytes') // Should be 43 bytes

  // WETH → USDC via 0.05% pool
  const path2 = encodeV3Path(CONVERSION_TOKENS.WETH, 500, CONVERSION_TOKENS.USDC)
  console.log('WETH → USDC (0.05%):', path2)
  console.log('  Length:', (path2.length - 2) / 2, 'bytes')
}

// ============================================================================
// EXAMPLE: Command encoding
// ============================================================================

function exampleCommandEncoding() {
  console.log('\n=== Command Encoding Examples ===')

  // Single swap
  const singleSwap = buildCommandBytes([0x00])
  console.log('Single V3_SWAP_EXACT_IN:', singleSwap)

  // Permit + two swaps (our typical flow)
  const permitAndSwaps = buildCommandBytes([0x0a, 0x00, 0x00])
  console.log('PERMIT2_PERMIT_BATCH + 2x V3_SWAP_EXACT_IN:', permitAndSwaps)
}

// ============================================================================
// EXAMPLE: Slippage calculation
// ============================================================================

function exampleSlippage() {
  console.log('\n=== Slippage Examples ===')

  const amountOut = BigInt('100000000') // 100 USDC (6 decimals)

  const min1pct = applySlippage(amountOut, 100)
  console.log('100 USDC with 1% slippage: min', (Number(min1pct) / 1e6).toFixed(2), 'USDC')

  const min05pct = applySlippage(amountOut, 50)
  console.log('100 USDC with 0.5% slippage: min', (Number(min05pct) / 1e6).toFixed(2), 'USDC')
}

// ============================================================================
// RUN EXAMPLES
// ============================================================================

// Uncomment to run in development:
// examplePathEncoding()
// exampleCommandEncoding()
// exampleSlippage()
// exampleConversion()

// Export for potential test runner
export { exampleConversion, examplePathEncoding, exampleCommandEncoding, exampleSlippage }

// ============================================================================
// SUMMARY
// ============================================================================

/**
 * CONVERSION ENGINE SUMMARY
 *
 * How many prompts expected:
 * - Best case (user has Permit2 approvals): 2 prompts
 *   1. Sign permit batch (signature, no gas)
 *   2. Execute Universal Router (transaction)
 *
 * - First time (no Permit2 approvals): 4 prompts
 *   1. Approve cbBTC → Permit2 (transaction)
 *   2. Approve WETH → Permit2 (transaction)
 *   3. Sign permit batch (signature, no gas)
 *   4. Execute Universal Router (transaction)
 *
 * What happens on signature failure:
 * - User declines → "Authorization cancelled. Your assets are still in your wallet."
 * - Signature expired → "Authorization expired. Please try again."
 * - No state changes, user can retry immediately
 *
 * What happens on tx revert:
 * - Slippage exceeded → "Conversion didn't complete. Market moved. Try again."
 * - Deadline expired → "Conversion didn't complete. Please try again."
 * - User still has original assets in wallet
 * - Atomic: either all swaps succeed or all fail
 *
 * How Base addresses are validated:
 * - All addresses are hardcoded constants (not dynamic input)
 * - Sources verified from:
 *   - Uniswap V3 Deployments: docs.uniswap.org
 *   - Permit2 GitHub: github.com/Uniswap/permit2
 *   - Token addresses: Basescan verified contracts
 * - Verification date documented in source
 * - No user-provided addresses accepted
 */
