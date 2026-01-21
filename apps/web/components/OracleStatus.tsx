'use client'

import { type OracleHealth } from '@/lib/hooks'

interface OracleStatusProps {
  health: OracleHealth
  isLoading: boolean
}

function formatAge(seconds: number): string {
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function OracleStatus({ health, isLoading }: OracleStatusProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <span className="w-2 h-2 rounded-full bg-[var(--muted)] animate-pulse" />
        <span>Checking oracle...</span>
      </div>
    )
  }

  const statusConfig: Record<OracleHealth, { color: string; label: string }> = {
    healthy: {
      color: 'bg-green-500',
      label: 'Price feeds active',
    },
    stale: {
      color: 'bg-[var(--warning)]',
      label: 'Price feed delayed',
    },
    unknown: {
      color: 'bg-[var(--muted)]',
      label: 'Oracle status unknown',
    },
  }

  const { color, label } = statusConfig[health]

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  )
}
