'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { type Address, formatUnits } from 'viem'
import { Button } from '@/components/Button'
import { WithdrawV3Dialog } from '@/components/WithdrawV3Dialog'
import { UpgradeV3Banner } from '@/components/UpgradeV3Banner'
import { useVaultDetection, type VaultVersion } from '@/lib/vault-detection'
import { useVaultStateV3 } from '@/lib/hooks-v3'
import { useVaultStateV2 } from '@/lib/hooks-v2'
import { getBasescanTxLink } from '@/lib/security'
import { getV3FactoryAddress } from '@/lib/contracts-v3'

// Base chain IDs
const BASE_MAINNET = 8453

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatUsd(value: number): string {
  if (value === 0) return '$0'
  if (value < 0.01) return '<$0.01'
  if (value >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatBalance(balance: bigint, decimals: number, symbol: string): string {
  const value = Number(formatUnits(balance, decimals))
  if (value === 0) return '0'

  if (symbol === 'BTC' || symbol === 'cbBTC' || symbol === 'mWBTC') {
    if (value < 0.0001) return '<0.0001'
    return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
  } else if (symbol === 'USDC' || symbol === 'mUSDC') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } else {
    if (value < 0.001) return '<0.001'
    return value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 4 })
  }
}

// Allocation bar for multi-asset vaults
function AllocationBar({ assets }: { assets: Array<{ assetId: string; currentWeightPct: number; color: string }> }) {
  if (assets.length === 0) return null

  return (
    <div className="w-full h-3 rounded-full overflow-hidden flex">
      {assets.map((asset) => (
        <div
          key={asset.assetId}
          className="h-full transition-all duration-300"
          style={{
            width: `${asset.currentWeightPct}%`,
            backgroundColor: asset.color,
            opacity: asset.currentWeightPct > 0 ? 1 : 0,
          }}
        />
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// V3 PORTFOLIO CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

function PortfolioV3Content({ vaultAddress }: { vaultAddress: Address }) {
  const router = useRouter()
  const { address } = useAccount()
  const chainId = useChainId()
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false)

  const vaultState = useVaultStateV3(vaultAddress)

  const handleWithdrawSuccess = () => {
    setTimeout(() => {
      vaultState.refetch()
    }, 2000)
  }

  const hasBalance = vaultState.totalValueUsd > 0
  const assetsWithBalance = vaultState.assets.filter(a => a.balance > BigInt(0))

  return (
    <div className="flex flex-col min-h-[85vh]">
      {/* Hero section - Balance */}
      <div className="py-8 md:py-12">
        <p className="text-[64px] md:text-[80px] font-extralight tracking-tight tabular-nums text-center">
          {vaultState.isLoading ? (
            <span className="opacity-10">—</span>
          ) : (
            formatUsd(vaultState.totalValueUsd)
          )}
        </p>

        {/* Allocation bar */}
        {hasBalance && !vaultState.isLoading && (
          <div className="w-full max-w-2xl mx-auto mt-8">
            <AllocationBar assets={vaultState.assets} />
          </div>
        )}
      </div>

      {/* Two-column layout on desktop */}
      {hasBalance && !vaultState.isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 py-10">
          {/* Left column: Holdings */}
          <div>
            <div className="flex items-center gap-4 mb-6">
              <span className="text-xs text-[var(--muted)] uppercase tracking-[0.2em]">Holdings</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <div className="space-y-5">
              {assetsWithBalance.map((asset) => (
                <div key={asset.assetId} className="flex justify-between items-baseline">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: asset.color }}
                    />
                    <span>{asset.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg tabular-nums">{formatUsd(asset.valueUsd)}</span>
                    <span className="text-[var(--foreground-secondary)] text-sm ml-3 tabular-nums">
                      {formatBalance(asset.balance, asset.decimals, asset.symbol)}
                    </span>
                  </div>
                </div>
              ))}

              {/* Total row */}
              <div className="pt-4 mt-2 border-t border-[var(--border)]">
                <div className="flex justify-between items-baseline">
                  <span className="text-[var(--muted)]">Total</span>
                  <span className="text-xl tabular-nums font-medium">{formatUsd(vaultState.totalValueUsd)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right column: Actions */}
          <div>
            <div className="flex items-center gap-4 mb-6">
              <span className="text-xs text-[var(--muted)] uppercase tracking-[0.2em]">Actions</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <div className="space-y-4">
              <Button
                size="default"
                onClick={() => setShowWithdrawDialog(true)}
                className="w-full md:w-auto"
              >
                Withdraw
              </Button>

              <div className="flex flex-wrap gap-4">
                <Link href="/setup" className="text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors">
                  Deposit
                </Link>
                <button
                  onClick={() => vaultState.refetch()}
                  className="text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasBalance && !vaultState.isLoading && (
        <div className="py-8 text-center">
          <p className="text-[var(--muted)] mb-4">This vault has no balance.</p>
          <Link href="/setup">
            <Button>Deposit</Button>
          </Link>
        </div>
      )}

      {/* Loading state */}
      {vaultState.isLoading && (
        <div className="py-8 text-center">
          <div className="w-8 h-8 mx-auto border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* V3 Withdraw Dialog */}
      <WithdrawV3Dialog
        isOpen={showWithdrawDialog}
        onClose={() => setShowWithdrawDialog(false)}
        onSuccess={handleWithdrawSuccess}
        vaultAddress={vaultAddress}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY VAULT CONTENT (V2/V1 - shows upgrade banner)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Legacy vault view with upgrade banner.
 * V2 creation is now forbidden - all legacy vaults show upgrade prompt.
 */
function LegacyVaultContent({ vaultAddress }: { vaultAddress: Address }) {
  const vaultState = useVaultStateV2(vaultAddress)

  const hasBalance = vaultState.totalValueUsd > 0
  const assetsWithBalance = vaultState.assets.filter(a => a.balance > BigInt(0))

  return (
    <div className="flex flex-col min-h-[85vh]">
      {/* Upgrade Banner - shown for all legacy vaults */}
      {hasBalance && !vaultState.isLoading && (
        <UpgradeV3Banner
          legacyVaultAddress={vaultAddress}
          totalValueUsd={vaultState.totalValueUsd}
        />
      )}

      {/* Hero section - Balance */}
      <div className="py-8 md:py-12">
        <p className="text-[64px] md:text-[80px] font-extralight tracking-tight tabular-nums text-center">
          {vaultState.isLoading ? (
            <span className="opacity-10">—</span>
          ) : (
            formatUsd(vaultState.totalValueUsd)
          )}
        </p>

        {/* Allocation bar */}
        {hasBalance && !vaultState.isLoading && (
          <div className="w-full max-w-2xl mx-auto mt-8">
            <AllocationBar assets={vaultState.assets} />
          </div>
        )}
      </div>

      {/* Holdings - read-only view */}
      {hasBalance && !vaultState.isLoading && (
        <div className="max-w-md mx-auto w-full">
          <div className="flex items-center gap-4 mb-6">
            <span className="text-xs text-[var(--muted)] uppercase tracking-[0.2em]">Current Holdings</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <div className="space-y-5">
            {assetsWithBalance.map((asset) => (
              <div key={asset.assetId} className="flex justify-between items-baseline">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: asset.color }}
                  />
                  <span>{asset.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-lg tabular-nums">{formatUsd(asset.valueUsd)}</span>
                  <span className="text-[var(--foreground-secondary)] text-sm ml-3 tabular-nums">
                    {formatBalance(asset.balance, asset.decimals, asset.symbol)}
                  </span>
                </div>
              </div>
            ))}

            <div className="pt-4 mt-2 border-t border-[var(--border)]">
              <div className="flex justify-between items-baseline">
                <span className="text-[var(--muted)]">Total</span>
                <span className="text-xl tabular-nums font-medium">{formatUsd(vaultState.totalValueUsd)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasBalance && !vaultState.isLoading && (
        <div className="py-8 text-center">
          <p className="text-[var(--muted)] mb-4">This portfolio has no balance.</p>
          <Link href="/setup">
            <Button>Create new portfolio</Button>
          </Link>
        </div>
      )}

      {/* Loading */}
      {vaultState.isLoading && (
        <div className="py-8 text-center">
          <div className="w-8 h-8 mx-auto border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN UNIFIED PORTFOLIO COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function PortfolioContent() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
  const [mounted, setMounted] = useState(false)

  // Unified vault detection - finds vault of any version
  const { primaryVault, isLoading, networkErrorNoCache, refresh } = useVaultDetection()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Redirect to home if not connected
  useEffect(() => {
    if (mounted && !isConnected) {
      router.push('/')
    }
  }, [mounted, isConnected, router])

  // Not mounted or not connected
  if (!mounted || !isConnected) return null

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center">
        <div className="w-8 h-8 mx-auto border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Network check - must be on Base
  if (chainId !== BASE_MAINNET) {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center px-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-yellow-500/20 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Wrong Network</h2>
        <p className="text-[var(--muted)] mb-6 max-w-[300px]">
          Please switch to Base to use Meezan.
        </p>
        <Button
          size="large"
          onClick={() => switchChain({ chainId: BASE_MAINNET })}
          disabled={isSwitchingChain}
        >
          {isSwitchingChain ? 'Switching...' : 'Switch to Base'}
        </Button>
      </div>
    )
  }

  // Network error - couldn't check vault status
  if (networkErrorNoCache && !primaryVault) {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center px-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-yellow-500/20 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Couldn&apos;t load your portfolio</h2>
        <p className="text-[var(--muted)] mb-6 max-w-[300px]">
          We had trouble connecting. Please try again.
        </p>
        <Button onClick={refresh}>
          Try again
        </Button>
      </div>
    )
  }

  // No vault found - show create portfolio
  if (!primaryVault) {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center text-center px-4">
        <p className="text-2xl font-light mb-3">Get started</p>
        <p className="text-[var(--muted)] mb-8 max-w-[300px]">
          Create a portfolio to manage your assets with automatic rebalancing.
        </p>
        <Link href="/setup">
          <Button size="large">Create portfolio</Button>
        </Link>
      </div>
    )
  }

  // Render the correct content based on vault version
  // V3: Full featured with instant USDC conversion
  // Legacy (V2/V1): Shows upgrade banner
  if (primaryVault.version === 'v3') {
    return <PortfolioV3Content vaultAddress={primaryVault.address} />
  }

  // Legacy vaults show upgrade banner
  return <LegacyVaultContent vaultAddress={primaryVault.address} />
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export default function PortfolioPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-[85vh] items-center justify-center">
        <div className="w-8 h-8 mx-auto border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PortfolioContent />
    </Suspense>
  )
}
