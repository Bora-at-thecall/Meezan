'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount, useConnect, useDisconnect } from 'wagmi'

export default function HomePage() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const [showWallets, setShowWallets] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Filter connectors
  const primaryConnector = connectors.find(c => c.name === 'Coinbase Wallet')
  const otherConnectors = connectors.filter(c =>
    c.name !== 'Coinbase Wallet' &&
    !c.name.toLowerCase().includes('phantom')
  )

  // Connected state
  if (mounted && isConnected) {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <div className="flex-1 flex flex-col justify-center items-center">
          <p className="text-[64px] font-extralight tracking-tight mb-6">
            Meezan
          </p>
          <p className="text-[var(--muted)] text-sm">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>

        <div className="border-t border-[var(--border)] py-6">
          <div className="flex justify-center gap-8 text-sm text-[var(--muted)]">
            <Link href="/portfolio" className="hover:text-[var(--foreground)]">
              Portfolio
            </Link>
            <Link href="/setup" className="hover:text-[var(--foreground)]">
              Deposit
            </Link>
            <button
              onClick={() => disconnect()}
              className="hover:text-[var(--foreground)]"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Wallet selection expanded
  if (showWallets) {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <div className="flex-1 flex flex-col justify-center items-center">
          <p className="text-[64px] font-extralight tracking-tight mb-6">
            Meezan
          </p>
          <p className="text-[var(--muted)] text-sm mb-12">
            Connect to continue
          </p>

          <div className="w-full max-w-[280px] space-y-3">
            {primaryConnector && (
              <button
                onClick={() => connect({ connector: primaryConnector })}
                disabled={isPending}
                className="w-full text-center py-3 text-[var(--foreground)] hover:opacity-70 disabled:opacity-50"
              >
                {isPending ? 'Connecting...' : 'Coinbase Wallet'}
              </button>
            )}
            {otherConnectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => connect({ connector })}
                disabled={isPending}
                className="w-full text-center py-3 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
              >
                {connector.name}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--border)] py-6">
          <button
            onClick={() => setShowWallets(false)}
            className="w-full text-center text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  // Default: Arrival state
  return (
    <div className="flex flex-col min-h-[85vh]">
      <div className="flex-1 flex flex-col justify-center items-center">
        <p className="text-[64px] font-extralight tracking-tight mb-6">
          Meezan
        </p>
        <p className="text-[var(--muted)]">
          Fixed-ratio holdings
        </p>
      </div>

      <div className="border-t border-[var(--border)] py-6">
        <div className="flex justify-center gap-8 text-sm text-[var(--muted)]">
          <button
            onClick={() => setShowWallets(true)}
            className="hover:text-[var(--foreground)]"
          >
            Connect
          </button>
        </div>
        <p className="text-center text-xs text-[var(--muted)] mt-6 opacity-50">
          Non-custodial · Base
        </p>
      </div>
    </div>
  )
}
