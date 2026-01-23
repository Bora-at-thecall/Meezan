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

// Remove a vault from storage (e.g., after withdrawal)
export function removeVault(walletAddress: string, vaultAddress: Address): void {
  if (typeof window === 'undefined') return

  try {
    const vaults = getStoredVaults()
    const userVaults = vaults[walletAddress.toLowerCase()]
    if (!userVaults) return

    // Find and remove the vault by address
    for (const [allocation, address] of Object.entries(userVaults)) {
      if ((address as string).toLowerCase() === vaultAddress.toLowerCase()) {
        delete userVaults[Number(allocation)]
        break
      }
    }

    // Clean up if no vaults left for user
    if (Object.keys(userVaults).length === 0) {
      delete vaults[walletAddress.toLowerCase()]
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(vaults))
  } catch (error) {
    console.error('Failed to remove vault:', error)
  }
}

// Clear all stored vault data (for reset/debugging)
export function clearAllVaults() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

// Expose to window for easy console access
if (typeof window !== 'undefined') {
  (window as unknown as { resetMeezan: () => void }).resetMeezan = () => {
    // Clear v1 vaults
    localStorage.removeItem(STORAGE_KEY)
    // Clear all v2 vaults (they're stored per-address)
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('meezan_v2_vaults_')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
    console.log('Meezan vault cache cleared. Refresh the page.')
  }
}
