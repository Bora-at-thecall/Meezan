/**
 * Asset Universe for Meezan v2 on Base
 *
 * Phase 1: BTC, ETH, USDC (Base mainnet)
 * Future: SOL (via Solana vault), LINK/ARB (via Arbitrum vault)
 */

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  description: string;
  decimals: number;
  // Base mainnet addresses
  tokenAddress: `0x${string}`;
  priceFeedAddress: `0x${string}`;
  poolFee: number; // Uniswap V3 pool fee in basis points (500 = 0.05%)
  color: string; // For visualization
}

export const ASSETS: Record<string, Asset> = {
  BTC: {
    id: 'BTC',
    symbol: 'BTC',
    name: 'Bitcoin',
    description: 'Digital gold, store of value',
    decimals: 8,
    tokenAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', // cbBTC on Base
    priceFeedAddress: '0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D', // BTC/USD
    poolFee: 500,
    color: '#F7931A', // Bitcoin orange
  },
  ETH: {
    id: 'ETH',
    symbol: 'ETH',
    name: 'Ethereum',
    description: 'Smart contract platform',
    decimals: 18,
    tokenAddress: '0x4200000000000000000000000000000000000006', // WETH on Base
    priceFeedAddress: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', // ETH/USD
    poolFee: 500,
    color: '#627EEA', // Ethereum purple
  },
  USDC: {
    id: 'USDC',
    symbol: 'USDC',
    name: 'USD Coin',
    description: 'Stability and liquidity',
    decimals: 6,
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
    priceFeedAddress: '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B', // USDC/USD
    poolFee: 500,
    color: '#2775CA', // USDC blue
  },
};

// Available assets for v2 on Base
export const ASSET_LIST = ['BTC', 'ETH', 'USDC'] as const;
export type AssetId = (typeof ASSET_LIST)[number];

// Get asset by ID
export function getAsset(id: AssetId): Asset {
  return ASSETS[id];
}

// All current assets are available (no placeholders)
export function isAssetAvailable(id: AssetId): boolean {
  return ASSET_LIST.includes(id);
}

// Get available assets
export function getAvailableAssets(): Asset[] {
  return ASSET_LIST.map(getAsset);
}

/**
 * Portfolio Templates
 * Pre-configured allocations for common use cases
 */

export interface PortfolioTemplate {
  id: string;
  name: string;
  description: string;
  allocations: Record<AssetId, number>; // Weights in percentage (0-100)
  driftThreshold: number; // In basis points
  recommended?: boolean;
}

export const PORTFOLIO_TEMPLATES: PortfolioTemplate[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Equal crypto exposure with stability buffer',
    allocations: {
      BTC: 40,
      ETH: 40,
      USDC: 20,
    },
    driftThreshold: 500, // 5%
    recommended: true,
  },
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'Lower volatility, higher stability',
    allocations: {
      BTC: 25,
      ETH: 25,
      USDC: 50,
    },
    driftThreshold: 500, // 5%
  },
  {
    id: 'growth',
    name: 'Growth',
    description: 'Maximum crypto exposure',
    allocations: {
      BTC: 50,
      ETH: 50,
      USDC: 0,
    },
    driftThreshold: 800, // 8%
  },
  {
    id: 'btc-focused',
    name: 'BTC Heavy',
    description: 'Bitcoin-dominant allocation',
    allocations: {
      BTC: 60,
      ETH: 20,
      USDC: 20,
    },
    driftThreshold: 500, // 5%
  },
  {
    id: 'eth-focused',
    name: 'ETH Heavy',
    description: 'Ethereum-dominant allocation',
    allocations: {
      BTC: 20,
      ETH: 60,
      USDC: 20,
    },
    driftThreshold: 500, // 5%
  },
];

// Get active allocations (non-zero) from a template
export function getActiveAllocations(
  allocations: Record<AssetId, number>
): { assetId: AssetId; weight: number }[] {
  return ASSET_LIST.filter((id) => allocations[id] > 0).map((id) => ({
    assetId: id,
    weight: allocations[id],
  }));
}

// Validate allocations sum to 100
export function validateAllocations(allocations: Record<AssetId, number>): {
  valid: boolean;
  sum: number;
  error?: string;
} {
  const sum = Object.values(allocations).reduce((a, b) => a + b, 0);
  const activeCount = Object.values(allocations).filter((v) => v > 0).length;

  if (sum !== 100) {
    return { valid: false, sum, error: `Allocations must sum to 100% (currently ${sum}%)` };
  }
  if (activeCount < 2) {
    return { valid: false, sum, error: 'At least 2 assets must be selected' };
  }
  return { valid: true, sum };
}

// Convert percentage allocations to basis points for contract
export function allocationsToBps(allocations: Record<AssetId, number>): number[] {
  return ASSET_LIST.map((id) => allocations[id] * 100);
}

/**
 * Drift Threshold Presets
 */

export interface DriftPreset {
  id: string;
  name: string;
  value: number; // In basis points
  description: string;
  frequencyHint: string;
}

export const DRIFT_PRESETS: DriftPreset[] = [
  {
    id: 'tight',
    name: 'Tight',
    value: 300, // 3%
    description: 'Strict discipline, more rebalancing activity',
    frequencyHint: 'May trigger weekly in volatile markets',
  },
  {
    id: 'standard',
    name: 'Standard',
    value: 500, // 5%
    description: 'Balanced discipline and efficiency',
    frequencyHint: 'Typically triggers monthly',
  },
  {
    id: 'relaxed',
    name: 'Relaxed',
    value: 1000, // 10%
    description: 'Minimal activity, accept more drift',
    frequencyHint: 'May go months without triggering',
  },
];

export function getDriftPreset(value: number): DriftPreset | undefined {
  return DRIFT_PRESETS.find((p) => p.value === value);
}

export function formatDriftThreshold(bps: number): string {
  return `${(bps / 100).toFixed(0)}%`;
}
