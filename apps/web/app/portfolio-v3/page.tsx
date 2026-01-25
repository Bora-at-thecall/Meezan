'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Legacy route - redirects to unified /portfolio
 * Kept for backwards compatibility with bookmarks
 */
export default function PortfolioV3Redirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/portfolio')
  }, [router])

  return (
    <div className="flex flex-col min-h-[85vh] items-center justify-center">
      <div className="w-8 h-8 mx-auto border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
