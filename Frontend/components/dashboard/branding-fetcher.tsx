'use client'

import { useEffect } from 'react'
import { useBranding } from '@/components/dashboard/branding-provider'

/**
 * Fetches branding data on mount without blocking the initial page render.
 * Place this inside a <Suspense> boundary in the layout.
 */
export function BrandingFetcher() {
  const { refreshBranding } = useBranding()

  useEffect(() => {
    refreshBranding()
  }, [refreshBranding])

  return null
}
