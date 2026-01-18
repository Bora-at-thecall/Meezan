'use client'

import Link from 'next/link'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Button } from '@/components/Button'

export default function WelcomePage() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  return (
    <div className="flex flex-col min-h-[85vh]">
      {/* Hero */}
      <div className="flex-1 flex flex-col justify-center text-center py-12">
        {/* Logo mark */}
        <div className="mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[var(--primary)] to-purple-500 flex items-center justify-center">
            <span className="text-white text-2xl font-semibold">M</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-semibold tracking-tight mb-3">
          Meezan
        </h1>
        <p className="text-[var(--muted)] text-lg mb-12">
          Simple allocation between BTC and USD
        </p>

        {/* What it does */}
        <div className="space-y-4 text-left max-w-xs mx-auto mb-12">
          <div className="flex items-start gap-3">
            <span className="text-[var(--muted)] mt-0.5">1.</span>
            <p className="text-[var(--foreground)]">
              Choose a target allocation
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-[var(--muted)] mt-0.5">2.</span>
            <p className="text-[var(--foreground)]">
              Deposit USDC
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-[var(--muted)] mt-0.5">3.</span>
            <p className="text-[var(--foreground)]">
              Withdraw anytime
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {isConnected ? (
          <>
            <Link href="/setup">
              <Button size="large">Continue</Button>
            </Link>
            <button
              onClick={() => disconnect()}
              className="w-full text-center text-sm text-[var(--muted)] hover:text-[var(--foreground)] py-3"
            >
              {address?.slice(0, 6)}...{address?.slice(-4)} · Disconnect
            </button>
          </>
        ) : (
          <>
            {connectors.map((connector) => (
              <Button
                key={connector.uid}
                size="large"
                variant={connector.name === 'Coinbase Wallet' ? 'primary' : 'secondary'}
                onClick={() => connect({ connector })}
              >
                Connect {connector.name}
              </Button>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-[var(--muted)] mt-6">
        Non-custodial. Your keys, your funds.
      </p>
    </div>
  )
}
