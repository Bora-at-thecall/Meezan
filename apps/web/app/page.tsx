'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Button } from '@/components/Button'

export default function HomePage() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const [showAllWallets, setShowAllWallets] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Filter connectors - prefer Coinbase Wallet but fall back to any available
  const coinbaseConnector = connectors.find(c => c.name === 'Coinbase Wallet')
  const filteredConnectors = connectors.filter(c => !c.name.toLowerCase().includes('phantom'))
  const primaryConnector = coinbaseConnector || filteredConnectors[0]
  const otherConnectors = filteredConnectors.filter(c => c.id !== primaryConnector?.id)

  // Connected state - minimal, redirect-focused
  if (mounted && isConnected) {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <div className="flex-1 flex flex-col justify-center items-center text-center py-12">
          <p className="text-[56px] font-extralight tracking-tight mb-6">
            Meezan
          </p>
          <p className="text-[var(--muted)] text-sm tabular-nums">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>

        {/* Actions */}
        <div className="py-8 mt-auto">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
          <div className="flex justify-center gap-10 text-sm">
            <Link href="/portfolio" className="text-[var(--primary)] hover:opacity-80 transition-opacity">
              Portfolio
            </Link>
            <Link href="/setup" className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
              Deposit
            </Link>
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

  // Wallet selection expanded
  if (showAllWallets) {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <div className="flex-1 flex flex-col justify-center items-center">
          <p className="text-[48px] font-extralight tracking-tight mb-8">
            Meezan
          </p>

          <div className="w-full max-w-[280px] space-y-3">
            {filteredConnectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => connect({ connector })}
                disabled={isPending}
                className="w-full text-center py-3 bg-[var(--background-secondary)] rounded-xl hover:bg-[var(--background-tertiary)] disabled:opacity-50 transition-colors"
              >
                {connector.name}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--border)] py-6">
          <button
            onClick={() => setShowAllWallets(false)}
            className="w-full text-center text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  // Default: Landing page - explain Meezan in 5 seconds
  return (
    <div className="flex flex-col min-h-[85vh]">
      {/* Hero section */}
      <div className="flex-1 flex flex-col justify-center items-center text-center px-4 py-12">
        <p className="text-[56px] font-extralight tracking-tight mb-8">
          Meezan
        </p>

        {/* One dominant statement */}
        <p className="text-xl text-[var(--foreground)] mb-3 max-w-[320px] leading-relaxed">
          Keeps your Bitcoin and dollar ratio exactly where you set it
        </p>

        {/* What it does / doesn't do */}
        <p className="text-sm text-[var(--muted)] mb-12 max-w-[300px]">
          No predictions. No trading. Just automatic rebalancing when prices move.
        </p>

        {/* Primary CTA */}
        <div className="w-full max-w-[280px] space-y-4">
          {primaryConnector ? (
            <Button
              size="large"
              onClick={() => connect({ connector: primaryConnector })}
              disabled={isPending}
              className="w-full"
            >
              {isPending ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          ) : (
            <Button
              size="large"
              onClick={() => setShowAllWallets(true)}
              className="w-full"
            >
              Connect Wallet
            </Button>
          )}

          {/* Secondary: Other wallets (only show if there are other options) */}
          {otherConnectors.length > 0 && (
            <button
              onClick={() => setShowAllWallets(true)}
              className="w-full text-center py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Other wallets
            </button>
          )}
        </div>
      </div>

      {/* Footer: Trust signals */}
      <div className="py-8 mt-auto px-4">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        {/* Non-custodial explanation */}
        <p className="text-center text-xs text-[var(--muted)] mb-5 max-w-[300px] mx-auto leading-relaxed">
          Your funds stay in your own vault contract. Meezan cannot access, move, or freeze your money.
        </p>

        {/* Network badge */}
        <div className="flex justify-center items-center gap-2 text-xs text-[var(--muted)] opacity-60">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span>Built on Base</span>
        </div>
      </div>
    </div>
  )
}
