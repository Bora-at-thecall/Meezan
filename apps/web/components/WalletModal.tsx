'use client'

import { useEffect, useRef } from 'react'
import { type Connector } from 'wagmi'

interface WalletModalProps {
  isOpen: boolean
  onClose: () => void
  connectors: readonly Connector[]
  onConnect: (connector: Connector) => void
  isPending: boolean
}

// Map connector names to user-friendly labels
function getWalletLabel(connectorName: string): string {
  const labels: Record<string, string> = {
    'Coinbase Wallet': 'Coinbase Wallet',
    'MetaMask': 'MetaMask',
    'Brave Wallet': 'Brave Wallet',
    'WalletConnect': 'WalletConnect',
    'Injected': 'Browser Wallet',
  }
  return labels[connectorName] || connectorName
}

// Get recommended status
function isRecommended(connectorName: string): boolean {
  return connectorName === 'Coinbase Wallet'
}

// Sort connectors: Coinbase first, then alphabetically
function sortConnectors(connectors: readonly Connector[]): Connector[] {
  return [...connectors].sort((a, b) => {
    if (a.name === 'Coinbase Wallet') return -1
    if (b.name === 'Coinbase Wallet') return 1
    return a.name.localeCompare(b.name)
  })
}

export function WalletModal({
  isOpen,
  onClose,
  connectors,
  onConnect,
  isPending,
}: WalletModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  // Filter out Phantom and sort
  const filteredConnectors = sortConnectors(
    connectors.filter(c => !c.name.toLowerCase().includes('phantom'))
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-[var(--background)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-modal-title"
      >
        <h2 id="wallet-modal-title" className="text-lg font-semibold mb-6 text-center">
          Connect your wallet
        </h2>

        {/* Wallet options */}
        <div className="space-y-3">
          {filteredConnectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => onConnect(connector)}
              disabled={isPending}
              className="w-full p-4 rounded-xl text-left transition-all border border-[var(--border)] bg-[var(--background-secondary)] hover:border-[var(--muted)] hover:bg-[var(--background-tertiary)] disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{getWalletLabel(connector.name)}</span>
                {isRecommended(connector.name) && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--primary)]/20 text-[var(--primary)]">
                    Recommended
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-full mt-6 text-center py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
