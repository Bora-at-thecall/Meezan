'use client'

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContracts, useBalance } from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { useCallback, useState, useEffect, useMemo } from 'react'
import { CONTRACTS, FACTORY_ABI, VAULT_ABI, ERC20_ABI, ALLOCATION_PRESETS, PRICE_FEED_ABI } from './contracts'

// Polling interval for live price updates (15 seconds)
const POLL_INTERVAL = 15_000

// Hook to check if user has a vault for a specific allocation
export function useUserVault(allocation: number) {
  const { address } = useAccount()

  const { data: vaultAddress, isLoading, refetch } = useReadContract({
    address: CONTRACTS.factory,
    abi: FACTORY_ABI,
    functionName: 'getVault',
    args: address ? [address, allocation] : undefined,
    query: { enabled: !!address && CONTRACTS.factory !== '0x0000000000000000000000000000000000000000' },
  })

  const hasVault = vaultAddress && vaultAddress !== '0x0000000000000000000000000000000000000000'

  return {
    vaultAddress: hasVault ? vaultAddress : null,
    hasVault,
    isLoading,
    refetch,
  }
}

// Hook to create a new vault
export function useCreateVault() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const createVault = (allocation: number) => {
    writeContract({
      address: CONTRACTS.factory,
      abi: FACTORY_ABI,
      functionName: 'createVault',
      args: [allocation],
    })
  }

  return {
    createVault,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

// Hook to read vault state with live updates
export function useVaultState(vaultAddress: Address | null) {
  const enabled = !!vaultAddress
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Read all vault data in parallel
  const { data: holdings, refetch: refetchHoldings, isLoading: holdingsLoading } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_ABI,
    functionName: 'holdings',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: usdValues, refetch: refetchUsdValues, isLoading: usdValuesLoading } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_ABI,
    functionName: 'getUsdValues',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: currentAllocations, refetch: refetchAllocations } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_ABI,
    functionName: 'currentAllocationsBps',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: targetAllocations } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_ABI,
    functionName: 'targetAllocations',
    query: { enabled },
  })

  const { data: drift, refetch: refetchDrift } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_ABI,
    functionName: 'driftBps',
    query: {
      enabled,
      refetchInterval: POLL_INTERVAL,
    },
  })

  const { data: driftThreshold } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_ABI,
    functionName: 'driftThresholdBps',
    query: { enabled },
  })

  // Update lastUpdated when data changes
  useEffect(() => {
    if (usdValues) {
      setLastUpdated(new Date())
    }
  }, [usdValues])

  // Unified refetch function
  const refetch = useCallback(async () => {
    await Promise.all([
      refetchHoldings(),
      refetchUsdValues(),
      refetchAllocations(),
      refetchDrift(),
    ])
    setLastUpdated(new Date())
  }, [refetchHoldings, refetchUsdValues, refetchAllocations, refetchDrift])

  // Calculate USD values (they come as 18 decimal)
  const btcValueUsd = usdValues ? Number(formatUnits(usdValues[0], 18)) : 0
  const usdcValueUsd = usdValues ? Number(formatUnits(usdValues[1], 18)) : 0
  const totalValueUsd = btcValueUsd + usdcValueUsd

  // Get percentages
  const btcPct = currentAllocations ? Number(currentAllocations[0]) / 100 : 0
  const usdcPct = currentAllocations ? Number(currentAllocations[1]) / 100 : 0

  // Get target percentages
  const targetBtcPct = targetAllocations ? Number(targetAllocations[0]) / 100 : 0
  const targetUsdcPct = targetAllocations ? Number(targetAllocations[1]) / 100 : 0

  // Drift in percentage
  const driftPct = drift ? Number(drift) / 100 : 0

  // Drift threshold in percentage (default 5% if not set)
  const driftThresholdPct = driftThreshold ? Number(driftThreshold) / 100 : 5

  // Derive allocation name from target percentages
  const allocationName = targetAllocations
    ? `${Math.round(targetBtcPct)} / ${Math.round(targetUsdcPct)}`
    : null

  const isLoading = holdingsLoading || usdValuesLoading

  return {
    holdings: {
      btc: holdings ? holdings[0] : BigInt(0),
      usdc: holdings ? holdings[1] : BigInt(0),
    },
    values: {
      btc: btcValueUsd,
      usdc: usdcValueUsd,
      total: totalValueUsd,
    },
    allocations: {
      current: { btc: btcPct, usdc: usdcPct },
      target: { btc: targetBtcPct, usdc: targetUsdcPct },
    },
    drift: driftPct,
    driftThreshold: driftThresholdPct,
    allocationName,
    lastUpdated,
    isLoading,
    refetch,
  }
}

