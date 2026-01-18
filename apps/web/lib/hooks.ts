'use client'

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { CONTRACTS, FACTORY_ABI, VAULT_ABI, ERC20_ABI, ALLOCATION_PRESETS } from './contracts'

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

// Hook to read vault state
export function useVaultState(vaultAddress: Address | null) {
  const enabled = !!vaultAddress

  const { data: holdings } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_ABI,
    functionName: 'holdings',
    query: { enabled },
  })

  const { data: usdValues } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_ABI,
    functionName: 'getUsdValues',
    query: { enabled },
  })

  const { data: currentAllocations } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_ABI,
    functionName: 'currentAllocationsBps',
    query: { enabled },
  })

  const { data: targetAllocations } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_ABI,
    functionName: 'targetAllocations',
    query: { enabled },
  })

  const { data: drift } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_ABI,
    functionName: 'driftBps',
    query: { enabled },
  })

  const { data: allocationId } = useReadContract({
    address: vaultAddress!,
    abi: VAULT_ABI,
    functionName: 'allocation',
    query: { enabled },
  })

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

  // Get allocation preset info
  const allocation = allocationId !== undefined ? ALLOCATION_PRESETS[Number(allocationId)] : null

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
    allocation,
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
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const withdraw = () => {
    if (!vaultAddress) return

    writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'withdrawAll',
    })
  }

  return {
    withdraw,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
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

// Hook to get user's USDC balance
export function useUsdcBalance() {
  const { address } = useAccount()

  const { data: balance, refetch } = useReadContract({
    address: CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  return {
    balance: balance ?? BigInt(0),
    formatted: balance ? formatUnits(balance, 6) : '0',
    refetch,
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
