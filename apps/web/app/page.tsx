'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'

type Screen = 'welcome' | 'learn' | 'connect'

export default function WelcomePage() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const [screen, setScreen] = useState<Screen>('welcome')
  const [showMoreWallets, setShowMoreWallets] = useState(false)

  // If already connected, show continue option
  if (isConnected) {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <div className="flex-1 flex flex-col justify-center text-center py-12">
          <div className="mb-8">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[var(--primary)] to-purple-500 flex items-center justify-center">
              <span className="text-white text-2xl font-semibold">M</span>
            </div>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight mb-3">
            Welcome back
          </h1>
          <p className="text-[var(--muted)] mb-8">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>

        <div className="space-y-3">
          <Link href="/portfolio">
            <Button size="large">View Portfolio</Button>
          </Link>
          <Link href="/setup">
            <Button size="large" variant="secondary">New Deposit</Button>
          </Link>
          <button
            onClick={() => disconnect()}
            className="w-full text-center text-sm text-[var(--muted)] hover:text-[var(--foreground)] py-3"
          >
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  // Screen 1: Welcome - explain what Meezan does
  if (screen === 'welcome') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <div className="flex-1 flex flex-col justify-center text-center py-12">
          <div className="mb-8">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[var(--primary)] to-purple-500 flex items-center justify-center">
              <span className="text-white text-2xl font-semibold">M</span>
            </div>
          </div>

          <h1 className="text-4xl font-semibold tracking-tight mb-3">
            Meezan
          </h1>
          <p className="text-[var(--muted)] text-lg mb-12">
            Hold Bitcoin and dollars in a fixed ratio
          </p>

          <div className="space-y-4 text-left max-w-xs mx-auto mb-8">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[var(--primary)] text-xs font-semibold">1</span>
              </div>
              <div>
                <p className="text-[var(--foreground)] font-medium">Choose a ratio</p>
                <p className="text-sm text-[var(--muted)]">e.g. 50% BTC, 50% USDC</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[var(--primary)] text-xs font-semibold">2</span>
              </div>
              <div>
                <p className="text-[var(--foreground)] font-medium">Deposit USDC</p>
                <p className="text-sm text-[var(--muted)]">Automatically split to your ratio</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[var(--primary)] text-xs font-semibold">3</span>
              </div>
              <div>
                <p className="text-[var(--foreground)] font-medium">Withdraw anytime</p>
                <p className="text-sm text-[var(--muted)]">Your funds, your control</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Button size="large" onClick={() => setScreen('learn')}>
            Learn More
          </Button>
          <button
            onClick={() => setScreen('connect')}
            className="w-full text-center text-sm text-[var(--muted)] hover:text-[var(--foreground)] py-3"
          >
            I understand, connect wallet
          </button>
        </div>

        <p className="text-center text-xs text-[var(--muted)] mt-6">
          Non-custodial on Base
        </p>
      </div>
    )
  }

  // Screen 2: Learn - explain allocations
  if (screen === 'learn') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={() => setScreen('welcome')}
          className="text-[var(--primary)] text-sm mb-8 text-left hover:opacity-70 font-medium"
        >
          ← Back
        </button>

        <h1 className="text-3xl font-semibold mb-2">How it works</h1>
        <p className="text-[var(--muted)] mb-8">
          You choose how much to hold in Bitcoin vs dollars.
        </p>

        <div className="flex-1 space-y-6">
          <Card variant="default" padding="large">
            <h3 className="font-semibold mb-2">Example: 50 / 50</h3>
            <p className="text-sm text-[var(--muted)] mb-4">
              Half your deposit stays as USDC. Half is converted to BTC.
            </p>
            <div className="h-3 rounded-full overflow-hidden bg-[var(--border)] flex">
              <div className="w-1/2 bg-orange-500" />
              <div className="w-1/2 bg-blue-500" />
            </div>
            <div className="flex justify-between text-xs text-[var(--muted)] mt-2">
              <span>50% BTC</span>
              <span>50% USDC</span>
            </div>
          </Card>

          <Card variant="default" padding="large">
            <h3 className="font-semibold mb-2">Rebalancing</h3>
            <p className="text-sm text-[var(--muted)]">
              When BTC price changes, your ratio drifts. You can rebalance to restore your target split. This is manual — you decide when.
            </p>
          </Card>

          <Card variant="default" padding="large">
            <h3 className="font-semibold mb-2">Your vault, your keys</h3>
            <p className="text-sm text-[var(--muted)]">
              Your funds are held in a smart contract that only you control. No one else can access or move your funds.
            </p>
          </Card>
        </div>

        <div className="mt-8 space-y-3">
          <Button size="large" onClick={() => setScreen('connect')}>
            Connect Wallet
          </Button>
        </div>
      </div>
    )
  }

  // Screen 3: Connect wallet - simplified
  const coinbaseConnector = connectors.find(c => c.name === 'Coinbase Wallet')
  const otherConnectors = connectors.filter(c => c.name !== 'Coinbase Wallet')

  return (
    <div className="flex flex-col min-h-[85vh]">
      <button
        onClick={() => setScreen('learn')}
        className="text-[var(--primary)] text-sm mb-8 text-left hover:opacity-70 font-medium"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-semibold mb-2">Connect wallet</h1>
      <p className="text-[var(--muted)] mb-8">
        To create a vault on Base, connect your wallet.
      </p>

      <div className="flex-1 space-y-3">
        {/* Primary option: Coinbase Wallet */}
        {coinbaseConnector && (
          <Button
            size="large"
            onClick={() => connect({ connector: coinbaseConnector })}
            disabled={isPending}
          >
            {isPending ? 'Connecting...' : 'Coinbase Wallet'}
          </Button>
        )}

        {/* Show/hide other wallets */}
        {otherConnectors.length > 0 && (
          <>
            <button
              onClick={() => setShowMoreWallets(!showMoreWallets)}
              className="w-full text-center text-sm text-[var(--muted)] hover:text-[var(--foreground)] py-3"
            >
              {showMoreWallets ? 'Hide other options' : 'Other wallets'}
            </button>

            {showMoreWallets && (
              <div className="space-y-2">
                {otherConnectors.map((connector) => (
                  <Button
                    key={connector.uid}
                    size="large"
                    variant="secondary"
                    onClick={() => connect({ connector })}
                    disabled={isPending}
                  >
                    {connector.name}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Card variant="default" padding="default" className="mt-8">
        <p className="text-xs text-[var(--muted)] text-center">
          Make sure your wallet is set to <strong>Base</strong> network.
          You'll need ETH on Base for transaction fees.
        </p>
      </Card>
    </div>
  )
}