// Hook to get live BTC price from Chainlink
export function useBtcPrice() {
  const { data, refetch, isLoading } = useReadContract({
    address: CONTRACTS.btcUsdFeed,
    abi: PRICE_FEED_ABI,
    functionName: 'latestRoundData',
    query: {
      refetchInterval: POLL_INTERVAL,
    },
  })

  // Price is in 8 decimals
  const price = data ? Number(formatUnits(BigInt(data[1].toString()), 8)) : 0
  const updatedAt = data ? new Date(Number(data[3]) * 1000) : null

  return {
    price,
    updatedAt,
    isLoading,
    refetch,
  }
}

// Hook to approve USDC spending
export function useApproveUsdc() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const approve = (spender: Address, amount: bigint) => {
    writeContract({
      address: CONTRACTS.usdc,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, amount],
    })
  }

  return {
    approve,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

// Hook to deposit USDC
export function useDeposit(vaultAddress: Address | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const deposit = (amountUsdc: string) => {
    if (!vaultAddress) return

    const amount = parseUnits(amountUsdc, 6) // USDC has 6 decimals

    writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'depositUSDC',
      args: [amount],
    })
  }

  return {
    deposit,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

// Hook to withdraw all
export function useWithdraw(vaultAddress: Address | null) {
  const { writeContractAsync, data: hash, isPending, error, reset } = useWriteContract()
  const { chain } = useAccount()
  const [localError, setLocalError] = useState<Error | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({
    hash,
  })

  // Combine errors from both write and receipt
  const combinedError = error || receiptError || localError

  // Check if on correct network
  const isWrongNetwork = chain?.id !== 8453

  // Log state changes
  useEffect(() => {
    console.log('useWithdraw state:', { hash, isPending, isSubmitting, isConfirming, isSuccess, chainId: chain?.id, error: combinedError?.message })
  }, [hash, isPending, isSubmitting, isConfirming, isSuccess, chain?.id, combinedError])

  const withdraw = async () => {
    if (!vaultAddress) {
      console.error('useWithdraw: No vault address provided')
      setLocalError(new Error('No vault address'))
      return
    }

    // Check network BEFORE attempting transaction
    if (chain?.id !== 8453) {
      console.error('useWithdraw: Wrong network! Expected Base (8453), got', chain?.id)
      setLocalError(new Error('Please switch to Base network in your wallet'))
      return
    }

    // Reset any previous errors and state
    setLocalError(null)
    reset()
    setIsSubmitting(true)

    console.log('useWithdraw: Calling withdrawAllToUSDC on', vaultAddress, 'chainId:', chain?.id)

    try {
      const txHash = await writeContractAsync({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'withdrawAllToUSDC',
        chainId: 8453, // Base mainnet
      })
      console.log('useWithdraw: TX submitted with hash', txHash)
    } catch (err: any) {
      console.error('useWithdraw: TX failed', err)
      // Handle port disconnected error specifically
      const msg = err?.message || ''
      if (msg.includes('Port disconnected') || msg.includes('disconnected')) {
        setLocalError(new Error('Wallet connection lost. Please check your wallet for any pending transactions, then refresh the page.'))
      } else if (msg.includes('User rejected') || msg.includes('user rejected') || msg.includes('denied')) {
        setLocalError(new Error('Transaction cancelled'))
      } else {
        setLocalError(err as Error)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    withdraw,
    isPending: isPending || isSubmitting,
    isConfirming,
    isSuccess,
    error: combinedError,
    hash,
    isWrongNetwork,
    reset: () => {
      reset()
      setLocalError(null)
      setIsSubmitting(false)
    },
  }
}

// Hook to trigger rebalance
export function useRebalance(vaultAddress: Address | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const rebalance = () => {
    if (!vaultAddress) return

    writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'rebalance',
    })
  }

  return {
    rebalance,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

// Hook to accept vault ownership (after factory deploys)
export function useAcceptOwnership(vaultAddress: Address | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const accept = () => {
    if (!vaultAddress) return

    writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'acceptOwnership',
    })
  }

  return {
    accept,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  }
}

// Hook to get current gas price estimate
export function useGasEstimate() {
  const [gasPrice, setGasPrice] = useState<bigint | null>(null)

  useEffect(() => {
    const fetchGasPrice = async () => {
      try {
        // Import publicClient from tx-orchestrator
        const { publicClient } = await import('./tx-orchestrator')
        const price = await publicClient.getGasPrice()
        setGasPrice(price)
      } catch (error) {
        console.error('Failed to fetch gas price:', error)
      }
    }
    fetchGasPrice()
    const interval = setInterval(fetchGasPrice, 30000) // Update every 30s
    return () => clearInterval(interval)
  }, [])

  // Estimate tx cost in USD (Base is very cheap, typically < $0.01)
  // Assume ~100k gas for complex tx, ETH price ~$3000
  const estimateUsd = (gasUnits: number = 100000): string => {
    if (!gasPrice) return '< $0.01'
    const gasCostWei = gasPrice * BigInt(gasUnits)
    const gasCostEth = Number(gasCostWei) / 1e18
    const ethPrice = 3000 // Approximate, could fetch from oracle
    const usdCost = gasCostEth * ethPrice
    if (usdCost < 0.01) return '< $0.01'
    return `~$${usdCost.toFixed(2)}`
  }

  return { gasPrice, estimateUsd }
}

// Hook to get user's USDC balance
export function useUsdcBalance() {
  const { address, isConnected, chain } = useAccount()
  const [directBalance, setDirectBalance] = useState<bigint | null>(null)

  // Direct RPC call for debugging
  useEffect(() => {
    if (!address) return

    const fetchDirect = async () => {
      try {
        // Direct fetch to RPC
        const response = await fetch('https://mainnet.base.org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [{
              to: CONTRACTS.usdc,
              data: `0x70a08231000000000000000000000000${address.slice(2)}` // balanceOf(address)
            }, 'latest']
          })
        })
        const data = await response.json()
        console.log('[useUsdcBalance] DIRECT RPC response:', data)
        if (data.result) {
          const bal = BigInt(data.result)
          console.log('[useUsdcBalance] DIRECT balance:', bal.toString(), 'formatted:', formatUnits(bal, 6))
          setDirectBalance(bal)
        }
      } catch (err) {
        console.error('[useUsdcBalance] DIRECT RPC error:', err)
      }
    }

    fetchDirect()
  }, [address])

  console.log('[useUsdcBalance] address:', address, 'isConnected:', isConnected, 'chainId:', chain?.id, 'USDC contract:', CONTRACTS.usdc)

  const { data: balance, refetch, isLoading, isError, isFetching, error } = useReadContract({
    address: CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: 8453, // Explicitly use Base mainnet
    query: {
      enabled: !!address,
      retry: 5,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      staleTime: 5_000,
      gcTime: 60_000,
    },
  })

  console.log('[useUsdcBalance] wagmi balance:', balance?.toString(), 'directBalance:', directBalance?.toString(), 'isLoading:', isLoading, 'isFetching:', isFetching, 'isError:', isError, 'error:', error)

  // Use direct balance if wagmi returns 0 but direct call got a value
  const finalBalance = (balance === BigInt(0) && directBalance && directBalance > BigInt(0)) ? directBalance : (balance ?? BigInt(0))

  return {
    balance: finalBalance,
    formatted: finalBalance ? formatUnits(finalBalance, 6) : '0',
    isLoading: isLoading || isFetching,
    isError,
    refetch,
  }
}

