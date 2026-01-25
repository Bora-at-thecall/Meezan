/**
 * MeezanVaultV3 and MeezanFactoryV3 Contract Configuration
 *
 * V3 adds "Withdraw as USDC" functionality:
 * - Path A: Direct withdrawal (withdrawAll) - escape hatch, always works
 * - Path B: Instant atomic conversion (convertAndWithdraw)
 * - Path C: Background conversion (requestConversion + executeConversion) - DISABLED in V3 Lite
 *
 * IMPORTANT: Addresses must be sourced from security.ts and chain-locked to Base.
 *
 * STATUS: V3 LITE is LIVE on Base mainnet (2026-01-25)
 *         - Instant conversion: ENABLED
 *         - Direct withdrawal: ENABLED
 *         - Background conversion: DISABLED (executor=0x0)
 */

import { type Address } from 'viem'
import { VERIFIED_CONTRACTS } from './security'
import { ASSETS, type AssetId, ASSET_LIST } from './assets'

// ═══════════════════════════════════════════════════════════════════════════════
// V3 CONTRACT ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * V3 Mainnet addresses - DEPLOYED 2026-01-25
 * TX: 0x9b266c00a1299d379592214608ecc67855b1ac98b648bfad02bbf3fae98a6fc9
 */
export const CONTRACTS_V3_MAINNET = {
  // Factory V3 - DEPLOYED ON MAINNET
  // V3 Lite: executor=0x0 (background conversion disabled, instant conversion only)
  factoryV3: '0x4194376c40a80cbeb2d0e37be9083307c05010f7' as Address,

  // Swap Router (same as v1/v2)
  swapRouter: VERIFIED_CONTRACTS.swapRouter,

  // USDC (stablecoin for all vaults)
  usdc: VERIFIED_CONTRACTS.usdc,
} as const

/**
 * V3 Testnet addresses - Base Sepolia (Chain ID: 84532)
 * Deployed 2026-01-25 for integration testing
 */
export const CONTRACTS_V3_SEPOLIA = {
  factoryV3: '0x0E3C02d62C4901A5cEb7D71409348eB75c345B5A' as Address,
  exampleVault: '0x04a5cf027DF2813d027848369822d97Fee86D2dE' as Address,

  // Mocks (test-only)
  mockWBTC: '0x11C66cC0d5B9eFB983541Aa4da35bAf2FDACcDa2' as Address,
  mockBtcFeed: '0x9BE1d65c8C1D5fb054c0506CBe3d4Fc578793EDb' as Address,
  mockEthFeed: '0xaFC433d9c19eF3887d89e7c4B6179A7e101ba448' as Address,
  mockUsdcFeed: '0x034E0BBdc1164440241Ef04AeDac9C716d51347c' as Address,

  // Real Sepolia addresses
  swapRouter: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4' as Address,
  weth: '0x4200000000000000000000000000000000000006' as Address,
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
} as const

// Use mainnet addresses for production (will be null until deployed)
export const CONTRACTS_V3 = CONTRACTS_V3_MAINNET

// ═══════════════════════════════════════════════════════════════════════════════
// MEEZANFACTORYV3 ABI
// ═══════════════════════════════════════════════════════════════════════════════

export const FACTORY_V3_ABI = [
  // Create vault
  {
    name: 'createVault',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'assets',
        type: 'tuple[]',
        components: [
          { name: 'token', type: 'address' },
          { name: 'priceFeed', type: 'address' },
          { name: 'poolFee', type: 'uint24' },
          { name: 'targetWeightBps', type: 'uint16' },
        ],
      },
      { name: 'stablecoin', type: 'address' },
      { name: 'driftThresholdBps', type: 'uint16' },
    ],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  // Get vault by full config
  {
    name: 'getVault',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      {
        name: 'assets',
        type: 'tuple[]',
        components: [
          { name: 'token', type: 'address' },
          { name: 'priceFeed', type: 'address' },
          { name: 'poolFee', type: 'uint24' },
          { name: 'targetWeightBps', type: 'uint16' },
        ],
      },
      { name: 'stablecoin', type: 'address' },
      { name: 'driftThresholdBps', type: 'uint16' },
    ],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  // Get vault by config hash
  {
    name: 'getVaultByHash',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'configHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  // Swap router
  {
    name: 'swapRouter',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  // Conversion executor
  {
    name: 'conversionExecutor',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  // Vault count
  {
    name: 'vaultCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'count', type: 'uint256' }],
  },
  // Events
  {
    name: 'VaultV3Deployed',
    type: 'event',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'assetCount', type: 'uint8', indexed: false },
      { name: 'driftThresholdBps', type: 'uint16', indexed: false },
      { name: 'configHash', type: 'bytes32', indexed: false },
    ],
  },
] as const

