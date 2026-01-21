'use client'

import { type VaultActivity } from '@/lib/hooks'

interface ActivityLogProps {
  activities: VaultActivity[]
  isLoading: boolean
  showCausality?: boolean
}

function formatTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ActivityIcon({ type }: { type: VaultActivity['type'] }) {
  const iconClass = 'w-4 h-4'

  switch (type) {
    case 'deposit':
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      )
    case 'withdraw':
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      )
    case 'rebalance':
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 14.5-4.5M20 15a9 9 0 0 1-14.5 4.5" />
        </svg>
      )
  }
}

function ActivityItem({ activity, showCausality }: { activity: VaultActivity; showCausality?: boolean }) {
  // Labels for each activity type
  const labels: Record<VaultActivity['type'], string> = {
    deposit: 'Deposit',
    withdraw: 'Withdrawal',
    rebalance: 'Rebalance',
  }

  // Get the primary detail (amount or drift change)
  const getDetail = () => {
    if (activity.type === 'deposit') {
      return `+${activity.details.amount} USDC`
    }
    if (activity.type === 'withdraw') {
      return activity.details.amount
    }
    if (activity.type === 'rebalance') {
      return `${activity.details.driftBefore?.toFixed(1)}% → ${activity.details.driftAfter?.toFixed(1)}%`
    }
    return ''
  }

  // Get causality explanation (trigger condition and action)
  const getCausality = () => {
    if (!showCausality) return null

    if (activity.type === 'deposit') {
      return {
        trigger: 'User initiated deposit',
        action: 'Allocated to target ratio',
        cost: 'Network fee paid',
      }
    }
    if (activity.type === 'withdraw') {
      return {
        trigger: 'User initiated withdrawal',
        action: 'All holdings transferred',
        cost: 'Network fee paid',
      }
    }
    if (activity.type === 'rebalance') {
      const driftBefore = activity.details.driftBefore ?? 0
      return {
        trigger: `Drift exceeded threshold (${driftBefore.toFixed(1)}%)`,
        action: 'Swapped assets to restore target',
        cost: 'Swap fee + network fee',
      }
    }
    return null
  }

  const causality = getCausality()

  return (
    <div className="py-3 border-b border-[var(--border)] last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-[var(--muted)]">
            <ActivityIcon type={activity.type} />
          </div>
          <div>
            <p className="text-sm font-medium">{labels[activity.type]}</p>
            <p className="text-xs text-[var(--muted)]">{getDetail()}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--muted)]">{formatTime(activity.timestamp)}</p>
          <a
            href={`https://basescan.org/tx/${activity.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--primary)] hover:underline"
          >
            View tx
          </a>
        </div>
      </div>

      {/* Causality details - only when expanded */}
      {causality && (
        <div className="mt-2 ml-7 text-xs text-[var(--muted)] space-y-0.5">
          <p>Trigger: {causality.trigger}</p>
          <p>Action: {causality.action}</p>
          <p>Cost: {causality.cost}</p>
        </div>
      )}
    </div>
  )
}

export function ActivityLog({ activities, isLoading, showCausality = false }: ActivityLogProps) {
  if (isLoading) {
    return (
      <div className="py-6">
        <p className="text-sm text-[var(--muted)] text-center">Loading activity...</p>
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="py-4">
        <p className="text-sm text-[var(--muted)] text-center">No transactions yet</p>
        <p className="text-xs text-[var(--muted)] text-center mt-1 opacity-70">
          Activity will appear here after deposits or rebalances
        </p>
      </div>
    )
  }

  // Group activities by type for organization
  const deposits = activities.filter(a => a.type === 'deposit')
  const withdrawals = activities.filter(a => a.type === 'withdraw')
  const rebalances = activities.filter(a => a.type === 'rebalance')

  // If showing grouped view
  if (showCausality && activities.length > 3) {
    return (
      <div className="space-y-6">
        {rebalances.length > 0 && (
          <div>
            <p className="text-xs text-[var(--muted)] mb-2 uppercase tracking-wide">Rebalances</p>
            {rebalances.slice(0, 3).map((activity, i) => (
              <ActivityItem key={`${activity.txHash}-${i}`} activity={activity} showCausality={showCausality} />
            ))}
          </div>
        )}
        {deposits.length > 0 && (
          <div>
            <p className="text-xs text-[var(--muted)] mb-2 uppercase tracking-wide">Deposits</p>
            {deposits.slice(0, 3).map((activity, i) => (
              <ActivityItem key={`${activity.txHash}-${i}`} activity={activity} showCausality={showCausality} />
            ))}
          </div>
        )}
        {withdrawals.length > 0 && (
          <div>
            <p className="text-xs text-[var(--muted)] mb-2 uppercase tracking-wide">Withdrawals</p>
            {withdrawals.slice(0, 3).map((activity, i) => (
              <ActivityItem key={`${activity.txHash}-${i}`} activity={activity} showCausality={showCausality} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Default: chronological list
  return (
    <div>
      {activities.slice(0, 5).map((activity, i) => (
        <ActivityItem key={`${activity.txHash}-${i}`} activity={activity} showCausality={showCausality} />
      ))}
    </div>
  )
}
