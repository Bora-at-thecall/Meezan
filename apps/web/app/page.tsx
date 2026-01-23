'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Button } from '@/components/Button'
import { WalletModal } from '@/components/WalletModal'
import { getUserVaults } from '@/lib/store'
import { getLatestVaultV2, removeVaultV2, verifyVaultValid, cleanupInvalidVaultsV2, discoverVaultsFromFactory } from '@/lib/contracts-v2'
import { type Address } from 'viem'

export default function HomePage() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [portfolioLink, setPortfolioLink] = useState<string | null>(null)
  const [hasBalance, setHasBalance] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Check if user has a portfolio with actual funds
  useEffect(() => {
    if (!mounted || !address) {
      setHasBalance(false)
      setPortfolioLink(null)
      setIsChecking(false)
      return
    }

    const checkPortfolio = async () => {
      setIsChecking(true)

      // First, clean up any invalid vaults from localStorage
      await cleanupInvalidVaultsV2(address)

      // Check v1 vaults first (existing users)
      const v1Vaults = getUserVaults(address)
      if (v1Vaults.length > 0) {
        // For v1, assume they have balance if they have a vault
        // (v1 users are existing users with funds)
        setPortfolioLink('/portfolio')
        setHasBalance(true)
        setIsChecking(false)
        return
      }

      // Check v2 vault - first from localStorage
      let v2Vault = getLatestVaultV2(address)

      // If not in localStorage, try to discover from factory events
      if (!v2Vault) {
        console.log('[HomePage] No vault in localStorage, discovering from factory...')
        const discovered = await discoverVaultsFromFactory(address)
        if (discovered.length > 0) {
          v2Vault = discovered[0] // Use most recently discovered
          console.log('[HomePage] Discovered vault from factory:', v2Vault)
        }
      }

      if (v2Vault) {
        console.log('[HomePage] Checking v2 vault:', v2Vault)

        // First verify the vault is valid (has bytecode, is owned by user)
        const verification = await verifyVaultValid(v2Vault as Address, address)
        if (!verification.valid) {
          console.warn('[HomePage] Vault invalid:', verification.reason)
          removeVaultV2(address, v2Vault as Address)
          setPortfolioLink(null)
          setHasBalance(false)
          setIsChecking(false)
          return
        }

        // Vault is valid - check balance via direct RPC using getUsdValues()
        // (totalUsdValue() can revert on some vaults, but getUsdValues() is more reliable)
        try {
          const response = await fetch('https://mainnet.base.org', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_call',
              params: [{
                to: v2Vault,
                data: '0x0610997d', // getUsdValues() selector - returns uint256[]
              }, 'latest']
            })
          })
          const data = await response.json()
          console.log('[HomePage] getUsdValues response:', data.result?.slice(0, 100))

          if (data.result && data.result !== '0x' && data.result.length > 66) {
            // Parse the array - first 64 chars after 0x is offset, next 64 is length
            // Then each 64 chars is a uint256 value
            const hex = data.result.slice(2) // remove 0x
            const arrayLength = parseInt(hex.slice(64, 128), 16)
            let totalValue = BigInt(0)

            for (let i = 0; i < arrayLength; i++) {
              const valueHex = hex.slice(128 + i * 64, 128 + (i + 1) * 64)
              totalValue += BigInt('0x' + valueHex)
            }

            console.log('[HomePage] Total USD value:', totalValue.toString())

            if (totalValue > BigInt(0)) {
              console.log('[HomePage] Vault has balance')
              setPortfolioLink(`/portfolio-v2?vault=${v2Vault}`)
              setHasBalance(true)
            } else {
              console.log('[HomePage] Vault is empty')
              // Empty but valid vault - remove from storage
              removeVaultV2(address, v2Vault as Address)
              setPortfolioLink(null)
              setHasBalance(false)
            }
          } else {
            // No valid response - treat as invalid
            removeVaultV2(address, v2Vault as Address)
            setPortfolioLink(null)
            setHasBalance(false)
          }
        } catch (error) {
          console.warn('[HomePage] Balance check failed:', error)
          // On error, remove from storage to be safe
          removeVaultV2(address, v2Vault as Address)
          setPortfolioLink(null)
          setHasBalance(false)
        }
      } else {
        setPortfolioLink(null)
        setHasBalance(false)
      }

      setIsChecking(false)
    }

    checkPortfolio()
  }, [mounted, address])

  const handleConnect = (connector: typeof connectors[number]) => {
    connect({ connector })
    setShowWalletModal(false)
  }

  // Connected state
  if (mounted && isConnected) {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <div className="flex-1 flex flex-col justify-center items-center text-center py-12">
          <p className="text-[48px] font-extralight tracking-tight mb-4">
            Meezan
          </p>
          <p className="text-[var(--muted)] text-sm tabular-nums mb-8">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>

          {/* Primary action - based on whether user has funds */}
          <div className="w-full max-w-[280px]">
            {isChecking ? (
              <Button size="large" className="w-full" disabled>
                Loading...
              </Button>
            ) : hasBalance && portfolioLink ? (
              <Link href={portfolioLink}>
                <Button size="large" className="w-full">
                  View portfolio
                </Button>
              </Link>
            ) : (
              <Link href="/setup-v2">
                <Button size="large" className="w-full">
                  Create portfolio
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Secondary actions */}
        <div className="py-8 mt-auto">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
          <div className="flex justify-center gap-8 text-sm">
            <button
              onClick={() => disconnect()}
              className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Default: Landing page
  return (
    <div className="flex flex-col min-h-[85vh]">
      {/* Hero section */}
      <div className="flex-1 flex flex-col justify-center items-center text-center px-4 py-12">
        <p className="text-[56px] font-extralight tracking-tight mb-8">
          Meezan
        </p>

        {/* One dominant statement */}
        <p className="text-xl text-[var(--foreground)] mb-12 max-w-[340px] leading-relaxed">
          Keeps your crypto portfolio balanced exactly how you choose.
        </p>

        {/* Primary CTA - opens modal */}
        <div className="w-full max-w-[280px]">
          <Button
            size="large"
            onClick={() => setShowWalletModal(true)}
            disabled={isPending}
            className="w-full"
          >
            {isPending ? 'Connecting...' : 'Connect wallet'}
          </Button>
        </div>
      </div>

      {/* Footer: Trust statement */}
      <div className="py-8 mt-auto px-4">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        {/* Non-custodial trust statement */}
        <p className="text-center text-sm text-[var(--muted)] mb-5 max-w-[360px] mx-auto leading-relaxed">
          Your funds stay in your own vault contract. Meezan cannot access, move, or freeze your money.
        </p>

        {/* Network badge */}
        <div className="flex justify-center items-center gap-2 text-xs text-[var(--muted)] opacity-60">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span>Built on Base</span>
        </div>
      </div>

      {/* Wallet selection modal */}
      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        connectors={connectors}
        onConnect={handleConnect}
        isPending={isPending}
      />
    </div>
  )
}
