'use client'

import { LoadingScreen } from '@/components/ui/loading-screen'

/**
 * Client-side wrapper for the LoadingScreen, designed to be used
 * inside Next.js `loading.tsx` files as a Suspense fallback.
 *
 * Uses pure CSS animations — no JavaScript state management needed.
 */
export function DashboardLoadingScreen() {
  return <LoadingScreen visible message="Loading…" />
}
