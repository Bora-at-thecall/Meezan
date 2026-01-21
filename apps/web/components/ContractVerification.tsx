'use client'

import { VERIFIED_CONTRACTS, getBasescanLink } from '@/lib/security'

interface ContractVerificationProps {
  showAll?: boolean
}

export function ContractVerification({ showAll = false }: ContractVerificationProps) {
  const contracts = showAll
    ? [
        { name: 'Factory', address: VERIFIED_CONTRACTS.factory },
        { name: 'USDC', address: VERIFIED_CONTRACTS.usdc },
        { name: 'cbBTC', address: VERIFIED_CONTRACTS.cbBTC },
        { name: 'BTC/USD Feed', address: VERIFIED_CONTRACTS.btcUsdFeed },
        { name: 'USDC/USD Feed', address: VERIFIED_CONTRACTS.usdcUsdFeed },
      ]
    : [{ name: 'Factory', address: VERIFIED_CONTRACTS.factory }]

  return (
    <div className="text-xs text-[var(--muted)] space-y-1">
      <p className="opacity-60">Verified contracts:</p>
      {contracts.map(({ name, address }) => (
        <div key={address} className="flex items-center gap-2">
          <span className="opacity-50">{name}:</span>
          <a
            href={getBasescanLink(address)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:text-[var(--primary)] transition-colors"
          >
            {address.slice(0, 6)}...{address.slice(-4)}
          </a>
        </div>
      ))}
    </div>
  )
}

/**
 * Compact verification link for vault addresses
 */
export function VaultVerificationLink({ address }: { address: string }) {
  return (
    <a
      href={getBasescanLink(address as `0x${string}`)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-[var(--primary)] hover:underline"
    >
      Verify on Basescan
    </a>
  )
}
