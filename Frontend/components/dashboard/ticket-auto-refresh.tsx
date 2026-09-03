'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTour } from '@/components/tour/tour-provider'

// Require this much inactivity (no pointer/keyboard/scroll input) before a
// polling tick will refresh the page, so an actively-typed form or an open
// dialog is never interrupted by a re-render underneath it.
const IDLE_MS = 10_000
const POLL_MS = 30_000

/**
 * Background refresh for the ticket-processing page (R26).
 *
 * While the tab is visible and the user has been idle, re-run the page's
 * server components via router.refresh() every 30 seconds — no full browser
 * reload, no duplicated interval (single effect instance per page) and the
 * interval is cleaned up on unmount. Polling pauses while the tab is hidden
 * or a guided tour is active (the tour highlights live DOM nodes) and never
 * fires while the user is actively interacting with the ticket.
 */
export function TicketAutoRefresh({ pollMs = POLL_MS }: { pollMs?: number }) {
  const router = useRouter()
  const { isActive: tourActive } = useTour()
  const lastActivityRef = useRef<number>(Date.now())

  useEffect(() => {
    const markActivity = () => {
      lastActivityRef.current = Date.now()
    }
    const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const
    const opts = { passive: true } as AddEventListenerOptions
    activityEvents.forEach((e) => window.addEventListener(e, markActivity, opts))

    let timer: number | null = null

    const start = () => {
      if (timer !== null) return
      timer = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return
        // Skip the tick while the user is actively working on the ticket or
        // a tour has a live highlight over the page.
        if (Date.now() - lastActivityRef.current < IDLE_MS) return
        if (tourActive) return
        router.refresh()
      }, pollMs)
    }

    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer)
        timer = null
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      activityEvents.forEach((e) => window.removeEventListener(e, markActivity, opts))
    }
  }, [router, pollMs, tourActive])

  return null
}
