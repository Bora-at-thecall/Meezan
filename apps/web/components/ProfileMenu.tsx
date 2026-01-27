'use client'

import { useState, useRef, useEffect } from 'react'
import { useAccount, useDisconnect } from 'wagmi'

/**
 * ProfileMenu - Pattern B Navigation Component
 *
 * Minimal profile icon that expands to show:
 * - Truncated wallet address (muted)
 * - Disconnect action
 *
 * Design principles:
 * - Institutional tone: no prominent account display
 * - Available but not visible: disconnect is accessible but not emphasized
 * - Mobile accessible: 44px minimum touch target
 */
export function ProfileMenu() {
  const { address } = useAccount()
  const { disconnect } = useDisconnect()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close menu on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  if (!address) return null

  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`

  return (
    <div className="relative" ref={menuRef}>
      {/* Profile icon button - 44px touch target */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[var(--background-secondary)] transition-colors"
        aria-label="Account menu"
        aria-expanded={isOpen}
      >
        {/* User silhouette icon */}
        <div className="w-8 h-8 rounded-full bg-[var(--border)] flex items-center justify-center">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[var(--muted)]"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
          </svg>
        </div>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--background)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden z-50">
          {/* Address */}
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <p className="text-xs text-[var(--muted)] tabular-nums">
              {truncatedAddress}
            </p>
          </div>

          {/* Disconnect */}
          <button
            onClick={() => {
              disconnect()
              setIsOpen(false)
            }}
            className="w-full px-4 py-3 text-left text-sm text-[var(--foreground-secondary)] hover:bg-[var(--background-secondary)] transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
