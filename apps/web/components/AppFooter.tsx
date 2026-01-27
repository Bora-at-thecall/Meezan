'use client'

import Link from 'next/link'

/**
 * AppFooter - Informational links only
 *
 * Pattern B Navigation: Footer contains only informational pages.
 * No actions (disconnect) - those live in ProfileMenu.
 *
 * Links: How it works · Security · Terms · Privacy
 */
export function AppFooter() {
  return (
    <footer className="py-8 mt-auto">
      <div className="flex justify-center items-center gap-4 text-xs text-[var(--muted)]">
        <Link
          href="/how-it-works"
          className="hover:text-[var(--foreground)] transition-colors"
        >
          How it works
        </Link>
        <span className="opacity-30">·</span>
        <Link
          href="/security"
          className="hover:text-[var(--foreground)] transition-colors"
        >
          Security
        </Link>
        <span className="opacity-30">·</span>
        <Link
          href="/terms"
          className="hover:text-[var(--foreground)] transition-colors"
        >
          Terms
        </Link>
        <span className="opacity-30">·</span>
        <Link
          href="/privacy"
          className="hover:text-[var(--foreground)] transition-colors"
        >
          Privacy
        </Link>
      </div>
    </footer>
  )
}
