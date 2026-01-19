import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { CONTRACTS, PRICE_FEED_ABI, FACTORY_ABI } from '@/lib/contracts'

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
})

type OracleStatus = {
  name: string
  updatedAt: number
  ageSeconds: number
  price: string
  status: 'ok' | 'stale' | 'error'
}

type StatusResponse = {
  status: 'operational' | 'degraded' | 'down'
  timestamp: number
  checks: {
    btcOracle: OracleStatus
    usdcOracle: OracleStatus
    factory: {
      address: string
      readable: boolean
      status: 'ok' | 'error'
    }
    vaultCount: {
      count: number
      status: 'ok' | 'error'
    }
  }
}

const STALENESS_THRESHOLD = 3600 // 1 hour in seconds

async function checkOracle(address: `0x${string}`, name: string): Promise<OracleStatus> {
  try {
    const result = await client.readContract({
      address,
      abi: PRICE_FEED_ABI,
      functionName: 'latestRoundData',
    })

    const [, answer, , updatedAt] = result as [bigint, bigint, bigint, bigint, bigint]
    const now = Math.floor(Date.now() / 1000)
    const ageSeconds = now - Number(updatedAt)
    const isStale = ageSeconds > STALENESS_THRESHOLD

    return {
      name,
      updatedAt: Number(updatedAt),
      ageSeconds,
      price: (Number(answer) / 1e8).toFixed(2),
      status: isStale ? 'stale' : 'ok',
    }
  } catch {
    return {
      name,
      updatedAt: 0,
      ageSeconds: 0,
      price: '0',
      status: 'error',
    }
  }
}

async function checkFactory(): Promise<{ address: string; readable: boolean; status: 'ok' | 'error' }> {
  try {
    // Try to read tokenA from factory to verify it's accessible
    await client.readContract({
      address: CONTRACTS.factory,
      abi: [
        {
          name: 'tokenA',
          type: 'function',
          stateMutability: 'view',
          inputs: [],
          outputs: [{ type: 'address' }],
        },
      ],
      functionName: 'tokenA',
    })

    return {
      address: CONTRACTS.factory,
      readable: true,
      status: 'ok',
    }
  } catch {
    return {
      address: CONTRACTS.factory,
      readable: false,
      status: 'error',
    }
  }
}

async function getVaultCount(): Promise<{ count: number; status: 'ok' | 'error' }> {
  try {
    // Get VaultDeployed events from factory
    const logs = await client.getLogs({
      address: CONTRACTS.factory,
      event: {
        type: 'event',
        name: 'VaultDeployed',
        inputs: [
          { name: 'owner', type: 'address', indexed: true },
          { name: 'vault', type: 'address', indexed: true },
          { name: 'allocation', type: 'uint8', indexed: false },
        ],
      },
      fromBlock: 40992707n, // Factory deployment block
      toBlock: 'latest',
    })

    return {
      count: logs.length,
      status: 'ok',
    }
  } catch {
    return {
      count: 0,
      status: 'error',
    }
  }
}

function determineOverallStatus(
  btcOracle: OracleStatus,
  usdcOracle: OracleStatus,
  factory: { status: 'ok' | 'error' },
): 'operational' | 'degraded' | 'down' {
  // Down if factory is not readable
  if (factory.status === 'error') {
    return 'down'
  }

  // Down if both oracles are error/stale
  if (
    (btcOracle.status === 'error' || btcOracle.status === 'stale') &&
    (usdcOracle.status === 'error' || usdcOracle.status === 'stale')
  ) {
    return 'down'
  }

  // Degraded if any oracle is stale or error
  if (
    btcOracle.status === 'stale' ||
    btcOracle.status === 'error' ||
    usdcOracle.status === 'stale' ||
    usdcOracle.status === 'error'
  ) {
    return 'degraded'
  }

  return 'operational'
}

export async function GET() {
  const [btcOracle, usdcOracle, factory, vaultCount] = await Promise.all([
    checkOracle(CONTRACTS.btcUsdFeed, 'BTC/USD'),
    checkOracle(CONTRACTS.usdcUsdFeed, 'USDC/USD'),
    checkFactory(),
    getVaultCount(),
  ])

  const overallStatus = determineOverallStatus(btcOracle, usdcOracle, factory)

  const response: StatusResponse = {
    status: overallStatus,
    timestamp: Date.now(),
    checks: {
      btcOracle,
      usdcOracle,
      factory,
      vaultCount,
    },
  }

  return Response.json(response, {
    headers: {
      'Cache-Control': 'public, max-age=60', // Cache for 1 minute
    },
  })
}
