'use client'

import { type Address } from 'viem'

const STORAGE_KEY = 'meezan_vaults'

type VaultStore = {
  [walletAddress: string]: {
    [allocation: number]: Address
  }
}

// Get all stored vaults
export function getStoredVaults(): VaultStore {
  if (typeof window === 'undefined') return {}

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

// Get vault for a specific user and risk level
export function getStoredVault(walletAddress: string, allocation: number): Address | null {
  const vaults = getStoredVaults()
  return vaults[walletAddress.toLowerCase()]?.[allocation] ?? null
}

// Store a vault address
export function storeVault(walletAddress: string, allocation: number, vaultAddress: Address) {
  const vaults = getStoredVaults()

  if (!vaults[walletAddress.toLowerCase()]) {
    vaults[walletAddress.toLowerCase()] = {}
  }

  vaults[walletAddress.toLowerCase()][allocation] = vaultAddress

  localStorage.setItem(STORAGE_KEY, JSON.stringify(vaults))
}

// Get all vaults for a user
export function getUserVaults(walletAddress: string): { allocation: number; address: Address }[] {
  const vaults = getStoredVaults()
  const userVaults = vaults[walletAddress.toLowerCase()] ?? {}

  return Object.entries(userVaults).map(([allocation, address]) => ({
    allocation: Number(allocation),
    address: address as Address,
  }))
}