// ═══════════════════════════════════════════════════════════════════════════════
// MEEZANVAULTV3 ABI
// ═══════════════════════════════════════════════════════════════════════════════

export const VAULT_V3_ABI = [
  // ─────────────────────────────────────────────────────────────────────────────
  // Asset Configuration (read-only) - Same as V2
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'assetCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'assets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'index', type: 'uint8' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'allAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    name: 'targetWeightBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'index', type: 'uint8' }],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    name: 'allTargetWeights',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16[]' }],
  },
  {
    name: 'stablecoinIndex',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'driftThresholdBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Holdings and Values - Same as V2
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'holdings',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'balances', type: 'uint256[]' }],
  },
  {
    name: 'getUsdValues',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'values', type: 'uint256[]' }],
  },
  {
    name: 'totalUsdValue',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Current Weights and Drift - Same as V2
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'allCurrentWeights',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'weights', type: 'uint16[]' }],
  },
  {
    name: 'portfolioDriftBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    name: 'assetDriftBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'index', type: 'uint8' }],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    name: 'needsRebalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Ownership - Same as V2
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'pendingOwner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'acceptOwnership',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // State - Same as V2
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'lastRebalanceAt',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    name: 'autoRebalanceEnabled',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // V3 Conversion State (NEW)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'conversionExecutor',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'conversionRequested',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'backgroundConversionDisabled',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // V3 Conversion Helper (NEW)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'getConversionAssetOrder',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'tokens', type: 'address[]' },
      { name: 'indices', type: 'uint8[]' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Owner Actions - Same as V2
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetIndex', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'depositAndRebalance',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetIndex', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetIndex', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'withdrawAll',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'rebalance',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // V3 Conversion Actions (NEW)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Path B: Instant atomic conversion to USDC + withdrawal
   * @param minAmountsOut Minimum USDC amounts for each non-stablecoin swap
   *                      Order matches getConversionAssetOrder()
   */
  {
    name: 'convertAndWithdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'minAmountsOut', type: 'uint256[]' }],
    outputs: [],
  },

  /**
   * Path C Step 1: Request background conversion
   * Sets conversionRequested = true for executor to process
   */
  {
    name: 'requestConversion',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  /**
   * Path C Step 2: Execute background conversion (executor only)
   * @param minAmountsOut Minimum USDC amounts for each swap
   */
  {
    name: 'executeConversion',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'minAmountsOut', type: 'uint256[]' }],
    outputs: [],
  },

  /**
   * Cancel pending conversion request
   */
  {
    name: 'cancelConversion',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  /**
   * Permanently disable background conversion for this vault
   * Auto-cancels any pending conversion
   */
  {
    name: 'disableBackgroundConversion',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  /**
   * Re-enable background conversion
   */
  {
    name: 'enableBackgroundConversion',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Events - V2 + V3 additions
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Deposit',
    type: 'event',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Withdraw',
    type: 'event',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Rebalanced',
    type: 'event',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'preDriftBps', type: 'uint16', indexed: false },
      { name: 'swapsExecuted', type: 'uint8', indexed: false },
      { name: 'timestamp', type: 'uint64', indexed: false },
    ],
  },
  {
    name: 'OwnershipTransferStarted',
    type: 'event',
    inputs: [
      { name: 'currentOwner', type: 'address', indexed: true },
      { name: 'pendingOwner', type: 'address', indexed: true },
    ],
  },
  {
    name: 'OwnershipTransferred',
    type: 'event',
    inputs: [
      { name: 'previousOwner', type: 'address', indexed: true },
      { name: 'newOwner', type: 'address', indexed: true },
    ],
  },
  // V3 Conversion Events
  {
    name: 'ConversionRequested',
    type: 'event',
    inputs: [{ name: 'owner', type: 'address', indexed: true }],
  },
  {
    name: 'ConversionExecuted',
    type: 'event',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'totalUSDC', type: 'uint256', indexed: false },
      { name: 'cbBTCConverted', type: 'uint256', indexed: false },
      { name: 'wethConverted', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'ConversionCancelled',
    type: 'event',
    inputs: [{ name: 'caller', type: 'address', indexed: true }],
  },
  {
    name: 'BackgroundConversionDisabled',
    type: 'event',
    inputs: [{ name: 'owner', type: 'address', indexed: true }],
  },
  {
    name: 'BackgroundConversionEnabled',
    type: 'event',
    inputs: [{ name: 'owner', type: 'address', indexed: true }],
  },
] as const

