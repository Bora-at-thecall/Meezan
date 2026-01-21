'use client'

interface SystemStatusProps {
  drift: number
  driftThreshold: number
  lastUpdated: Date | null
  isLoading: boolean
  targetAllocation?: string
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)

  if (diffSecs < 30) return 'just now'
  if (diffMins < 1) return 'less than a minute ago'
  if (diffMins === 1) return '1 minute ago'
  if (diffMins < 60) return `${diffMins} minutes ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours === 1) return '1 hour ago'
  if (diffHours < 24) return `${diffHours} hours ago`

  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function SystemStatus({
  drift,
  driftThreshold,
  lastUpdated,
  isLoading,
  targetAllocation,
}: SystemStatusProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <span className="w-2 h-2 rounded-full bg-[var(--muted)] opacity-50" />
        <span>Checking allocation...</span>
      </div>
    )
  }

  const isOnTrack = drift < driftThreshold
  const isApproaching = drift >= driftThreshold * 0.7 && drift < driftThreshold
  const needsRebalance = drift >= driftThreshold

  // Calculate distance to threshold
  const distanceToThreshold = driftThreshold - drift
  const timeAgo = lastUpdated ? formatTimeAgo(lastUpdated) : null

  // Build status message - concrete, not vague
  let statusMessage: string
  let statusColor: string

  if (needsRebalance) {
    statusMessage = `Drift at ${drift.toFixed(1)}% · Rebalance available`
    statusColor = 'text-[var(--warning)]'
  } else if (isApproaching) {
    statusMessage = `Drift at ${drift.toFixed(1)}% · ${distanceToThreshold.toFixed(1)}% below threshold`
    statusColor = 'text-[var(--muted)]'
  } else {
    statusMessage = `Drift at ${drift.toFixed(1)}% · No action needed`
    statusColor = 'text-[var(--muted)]'
  }

  return (
    <div className="space-y-2">
      {/* Primary status line */}
      <div className="flex items-center justify-center gap-2">
        {/* Monitoring indicator - subtle, not animated */}
        <span className={`w-2 h-2 rounded-full ${needsRebalance ? 'bg-[var(--warning)]' : 'bg-green-500'}`} />
        <span className={`text-sm ${statusColor}`}>{statusMessage}</span>
      </div>

      {/* Time context */}
      {timeAgo && (
        <p className="text-xs text-[var(--muted)] text-center opacity-70">
          Checked {timeAgo}
        </p>
      )}
    </div>
  )
}

// Compact version for Portfolio page
export function SystemStatusCompact({
  drift,
  driftThreshold,
  lastUpdated,
  isLoading,
}: Omit<SystemStatusProps, 'targetAllocation'>) {
  if (isLoading) {
    return null
  }

  const needsRebalance = drift >= driftThreshold
  const timeAgo = lastUpdated ? formatTimeAgo(lastUpdated) : null

  return (
    <div className="text-center space-y-2">
      {/* Status - understated */}
      <div className="flex items-center justify-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${needsRebalance ? 'bg-[var(--warning)]' : 'bg-emerald-500 opacity-70'}`} />
        {needsRebalance ? (
          <p className="text-sm text-[var(--warning)]">
            Rebalance available
          </p>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            {drift.toFixed(1)}% drift
          </p>
        )}
      </div>

      {/* Time context */}
      {timeAgo && (
        <p className="text-[10px] text-[var(--muted)] opacity-50 tracking-wide">
          Checked {timeAgo}
        </p>
      )}
    </div>
  )
}
