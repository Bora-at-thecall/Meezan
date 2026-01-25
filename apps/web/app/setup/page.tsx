'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Unified setup route - redirects to the current setup flow
 * This ensures /setup always works regardless of which vault version is being created
 */
export default function SetupRedirect() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to multi-asset setup (V2/V3)
    // This is the current recommended setup flow
    router.replace('/setup-v2')
  }, [router])

  return (
    <div className="flex flex-col min-h-[85vh] items-center justify-center">
      <div className="w-8 h-8 mx-auto border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