// ═══════════════════════════════════════════════════════════════════════════════
// ASSET CONFIG BUILDER (same pattern as V2)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Asset configuration for MeezanVaultV3 constructor
 */
export interface AssetConfigV3 {
  token: Address
  priceFeed: Address
  poolFee: number
  targetWeightBps: number
}

/**
 * Build asset config array for V3 vault creation
 * @param allocations Map of asset ID to weight in percentage (0-100)
 * @returns Array of AssetConfig for contract call
 */
export function buildAssetConfigV3(
  allocations: Record<AssetId, number>
): AssetConfigV3[] {
  const configs: AssetConfigV3[] = []

  for (const assetId of ASSET_LIST) {
    const weight = allocations[assetId]
    if (weight > 0) {
      const asset = ASSETS[assetId]
      configs.push({
        token: asset.tokenAddress,
        priceFeed: asset.priceFeedAddress,
        poolFee: asset.poolFee,
        targetWeightBps: weight * 100, // Convert percentage to basis points
      })
    }
  }

  return configs
}

/**
 * Find the stablecoin index in the asset config array
 */
export function findStablecoinIndexV3(configs: AssetConfigV3[]): number {
  const usdcAddress = VERIFIED_CONTRACTS.usdc.toLowerCase()
  return configs.findIndex(c => c.token.toLowerCase() === usdcAddress)
}

// ═══════════════════════════════════════════════════════════════════════════════
// V3 CONVERSION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Conversion state for a V3 vault
 */
export interface ConversionStateV3 {
  /** Address of the conversion executor (immutable per vault) */
  conversionExecutor: Address | null
  /** Whether a conversion is currently requested */
  conversionRequested: boolean
  /** Whether background conversion is permanently disabled */
  backgroundConversionDisabled: boolean
  /** Whether instant conversion (convertAndWithdraw) is available */
  canConvertInstantly: boolean
  /** Whether background conversion can be requested */
  canRequestBackground: boolean
}

/**
 * Asset order info for building minAmountsOut array
 */
export interface ConversionAssetOrder {
  /** Token addresses in conversion order (excludes stablecoin) */
  tokens: Address[]
  /** Asset indices in the vault's asset array */
  indices: number[]
}

/**
 * Calculate minimum output amounts for conversion with slippage protection
 * @param usdValues USD values of each non-stablecoin asset
 * @param slippageBps Slippage tolerance in basis points (e.g., 100 = 1%)
 * @returns Array of minimum USDC amounts (6 decimals)
 */
export function calculateMinAmountsOut(
  usdValues: bigint[],
  slippageBps: number = 100
): bigint[] {
  // USDC has 6 decimals, USD values are in 18 decimals
  const USD_TO_USDC_FACTOR = BigInt(1e12) // 18 - 6 = 12

  return usdValues.map(usdValue => {
    // Convert from 18 decimals to 6 decimals
    const usdcValue = usdValue / USD_TO_USDC_FACTOR

    // Apply slippage: minOut = value * (10000 - slippageBps) / 10000
    const minOut = (usdcValue * BigInt(10000 - slippageBps)) / BigInt(10000)

    return minOut
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// VAULT STATUS CHECK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if V3 factory is available on mainnet
 * Returns false until V3 is deployed to mainnet
 */
export function isV3AvailableOnMainnet(): boolean {
  return CONTRACTS_V3.factoryV3 !== null
}

/**
 * Get the appropriate factory address based on chain
 * @param chainId The chain ID to check
 * @returns Factory address or null if not available
 */
export function getV3FactoryAddress(chainId: number): Address | null {
  if (chainId === 8453) {
    // Base mainnet
    return CONTRACTS_V3_MAINNET.factoryV3
  } else if (chainId === 84532) {
    // Base Sepolia
    return CONTRACTS_V3_SEPOLIA.factoryV3
  }
  return null
}
