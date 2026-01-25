/**
 * V3 Analytics Instrumentation
 *
 * Lightweight event tracking for V3 withdrawal flows.
 * No backend required - just console logging for now.
 * Easy to connect to any analytics service later.
 *
 * Events tracked:
 * - withdraw_success: Successful withdrawal completed
 * - withdraw_failure: Withdrawal transaction failed
 * - withdraw_fallback: User chose fallback option after failure
 * - conversion_requested: Background conversion requested
 * - conversion_cancelled: Background conversion cancelled by user
 * - conversion_executed: Background conversion completed by executor
 * - slippage_exceeded: Instant conversion failed due to slippage
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type V3EventName =
  | 'withdraw_success'
  | 'withdraw_failure'
  | 'withdraw_fallback'
  | 'conversion_requested'
  | 'conversion_cancelled'
  | 'conversion_executed'
  | 'slippage_exceeded'
  | 'dialog_opened'
  | 'dialog_closed'
  | 'path_selected'

export interface V3EventData {
  // Common fields
  path?: 'instant' | 'direct' | 'background'
  chain?: 'mainnet' | 'testnet'

  // Value fields
  totalValueUsd?: number
  assetCount?: number
  estimatedUsdcOut?: number

  // Error fields
  errorMessage?: string
  errorType?: string

  // Fallback fields
  fallbackFrom?: 'instant' | 'background'
  fallbackTo?: 'direct' | 'background'

  // Conversion fields
  slippageBps?: number

  // Timing
  durationMs?: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Set to true to enable console logging of events
 * Set to false in production to silence logs
 */
const LOG_EVENTS = process.env.NODE_ENV === 'development'

/**
 * Future: Add your analytics endpoint here
 * const ANALYTICS_ENDPOINT = process.env.NEXT_PUBLIC_ANALYTICS_URL
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN TRACKING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Track a V3 analytics event
 *
 * @param eventName - The event name
 * @param data - Event-specific data
 *
 * @example
 * trackV3Event('withdraw_success', { path: 'instant', totalValueUsd: 1500 })
 * trackV3Event('slippage_exceeded', { errorMessage: 'Too little received' })
 */
export function trackV3Event(eventName: V3EventName, data?: V3EventData): void {
  const event = {
    event: `v3_${eventName}`,
    timestamp: new Date().toISOString(),
    ...data,
  }

  // Development logging
  if (LOG_EVENTS) {
    console.log('[V3 Analytics]', eventName, data || '')
  }

  // Future: Send to analytics backend
  // if (ANALYTICS_ENDPOINT) {
  //   fetch(ANALYTICS_ENDPOINT, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify(event),
  //   }).catch(() => {}) // Silent failure
  // }

  // Future: Send to window.dataLayer for GTM
  // if (typeof window !== 'undefined' && window.dataLayer) {
  //   window.dataLayer.push(event)
  // }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Track withdrawal dialog opened
 */
export function trackDialogOpened(data: {
  totalValueUsd: number
  assetCount: number
  hasNonUsdcAssets: boolean
  chain: 'mainnet' | 'testnet'
}): void {
  trackV3Event('dialog_opened', {
    totalValueUsd: data.totalValueUsd,
    assetCount: data.assetCount,
    chain: data.chain,
  })
}

/**
 * Track path selection in withdrawal dialog
 */
export function trackPathSelected(path: 'instant' | 'direct' | 'background'): void {
  trackV3Event('path_selected', { path })
}

/**
 * Track successful withdrawal
 */
export function trackWithdrawSuccess(data: {
  path: 'instant' | 'direct' | 'background'
  totalValueUsd: number
  chain: 'mainnet' | 'testnet'
}): void {
  trackV3Event('withdraw_success', data)
}

/**
 * Track withdrawal failure
 */
export function trackWithdrawFailure(data: {
  path: 'instant' | 'direct' | 'background'
  errorMessage: string
  chain: 'mainnet' | 'testnet'
}): void {
  trackV3Event('withdraw_failure', data)
}

/**
 * Track slippage exceeded (specific failure type)
 */
export function trackSlippageExceeded(data: {
  slippageBps: number
  estimatedUsdcOut: number
  chain: 'mainnet' | 'testnet'
}): void {
  trackV3Event('slippage_exceeded', data)
}

/**
 * Track user choosing fallback option
 */
export function trackFallbackChosen(data: {
  from: 'instant' | 'background'
  to: 'direct' | 'background'
  reason: string
}): void {
  trackV3Event('withdraw_fallback', {
    fallbackFrom: data.from,
    fallbackTo: data.to,
    errorMessage: data.reason,
  })
}

/**
 * Track background conversion requested
 */
export function trackConversionRequested(data: {
  totalValueUsd: number
  assetCount: number
  chain: 'mainnet' | 'testnet'
}): void {
  trackV3Event('conversion_requested', data)
}

/**
 * Track background conversion cancelled by user
 */
export function trackConversionCancelled(chain: 'mainnet' | 'testnet'): void {
  trackV3Event('conversion_cancelled', { chain })
}

/**
 * Track background conversion executed by protocol
 */
export function trackConversionExecuted(data: {
  totalUsdcReceived: number
  chain: 'mainnet' | 'testnet'
}): void {
  trackV3Event('conversion_executed', {
    totalValueUsd: data.totalUsdcReceived,
    chain: data.chain,
  })
}