// Hook to read native ETH balance for gas checking
export function useEthBalance() {
  const { address } = useAccount()

  const { data, refetch, isLoading, isError } = useBalance({
    address,
    chainId: 8453, // Base mainnet
    query: {
      enabled: !!address,
      staleTime: 10_000,
    },
  })

  // Gas thresholds (in ETH)
  const LOW_GAS_THRESHOLD = 0.001 // ~$3 at typical ETH prices
  const ZERO_GAS_THRESHOLD = 0.0001 // Essentially zero

  const balanceValue = data?.value ?? BigInt(0)
  const balanceEth = parseFloat(formatUnits(balanceValue, 18))
  const formatted = balanceEth.toFixed(6)

  return {
    balance: balanceValue,
    formatted,
    balanceEth,
    isLoading,
    isError,
    refetch,
    // Gas status helpers
    hasEnoughGas: balanceEth >= LOW_GAS_THRESHOLD,
    hasLowGas: balanceEth > ZERO_GAS_THRESHOLD && balanceEth < LOW_GAS_THRESHOLD,
    hasNoGas: balanceEth <= ZERO_GAS_THRESHOLD,
  }
}

// Hook to check USDC allowance
export function useUsdcAllowance(spender: Address | null) {
  const { address } = useAccount()

  const { data: allowance, refetch } = useReadContract({
    address: CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && spender ? [address, spender] : undefined,
    query: { enabled: !!address && !!spender },
  })

  return {
    allowance: allowance ?? BigInt(0),
    refetch,
  }
}

