'use client'

import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTour } from '@/components/tour/tour-provider'

// ── Centralized portal-wide background refresh ─────────────────────────────
//
// Single source of truth for "refresh the current page's data every 30s
// while the user is idle." Mounted exactly once, in app/dashboard/layout.tsx,
// so there is never more than one timer running per portal session — this
// replaces the old per-page <TicketAutoRefresh />, which only ever covered
// the ticket detail page.
//
// Behavior:
//  - mousemove / mousedown / click / keydown / scroll / touchstart all reset
//    a 30s idle countdown (passive listeners, no re-renders).
//  - When the countdown reaches zero with no further activity, the current
//    page is refreshed via router.refresh() — never a full browser reload,
//    so in-memory client state and unsaved form values are never wiped by
//    the refresh itself — and the countdown restarts, refreshing again every
//    30s for as long as the user stays away.
//  - Any activity cancels the pending refresh and restarts the 30s window.
//  - A refresh is skipped (the countdown still restarts so it keeps
//    checking) whenever: an input/textarea/select/contenteditable is
//    focused, a dialog/alert-dialog/dropdown/select/popover is open
//    anywhere on the page, a guided tour is active, or a component has
//    explicitly registered unsaved changes via useAutoRefreshGuard().
//  - Hidden tabs pause the countdown entirely (no work while backgrounded).
//    On return, the page refreshes once if the last refresh is more than
//    30s old, then the countdown resumes — a lock prevents that refresh
//    from overlapping with an idle-timer refresh firing at the same time.

const IDLE_MS = 30_000

// Every shared overlay primitive in the app renders its open content with
// one of these data-slot values (dialog.tsx, alert-dialog.tsx, select.tsx,
// dropdown-menu.tsx, popover.tsx) — checking for their presence in the DOM
// covers every dialog/dropdown/select instance portal-wide with zero changes
// to those components or their call sites.
const OPEN_OVERLAY_SELECTOR = [
  '[data-slot="dialog-content"]',
  '[data-slot="alert-dialog-content"]',
  '[data-slot="select-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="popover-content"]',
].join(', ')

type SuppressRef = { current: number }

const SuppressContext = createContext<SuppressRef | null>(null)

/**
 * Lets a component with genuinely unsaved state (a ticket being drafted, a
 * dirty profile form) veto the background refresh while `suppress` is true,
 * on top of the generic focus/dialog/select checks the provider already
 * does. Safe to call outside <AutoRefreshProvider> (becomes a no-op).
 */
export function useAutoRefreshGuard(suppress: boolean) {
  const ref = useContext(SuppressContext)
  useEffect(() => {
    if (!ref || !suppress) return
    ref.current += 1
    return () => {
      ref.current -= 1
    }
  }, [ref, suppress])
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return (el as HTMLElement).isContentEditable === true
}

export function AutoRefreshProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { isActive: tourActive } = useTour()

  const suppressRef = useRef<number>(0)
  const idleTimerRef = useRef<number | null>(null)
  const lastRefreshRef = useRef<number>(Date.now())
  const refreshingRef = useRef(false)
  const focusedEditableRef = useRef(false)
  const tourActiveRef = useRef(tourActive)
  tourActiveRef.current = tourActive

  const canRefreshNow = useCallback(() => {
    if (document.visibilityState !== 'visible') return false
    if (tourActiveRef.current) return false
    if (suppressRef.current > 0) return false
    if (focusedEditableRef.current) return false
    if (document.querySelector(OPEN_OVERLAY_SELECTOR)) return false
    return true
  }, [])

  const doRefresh = useCallback(() => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    lastRefreshRef.current = Date.now()
    router.refresh()
    // router.refresh() has no completion callback — a short lock is enough
    // to stop two triggers (idle timer + tab-return) from double-firing.
    window.setTimeout(() => {
      refreshingRef.current = false
    }, 1_000)
  }, [router])

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  const scheduleIdleCheck = useCallback(() => {
    clearIdleTimer()
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null
      if (document.visibilityState === 'visible' && canRefreshNow()) {
        doRefresh()
      }
      // Keep checking every 30s for as long as nothing resets this via
      // real activity — matches "continue checking every 30 seconds while
      // the user remains inactive."
      scheduleIdleCheck()
    }, IDLE_MS)
  }, [clearIdleTimer, canRefreshNow, doRefresh])

  useEffect(() => {
    const markActivity = () => {
      // Any activity stops the pending refresh immediately and restarts the
      // 30s countdown from now.
      scheduleIdleCheck()
    }
    const onFocusIn = (e: FocusEvent) => {
      focusedEditableRef.current = isEditableTarget(e.target)
    }
    const onFocusOut = () => {
      focusedEditableRef.current = false
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastRefreshRef.current > IDLE_MS) {
          if (canRefreshNow()) doRefresh()
        }
        scheduleIdleCheck()
      } else {
        // Don't aggressively reload a hidden tab — just stop the countdown.
        clearIdleTimer()
      }
    }

    const activityEvents = ['mousemove', 'mousedown', 'click', 'keydown', 'scroll', 'touchstart'] as const
    const opts: AddEventListenerOptions = { passive: true }
    activityEvents.forEach((e) => window.addEventListener(e, markActivity, opts))
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('visibilitychange', onVisibility)

    if (document.visibilityState === 'visible') scheduleIdleCheck()

    return () => {
      clearIdleTimer()
      activityEvents.forEach((e) => window.removeEventListener(e, markActivity, opts))
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [scheduleIdleCheck, clearIdleTimer, canRefreshNow, doRefresh])

  return <SuppressContext.Provider value={suppressRef}>{children}</SuppressContext.Provider>
}
