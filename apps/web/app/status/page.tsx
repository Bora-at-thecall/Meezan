'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type OracleStatus = {
  name: string
  updatedAt: number
  ageSeconds: number
  price: string
  status: 'ok' | 'stale' | 'error'
}

type StatusResponse = {
  status: 'operational' | 'degraded' | 'down'
  timestamp: number
  checks: {
    btcOracle: OracleStatus
    usdcOracle: OracleStatus
    factory: {
      address: string
      readable: boolean
      status: 'ok' | 'error'
    }
    vaultCount: {
      count: number
      status: 'ok' | 'error'
    }
  }
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function StatusIndicator({ status }: { status: 'ok' | 'stale' | 'error' }) {
  const colors = {
    ok: 'bg-green-500',
    stale: 'bg-yellow-500',
    error: 'bg-red-500',
  }
  return <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
}

export default function StatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch('/api/status')
        if (!res.ok) throw new Error('Failed to fetch status')
        const json = await res.json()
        setData(json)
        setError(null)
      } catch (e) {
        setError('Unable to check status')
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [])

  const statusDisplay = {
    operational: { label: 'Operational', color: 'text-green-500', bg: 'bg-green-500/10' },
    degraded: { label: 'Degraded', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    down: { label: 'Down', color: 'text-red-500', bg: 'bg-red-500/10' },
  }

  return (
    <div className="py-8">
      {/* Back link */}
      <Link
        href="/"
        className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-8 inline-block"
      >
        Back
      </Link>

      <h1 className="text-2xl font-semibold mb-2">System Status</h1>
      <p className="text-[var(--muted)] text-sm mb-8">
        Current health of Meezan services
      </p>

      {loading ? (
        <div className="text-[var(--muted)]">Checking status...</div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-500/10 text-red-500">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Overall status */}
          <div className={`p-6 rounded-xl ${statusDisplay[data.status].bg}`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${
                data.status === 'operational' ? 'bg-green-500' :
                data.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
              <span className={`text-xl font-medium ${statusDisplay[data.status].color}`}>
                {statusDisplay[data.status].label}
              </span>
            </div>
            <p className="text-[var(--muted)] text-sm mt-2">
              Last checked: {new Date(data.timestamp).toLocaleTimeString()}
            </p>
          </div>

          {/* Service checks */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wide">
              Services
            </h2>

            {/* Factory */}
            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusIndicator status={data.checks.factory.status} />
                  <span>Factory Contract</span>
                </div>
                <span className="text-sm text-[var(--muted)]">
                  {data.checks.factory.readable ? 'Readable' : 'Unreachable'}
                </span>
              </div>
            </div>

            {/* BTC Oracle */}
            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusIndicator status={data.checks.btcOracle.status} />
                  <span>BTC/USD Price Feed</span>
                </div>
                <span className="text-sm text-[var(--muted)]">
                  {data.checks.btcOracle.status === 'ok'
                    ? formatAge(data.checks.btcOracle.ageSeconds)
                    : data.checks.btcOracle.status === 'stale'
                    ? 'Stale'
                    : 'Error'}
                </span>
              </div>
            </div>

            {/* USDC Oracle */}
            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusIndicator status={data.checks.usdcOracle.status} />
                  <span>USDC/USD Price Feed</span>
                </div>
                <span className="text-sm text-[var(--muted)]">
                  {data.checks.usdcOracle.status === 'ok'
                    ? formatAge(data.checks.usdcOracle.ageSeconds)
                    : data.checks.usdcOracle.status === 'stale'
                    ? 'Stale'
                    : 'Error'}
                </span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wide">
              Activity
            </h2>
            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
              <div className="flex items-center justify-between">
                <span>Vaults Created</span>
                <span className="text-[var(--muted)]">
                  {data.checks.vaultCount.count}
                </span>
              </div>
            </div>
          </div>

          {/* Info */}
          <p className="text-xs text-[var(--muted)] mt-8">
            Status updates every 60 seconds. Price feeds are considered stale after 1 hour.
          </p>
        </div>
      ) : null}
    </div>
  )
}