// Oracle health status
export type OracleHealth = 'healthy' | 'stale' | 'unknown'

// Hook to check oracle health (both BTC and USDC feeds)
export function useOracleHealth() {
  const { data: btcData, isLoading: btcLoading } = useReadContract({
    address: CONTRACTS.btcUsdFeed,
    abi: PRICE_FEED_ABI,
    functionName: 'latestRoundData',
    query: { refetchInterval: POLL_INTERVAL },
  })

  const { data: usdcData, isLoading: usdcLoading } = useReadContract({
    address: CONTRACTS.usdcUsdFeed,
    abi: PRICE_FEED_ABI,
    functionName: 'latestRoundData',
    query: { refetchInterval: POLL_INTERVAL },
  })

  const isLoading = btcLoading || usdcLoading

  // Staleness threshold: 1 hour for BTC, 24 hours for stablecoin
  const BTC_STALE_THRESHOLD = 60 * 60 // 1 hour
  const USDC_STALE_THRESHOLD = 24 * 60 * 60 // 24 hours

  const now = Math.floor(Date.now() / 1000)

  const btcUpdatedAt = btcData ? Number(btcData[3]) : 0
  const usdcUpdatedAt = usdcData ? Number(usdcData[3]) : 0

  const btcAge = btcUpdatedAt ? now - btcUpdatedAt : Infinity
  const usdcAge = usdcUpdatedAt ? now - usdcUpdatedAt : Infinity

  const btcHealth: OracleHealth = !btcData ? 'unknown' : btcAge > BTC_STALE_THRESHOLD ? 'stale' : 'healthy'
  const usdcHealth: OracleHealth = !usdcData ? 'unknown' : usdcAge > USDC_STALE_THRESHOLD ? 'stale' : 'healthy'

  // Overall health is the worst of the two
  const overallHealth: OracleHealth =
    btcHealth === 'stale' || usdcHealth === 'stale' ? 'stale' :
    btcHealth === 'unknown' || usdcHealth === 'unknown' ? 'unknown' :
    'healthy'

  return {
    btc: {
      health: btcHealth,
      updatedAt: btcUpdatedAt ? new Date(btcUpdatedAt * 1000) : null,
      ageSeconds: btcAge,
    },
    usdc: {
      health: usdcHealth,
      updatedAt: usdcUpdatedAt ? new Date(usdcUpdatedAt * 1000) : null,
      ageSeconds: usdcAge,
    },
    overall: overallHealth,
    isLoading,
  }
}

// Activity event types
export type VaultActivity = {
  type: 'deposit' | 'withdraw' | 'rebalance'
  timestamp: Date
  txHash: string
  details: {
    amount?: string
    token?: string
    driftBefore?: number
    driftAfter?: number
  }
}

// Hook to fetch vault activity from chain events
export function useVaultActivity(vaultAddress: Address | null) {
  const [activities, setActivities] = useState<VaultActivity[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!vaultAddress) {
      setActivities([])
      return
    }

    const fetchActivity = async () => {
      setIsLoading(true)
      try {
        const { publicClient } = await import('./tx-orchestrator')

        // Fetch last 100 blocks of events (roughly ~5 minutes on Base)
        const currentBlock = await publicClient.getBlockNumber()
        const fromBlock = currentBlock - BigInt(100)

        // Fetch deposit events
        const depositLogs = await publicClient.getLogs({
          address: vaultAddress,
          event: {
            type: 'event',
            name: 'DepositAndAllocated',
            inputs: [
              { name: 'amountUSDC', type: 'uint256', indexed: false },
              { name: 'wbtcBought', type: 'uint256', indexed: false },
              { name: 'usdcSpent', type: 'uint256', indexed: false },
            ],
          },
          fromBlock,
        })

        // Fetch withdraw events
        const withdrawLogs = await publicClient.getLogs({
          address: vaultAddress,
          event: {
            type: 'event',
            name: 'Withdraw',
            inputs: [
              { name: 'owner', type: 'address', indexed: true },
              { name: 'token', type: 'address', indexed: true },
              { name: 'amount', type: 'uint256', indexed: false },
            ],
          },
          fromBlock,
        })

        // Fetch rebalance events
        const rebalanceLogs = await publicClient.getLogs({
          address: vaultAddress,
          event: {
            type: 'event',
            name: 'Rebalanced',
            inputs: [
              { name: 'caller', type: 'address', indexed: true },
              { name: 'sellToken', type: 'address', indexed: true },
              { name: 'buyToken', type: 'address', indexed: true },
              { name: 'amountOut', type: 'uint256', indexed: false },
              { name: 'amountIn', type: 'uint256', indexed: false },
              { name: 'driftBefore', type: 'uint16', indexed: false },
              { name: 'driftAfter', type: 'uint16', indexed: false },
            ],
          },
          fromBlock,
        })

        // Get blocks for timestamps
        const allLogs = [...depositLogs, ...withdrawLogs, ...rebalanceLogs]
        const blockNumbers = [...new Set(allLogs.map(log => log.blockNumber))]
        const blocks = await Promise.all(
          blockNumbers.map(bn => publicClient.getBlock({ blockNumber: bn }))
        )
        const blockTimestamps = new Map(
          blocks.map(b => [b.number, new Date(Number(b.timestamp) * 1000)])
        )

        // Parse deposit events
        const depositActivities: VaultActivity[] = depositLogs.map(log => ({
          type: 'deposit' as const,
          timestamp: blockTimestamps.get(log.blockNumber) || new Date(),
          txHash: log.transactionHash,
          details: {
            amount: formatUnits(log.args.amountUSDC || BigInt(0), 6),
            token: 'USDC',
          },
        }))

        // Parse withdraw events (group by tx hash to consolidate WBTC+USDC)
        const withdrawByTx = new Map<string, VaultActivity>()
        for (const log of withdrawLogs) {
          const existing = withdrawByTx.get(log.transactionHash)
          const token = log.args.token === CONTRACTS.wbtc ? 'BTC' : 'USDC'
          const decimals = token === 'BTC' ? 8 : 6
          const amount = formatUnits(log.args.amount || BigInt(0), decimals)

          if (existing) {
            existing.details.amount = `${existing.details.amount}, ${amount} ${token}`
          } else {
            withdrawByTx.set(log.transactionHash, {
              type: 'withdraw',
              timestamp: blockTimestamps.get(log.blockNumber) || new Date(),
              txHash: log.transactionHash,
              details: {
                amount: `${amount} ${token}`,
              },
            })
          }
        }

        // Parse rebalance events
        const rebalanceActivities: VaultActivity[] = rebalanceLogs.map(log => ({
          type: 'rebalance' as const,
          timestamp: blockTimestamps.get(log.blockNumber) || new Date(),
          txHash: log.transactionHash,
          details: {
            driftBefore: Number(log.args.driftBefore || 0) / 100,
            driftAfter: Number(log.args.driftAfter || 0) / 100,
          },
        }))

        // Combine and sort by timestamp (newest first)
        const allActivities = [
          ...depositActivities,
          ...Array.from(withdrawByTx.values()),
          ...rebalanceActivities,
        ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

        setActivities(allActivities)
      } catch (error) {
        console.error('Failed to fetch vault activity:', error)
        setActivities([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchActivity()
  }, [vaultAddress])

  return { activities, isLoading }
}
