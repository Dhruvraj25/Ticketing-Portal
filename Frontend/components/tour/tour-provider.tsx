'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { DriveStep, Driver, PopoverDOM } from 'driver.js'
import { Compass } from 'lucide-react'
import type { UserRole } from '@/lib/types'
import { USER_ROLE_CONFIG } from '@/lib/types'
import { useSidebar } from '@/components/dashboard/sidebar-provider'
import {
  TOUR_VERSION,
  ROLE_TOURS,
  PAGE_TOURS,
  FEATURE_TOURS,
  resolvePageTourKey,
} from '@/lib/tour/config'
import type {
  FeatureTourConfig,
  TourContextValue,
  TourRole,
  TourStep,
  TourStorageState,
} from '@/lib/tour/types'
import { WelcomeModal } from './welcome-modal'
import { FeatureTourBanner } from './feature-tour-banner'
import {
  waitForTourElement,
  waitForRouteChange,
  waitForNextPaint,
  tourLog,
} from '@/lib/tour/utils'

// ────────────────────────────────────────────────────────────────────────────
// Per-user preference storage (localStorage — no business logic involved)
// ────────────────────────────────────────────────────────────────────────────

const EMPTY_STATE: TourStorageState = {
  version: null,
  completedAt: null,
  skippedAt: null,
  dismissedForever: false,
}

const stateKey = (userId: string) => `sh:tour:state:${userId}`
const featuresKey = (userId: string) => `sh:tour:features:${userId}`
const sessionKey = (userId: string) => `sh:tour:session:${userId}`

function readState(userId: string): TourStorageState {
  if (typeof window === 'undefined') return EMPTY_STATE
  try {
    const raw = window.localStorage.getItem(stateKey(userId))
    return raw ? { ...EMPTY_STATE, ...(JSON.parse(raw) as Partial<TourStorageState>) } : EMPTY_STATE
  } catch {
    return EMPTY_STATE
  }
}

function writeState(userId: string, state: TourStorageState) {
  try {
    window.localStorage.setItem(stateKey(userId), JSON.stringify(state))
  } catch {
    /* storage unavailable — tour simply won't persist */
  }
}

function readSeenFeatures(userId: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(featuresKey(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

function writeSeenFeatures(userId: string, ids: string[]) {
  try {
    window.localStorage.setItem(featuresKey(userId), JSON.stringify(ids))
  } catch {
    /* noop */
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Lazy driver.js loader — the library is only fetched when a tour starts,
// so it never contributes to the initial bundle.
// ────────────────────────────────────────────────────────────────────────────

let driverModulePromise: Promise<typeof import('driver.js')> | null = null

function loadDriver(): Promise<typeof import('driver.js')> {
  if (!driverModulePromise) {
    driverModulePromise = import('driver.js').then(async (mod) => {
      await import('driver.js/dist/driver.css')
      return mod
    })
  }
  return driverModulePromise
}

/**
 * Find the first ticket detail URL on the current page (used by steps that
 * need a real ticket id, e.g. Additional Hours). Returns null if none exists.
 */
function findFirstTicketUrl(): string | null {
  if (typeof document === 'undefined') return null
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/dashboard/tickets/"]'))
  for (const link of links) {
    const href = link.getAttribute('href')
    if (href && /^\/dashboard\/tickets\/\d+$/.test(href)) return href
  }
  return null
}

/**
 * Hide the currently-visible driver.js popover.
 *
 * Used BEFORE navigating to a cross-page step so the previous step's popover
 * never lingers over the new page while the route + data load. driver.js
 * re-creates a fresh popover DOM on every step, so the hidden class cannot
 * leak into the next step's popover.
 */
function hideTourPopover(driver: Driver | null): void {
  if (!driver) return
  try {
    const popover = driver.getState('popover') as PopoverDOM | undefined
    popover?.wrapper?.classList.add('sh-tour-popover-hidden')
  } catch {
    /* noop */
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Context
// ────────────────────────────────────────────────────────────────────────────

const defaultContext: TourContextValue = {
  isActive: false,
  welcomeOpen: false,
  setWelcomeOpen: () => {},
  startRoleTour: async () => {},
  startPageTour: async () => {},
  startFeatureTour: async () => {},
  finishTour: () => {},
  skipWelcome: () => {},
  dismissWelcomeForever: () => {},
  getRoleTourProgress: () => ({ completed: false, lastStepIndex: 0 }),
  hasSeenVersion: false,
}

const TourContext = createContext<TourContextValue>(defaultContext)

export function useTour() {
  return useContext(TourContext)
}

// ────────────────────────────────────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────────────────────────────────────

interface TourProviderProps {
  userId: string
  userRole: UserRole
  userName: string
  children: ReactNode
}

export function TourProvider({ userId, userRole, userName, children }: TourProviderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { setMobileOpen } = useSidebar()

  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const [isActive, setIsActive] = useState(false)
  // Mirrors `startingRef` as state so UI (e.g. the floating “Explore this
  // page” button) can hide during the async tour bootstrap.
  const [starting, setStarting] = useState(false)
  const [hasSeenVersion, setHasSeenVersion] = useState(false)
  const [seenFeatures, setSeenFeatures] = useState<string[]>([])

  const driverRef = useRef<Driver | null>(null)
  const activeStepsRef = useRef<TourStep[]>([])
  const onFinishedRef = useRef<(() => void) | null>(null)
  const activeTourRef = useRef<{ type: 'role' | 'page' | 'feature'; id: string } | null>(null)
  const mountedRef = useRef(true)
  // Guards against double-clicks racing the async navigation in `advanceTo`.
  const movingRef = useRef(false)
  // Guards against two tour launches racing while `isActive` is still false
  // (the state only flips after the async driver bootstrap completes).
  const startingRef = useRef(false)
  // Role-tour resume bookkeeping: the index of the step currently highlighted
  // and whether the tour was completed (vs. exited mid-way). Persisted to the
  // existing tour state on destroy so the Help Hub can offer "Continue".
  const currentStepRef = useRef(0)
  const tourFinishedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      driverRef.current?.destroy()
      driverRef.current = null
    }
  }, [])

  // ── First-login detection + welcome modal ─────────────────────────────
  useEffect(() => {
    if (!userId) return
    const state = readState(userId)
    const dismissedThisSession = window.sessionStorage.getItem(sessionKey(userId)) === '1'
    const seen = state.version === TOUR_VERSION
    setHasSeenVersion(seen)
    if (!seen && !state.dismissedForever && !dismissedThisSession) {
      const t = window.setTimeout(() => {
        if (mountedRef.current) setWelcomeOpen(true)
      }, 900)
      return () => window.clearTimeout(t)
    }
  }, [userId])

  // ── Seen feature tours ────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return
    setSeenFeatures(readSeenFeatures(userId))
  }, [userId])

  const markFeatureSeen = useCallback(
    (id: string) => {
      if (!userId) return
      const next = Array.from(new Set([...readSeenFeatures(userId), id]))
      writeSeenFeatures(userId, next)
      setSeenFeatures(next)
    },
    [userId],
  )

  /**
   * On small screens the sidebar is an off-canvas drawer. When a tour step
   * targets a sidebar element, open the drawer first, then re-measure once the
   * drawer animation has settled so the highlight lands on the right spot.
   */
  const prepareMobileSidebar = useCallback(
    (steps: TourStep[], index: number) => {
      const step = steps[index]
      if (!step?.element || typeof window === 'undefined' || window.innerWidth >= 1024) return
      const el = document.querySelector(step.element)
      if (el?.closest('aside')) setMobileOpen(true)
    },
    [setMobileOpen],
  )

  /**
   * Resolve the selectors that apply to a step: primary element plus any
   * comma-separated alternatives and configured fallbacks. driver.js and
   * `querySelector` both support `a, b` — the first match wins.
   */
  const stepSelectors = useCallback((step: TourStep): string[] => {
    const primary = step.element ? [step.element] : []
    return [...primary, ...(step.fallbackElement ?? [])]
  }, [])

  /** Wait for the first selector that resolves to a ready element. */
  const waitForStepElement = useCallback(
    async (step: TourStep, timeoutOverride?: number): Promise<Element | null> => {
      const selectors = stepSelectors(step)
      for (const selector of selectors) {
        tourLog('waiting-for-element', { step: step.id, selector })
        const el = await waitForTourElement(selector, {
          // Default is intentionally SHORT: server-rendered elements exist the
          // moment the route commits (waitForRouteChange already waited for the
          // RSC payload), and elements that are absent after a short grace are
          // almost certainly absent for this user/state — skip fast instead of
          // burning 10s per optional step. Steps that target data fetched on
          // the client declare an explicit `waitForElement` override.
          timeout: timeoutOverride ?? step.waitForElement ?? 1_000,
        })
        if (el) {
          tourLog('element-found', { step: step.id, selector })
          return el
        }
      }
      return null
    },
    [stepSelectors],
  )

  /**
   * Core (un-guarded) advancement logic. Handles, in order:
   *   1. route navigation (navigate → wait for route completion → hydration)
   *   2. waiting for the step's element (dynamic content)
   *   3. ticket-context steps (open the first ticket to reach the element)
   *   4. skipping invalid steps — the tour never freezes
   *
   * `advanceTo` wraps this with a re-entrancy guard; recursion for skipped
   * steps stays inside `advanceToCore` so the guard is not consulted mid-skip.
   */
  const advanceToCore = useCallback(
    async (index: number) => {
      const steps = activeStepsRef.current
      const driver = driverRef.current
      const step = steps[index]
      if (!step || !driver) return

      tourLog('step', {
        index,
        id: step.id,
        selector: step.element,
        currentRoute: window.location.pathname,
        targetRoute: step.href,
        nextStep: steps[index + 1]?.id,
      })

      // 1. Route navigation — the strict sequence is:
      //      a. Close the previous step's popover (it must never linger over
      //         the new page while the route + data load).
      //      b. router.push() — never call moveNext() immediately after it.
      //      c. Wait for the pathname to change.
      //      d. Wait for the new page to mount / hydrate (a painted frame).
      //      e. Wait for the target selector to exist and be visible — for
      //         server components this also implies the page data has loaded.
      //      f. Only then move the driver to the new step.
      //
      //    If the route can't be reached (e.g. a role guard redirects away, as
      //    with /dashboard/worklogs for developers), don't burn the full 10s
      //    element wait on the wrong page — probe briefly, then skip the step.
      let routeOk = true
      if (step.href && step.href !== window.location.pathname) {
        hideTourPopover(driver)
        tourLog('route-changed', { href: step.href, from: window.location.pathname })
        router.push(step.href)
        routeOk = await waitForRouteChange(step.href, { timeout: 8_000 })
        tourLog('route-change-complete', { href: step.href, ok: routeOk })
        if (routeOk) {
          // Give the router + React a frame to mount the new page before we
          // start probing the DOM, so we never measure a half-committed
          // snapshot.
          await waitForNextPaint()
          tourLog('page-mounted', { href: step.href })
        } else {
          tourLog('route-change-failed', { href: step.href })
        }
      }

      // 1b. Interactive activation — click a tab / accordion trigger / expand
      //     button BEFORE waiting for the target, per spec: never highlight a
      //     detached or invisible element. No-op when the control is absent
      //     (e.g. the tab is already active) — the step proceeds normally.
      if (step.clickElement) {
        const activator = document.querySelector<HTMLElement>(step.clickElement)
        if (activator) {
          tourLog('element-activated', { step: step.id, selector: step.clickElement })
          activator.click()
          await waitForNextPaint()
        } else {
          tourLog('element-activator-missing', { step: step.id, selector: step.clickElement })
        }
      }

      // 2. Wait for the target element (dynamic / streamed content).
      const alreadyOnTicket = /^\/dashboard\/tickets\/\d+$/.test(window.location.pathname)
      // For ticket-context steps that are not on a ticket page yet, don't burn
      // the full 10s primary wait on the list page — jump straight to opening
      // the first ticket (step 3) so the real element is highlighted.
      let found =
        step.needsTicketContext && !alreadyOnTicket
          ? null
          : await waitForStepElement(step, routeOk ? undefined : 2_000)
      if (found) {
        // For server-component pages the element only exists after the page's
        // data fetch has resolved — finding it means the data has loaded.
        tourLog('data-loaded', { step: step.id, selector: step.element })
        tourLog('target-selector-found', { step: step.id, selector: step.element })
      }

      // 3. Ticket-context fallback — e.g. `Additional Hours` lives on a ticket
      //    detail page. Land on the tickets list, open the first ticket, wait.
      if (!found && step.needsTicketContext) {
        tourLog('ticket-context', { step: step.id, alreadyOnTicket })
        // Already on a ticket page but the element is missing (ticket not in
        // the right state) — don't burn another wait; skip straight away.
        if (alreadyOnTicket) {
          tourLog('step-skipped', { id: step.id, selector: step.element, reason: 'no element on this ticket' })
          hideTourPopover(driver)
          if (index + 1 < steps.length) return advanceToCore(index + 1)
          return
        }
        if (step.href && step.href !== window.location.pathname) {
          hideTourPopover(driver)
          router.push(step.href)
          await waitForRouteChange(step.href, { timeout: 8_000 })
          await waitForNextPaint()
        }
        // Give the tickets list a moment to render its rows.
        await waitForTourElement('[data-tour="ticket-list"], a[href^="/dashboard/tickets/"]', {
          timeout: 8_000,
        })
        const ticketUrl = findFirstTicketUrl()
        if (ticketUrl) {
          tourLog('route-changed', { href: ticketUrl })
          hideTourPopover(driver)
          router.push(ticketUrl)
          await waitForRouteChange((p) => /^\/dashboard\/tickets\/\d+$/.test(p), { timeout: 8_000 })
          await waitForNextPaint()
          found = await waitForStepElement(step)
        }
      }

      // 4. Skip invalid steps — log, skip, keep going. Never freeze.
      if (step.element && !found) {
        tourLog('step-skipped', { id: step.id, selector: step.element })
        hideTourPopover(driver)
        if (index + 1 < steps.length) {
          return advanceToCore(index + 1)
        }
        return
      }

      // Guard against a stale driver: if the tour was destroyed or a new tour
      // started while we were waiting (up to ~20s of awaits above), don't move
      // a dead driver or clobber the new tour's position.
      if (driver !== driverRef.current || !mountedRef.current) {
        tourLog('step-skipped', { id: step.id, reason: 'driver changed while waiting' })
        return
      }

      prepareMobileSidebar(steps, index)
      tourLog('element-found', { step: step.id, index })
      // One more painted frame so entrance animations / layout have settled,
      // then create the fresh highlight + popover for this step.
      await waitForNextPaint()
      tourLog('highlight-started', { step: step.id, index })
      currentStepRef.current = index
      driver.moveTo(index)
      tourLog('step-completed', { step: step.id, index })
      // On small screens the sidebar drawer animates in — re-measure once it
      // has settled so the highlight lands on the right spot.
      if (typeof window !== 'undefined' && window.innerWidth < 1024 && step.element) {
        window.setTimeout(() => {
          try {
            driver.refresh()
          } catch {
            /* noop */
          }
        }, 450)
      }
    },
    [router, prepareMobileSidebar, stepSelectors, waitForStepElement],
  )

  /**
   * Public advancement — guarded against double-clicks racing navigation.
   *
   * Hard guarantee: the tour NEVER freezes. If `advanceToCore` throws for any
   * unexpected reason, we log it and continue to the next step instead of
   * leaving the popover stuck on the current step.
   */
  const advanceTo = useCallback(
    async (index: number, _retried = false) => {
      if (movingRef.current) return
      movingRef.current = true
      let failed = false
      try {
        await advanceToCore(index)
      } catch (err) {
        failed = true
        console.error('[Tour] Step failed — continuing to next step:', err)
        tourLog('step-error', { index, error: err instanceof Error ? err.message : String(err) })
      } finally {
        movingRef.current = false
      }
      if (failed && !_retried) {
        const steps = activeStepsRef.current
        if (index + 1 < steps.length) await advanceTo(index + 1, true)
      }
    },
    [advanceToCore],
  )

  // ── Driver creation (lazy) ─────────────────────────────────────────────
  const createDriver = useCallback(
    async (steps: TourStep[], onFinished?: () => void) => {
      const mod = await loadDriver()

      // Tear down any previous tour cleanly.
      if (driverRef.current) {
        try {
          driverRef.current.destroy()
        } catch {
          /* noop */
        }
        driverRef.current = null
      }

      const driverSteps: DriveStep[] = steps.map((s) => ({
        element: s.element,
        popover: {
          title: s.title,
          description: s.description,
          side: s.side ?? 'bottom',
          align: s.align ?? 'center',
        },
        disableActiveInteraction: s.disableActiveInteraction ?? true,
        data: { tourHref: s.href, tourStepId: s.id },
      }))

      const d = mod.driver({
        steps: driverSteps,
        animate: true,
        smoothScroll: true,
        allowClose: true,
        // Prevent accidental dismissal — clicking the dimmed background does
        // nothing. Exit is always deliberate: ×, Skip tour, ESC or Finish.
        overlayClickBehavior: () => {},
        // driver.js re-creates the popover DOM on every step, so we inject the
        // skip button and progress bar on each render (no duplication possible).
        onPopoverRender: (popover: PopoverDOM, opts) => {
          const total = Math.max(steps.length, 1)
          tourLog('popover-opened', { index: opts.index })

          // ── Skip tour button ──
          const skipBtn = document.createElement('button')
          skipBtn.type = 'button'
          skipBtn.className = 'driver-popover-footer-btn driver-popover-skip-btn'
          skipBtn.textContent = 'Skip tour'
          skipBtn.addEventListener('click', () => {
            try {
              opts.driver.destroy()
            } catch {
              /* noop */
            }
          })
          popover.footer.insertBefore(skipBtn, popover.footerButtons)

          // ── Progress bar (thin strip along the popover's top edge) ──
          const current = Math.min(Math.max((opts.index ?? 0) + 1, 1), total)
          const bar = document.createElement('div')
          bar.className = 'sh-tour-progress'
          const fill = document.createElement('div')
          fill.className = 'sh-tour-progress-fill'
          fill.style.width = `${Math.round((current / total) * 100)}%`
          bar.appendChild(fill)
          popover.wrapper.appendChild(bar)
        },
        onHighlightStarted: (_el, step) => {
          tourLog('scroll-started', { step: (step.data as { tourStepId?: string })?.tourStepId })
        },
        onHighlighted: (_el, step) => {
          tourLog('scroll-completed', { step: (step.data as { tourStepId?: string })?.tourStepId })
        },
        allowKeyboardControl: true,
        showProgress: true,
        progressText: 'Step {{current}} of {{total}}',
        nextBtnText: 'Next',
        prevBtnText: 'Back',
        doneBtnText: 'Finish',
        showButtons: ['next', 'previous', 'close'],
        stagePadding: 8,
        stageRadius: 14,
        overlayColor: 'rgba(2, 6, 23, 0.62)',
        popoverClass: 'sh-tour-popover',
        // Waiting + skipping are handled explicitly in `advanceTo` — driver.js
        // never waits 8s on a missing element or silently skips a cross-page
        // step (which would also skip its navigation).
        skipMissingElement: false,
        waitForElement: 0,
        disableActiveInteraction: true,

        // NOTE: driver.js does NOT auto-advance when a global onNextClick /
        // onPrevClick hook is registered — we drive navigation ourselves via
        // `advanceTo`, which waits for the route + element before moving.
        onNextClick: (_el, _step, opts) => {
          const nextIndex = (opts.index ?? 0) + 1
          tourLog('next-clicked', { from: opts.index, to: nextIndex })
          void advanceTo(nextIndex)
        },
        onPrevClick: (_el, _step, opts) => {
          const prevIndex = (opts.index ?? 1) - 1
          tourLog('prev-clicked', { from: opts.index, to: prevIndex })
          void advanceTo(prevIndex)
        },
        onDoneClick: () => {
          tourFinishedRef.current = true
          onFinished?.()
          d.destroy()
        },
        onDestroyed: () => {
          tourLog('tour-finished')
          if (!mountedRef.current) return
          // Persist role-tour progress when the user exits mid-way (resume
          // support for the Help Hub's "Continue Product Tour").
          if (activeTourRef.current?.type === 'role' && !tourFinishedRef.current && userId) {
            const state = readState(userId)
            writeState(userId, { ...state, lastStepIndex: currentStepRef.current })
          }
          setIsActive(false)
          activeTourRef.current = null
          activeStepsRef.current = []
          onFinishedRef.current = null
          driverRef.current = null
          currentStepRef.current = 0
          tourFinishedRef.current = false
        },
      })

      driverRef.current = d
      activeStepsRef.current = steps
      onFinishedRef.current = onFinished ?? null
      return d
    },
    [router, advanceTo],
  )

  // ── Shared runner: ensure first step is reachable, then drive ──────────
  const runTour = useCallback(
    async (steps: TourStep[], onFinished?: () => void, fallbackPath?: string, startFrom = 0) => {
      if (!steps.length) return
      try {
        tourLog('tour-started', {
          tour: activeTourRef.current,
          role: userRole,
          page: window.location.pathname,
          steps: steps.length,
        })
        const first = steps[0]

        // Navigate to the first step's page if we're not already there, and
        // wait for the route to actually change before looking for elements.
        // Fresh starts only — when resuming (startFrom > 0) the probe loop
        // below navigates directly to the resume step instead.
        if (startFrom === 0 && first.href && first.href !== window.location.pathname) {
          tourLog('route-changed', { href: first.href })
          router.push(first.href)
          await waitForRouteChange(first.href, { timeout: 10_000 })
          await waitForNextPaint()
        }

        // Find the first drivable step — skip any whose element cannot be
        // found (dynamic pages) instead of freezing on a missing selector.
        // Each candidate step may live on a different page, so navigate to its
        // href before probing for its element. When resuming, only steps at or
        // after `startFrom` are considered so "Continue" picks up where the
        // user left off instead of restarting.
        let startIndex = Math.min(startFrom, Math.max(steps.length - 1, 0))
        for (let i = startFrom; i < steps.length; i++) {
          const s = steps[i]
          // Element-less steps (e.g. the final “all set” step) always drive.
          if (!s.element) {
            startIndex = i
            break
          }
          if (s.href && s.href !== window.location.pathname) {
            tourLog('route-changed', { href: s.href })
            router.push(s.href)
            const ok = await waitForRouteChange(s.href, { timeout: 8_000 })
            // Route unreachable (role guard redirect) — move on to the next
            // candidate instead of probing the wrong page for 5s.
            if (!ok) {
              tourLog('step-skipped', { id: s.id, reason: 'route not reachable at start' })
              continue
            }
            await waitForNextPaint()
          }
          // Apply interactive activation (tabs/accordions) here too — the probe
          // must not skip a step whose target only exists after its control is
          // clicked, otherwise a `clickElement` first step would never start.
          if (s.clickElement) {
            document.querySelector<HTMLElement>(s.clickElement)?.click()
            await waitForNextPaint()
          }
          // Honor an explicit waitForElement at start too (slow server pages
          // like Analytics declare 8s); only the unconfigured default is capped
          // so absent optional steps skip quickly.
          const el = await waitForTourElement(s.element, {
            timeout: s.waitForElement ?? 1_000,
          })
          if (el) {
            startIndex = i
            break
          }
          tourLog('step-skipped', { id: s.id, reason: 'missing at start' })
        }

        const d = await createDriver(steps, onFinished)
        if (!mountedRef.current) return
        d.drive(startIndex)
        setIsActive(true)
      } catch (err) {
        console.error('[Tour] Failed to start tour:', err)
        setIsActive(false)
      }
    },
    [createDriver, router, userRole],
  )

  // ── Role tour ───────────────────────────────────────────────────────────
  const finishTour = useCallback(() => {
    if (!userId) return
    const state = readState(userId)
    writeState(userId, {
      ...state,
      version: TOUR_VERSION,
      completedAt: new Date().toISOString(),
    })
    setHasSeenVersion(true)
  }, [userId])

  const startRoleTour = useCallback(
    async (role?: TourRole, startFrom = 0) => {
      if (startingRef.current || driverRef.current) return
      const r = (role ?? userRole) as UserRole
      const config = ROLE_TOURS[r]
      if (!config) return
      startingRef.current = true
      setStarting(true)
      try {
        setWelcomeOpen(false)
        activeTourRef.current = { type: 'role', id: r }
        // Starting the tour counts as having seen this version — the welcome
        // modal won't nag again even if the user exits mid-way.
        if (userId) {
          const state = readState(userId)
          writeState(userId, { ...state, version: TOUR_VERSION })
          setHasSeenVersion(true)
        }
        await runTour(
          config.steps,
          () => {
            finishTour()
            activeTourRef.current = null
          },
          undefined,
          startFrom,
        )
      } finally {
        startingRef.current = false
        setStarting(false)
      }
    },
    [runTour, finishTour, userId, userRole],
  )

  // ── Page tour ───────────────────────────────────────────────────────────
  const startPageTour = useCallback(
    async (path?: string) => {
      // Re-entrancy: never allow a second tour to start while one is running
      // or mid-bootstrap (isActive flips only after the async setup).
      if (startingRef.current || driverRef.current) return
      startingRef.current = true
      setStarting(true)
      try {
        const p = path ?? window.location.pathname
        const key = resolvePageTourKey(p)
        const steps = key ? PAGE_TOURS[key] : undefined
        if (!steps?.length) return
        activeTourRef.current = { type: 'page', id: key ?? p }
        // Fall back to the real pathname (never the `[id]` template) if the
        // first step's element can't be found.
        await runTour(steps, undefined, p)
      } finally {
        startingRef.current = false
        setStarting(false)
      }
    },
    [runTour],
  )

  // ── Feature tour ────────────────────────────────────────────────────────
  const startFeatureTour = useCallback(
    async (id: string) => {
      if (startingRef.current || driverRef.current) return
      const feature = FEATURE_TOURS.find((f) => f.id === id)
      if (!feature) return
      startingRef.current = true
      setStarting(true)
      try {
        setWelcomeOpen(false)
        activeTourRef.current = { type: 'feature', id }
        await runTour(feature.steps, () => markFeatureSeen(id))
      } finally {
        startingRef.current = false
        setStarting(false)
      }
    },
    [runTour, markFeatureSeen],
  )

  // ── Welcome modal actions ───────────────────────────────────────────────
  const skipWelcome = useCallback(() => {
    if (!userId) return
    try {
      window.sessionStorage.setItem(sessionKey(userId), '1')
    } catch {
      /* noop */
    }
    setWelcomeOpen(false)
  }, [userId])

  const dismissWelcomeForever = useCallback(() => {
    if (!userId) return
    const state = readState(userId)
    writeState(userId, {
      ...state,
      version: TOUR_VERSION,
      dismissedForever: true,
      skippedAt: new Date().toISOString(),
    })
    setHasSeenVersion(true)
    setWelcomeOpen(false)
  }, [userId])

  const roleLabel = USER_ROLE_CONFIG[userRole]?.label ?? userRole

  /** Read the role tour's persisted progress (used by the Help Hub). */
  const getRoleTourProgress = useCallback((): { completed: boolean; lastStepIndex: number } => {
    if (!userId) return { completed: false, lastStepIndex: 0 }
    const state = readState(userId)
    return {
      completed: !!state.completedAt,
      lastStepIndex: state.lastStepIndex ?? 0,
    }
  }, [userId])

  const contextValue = useMemo<TourContextValue>(
    () => ({
      isActive,
      welcomeOpen,
      setWelcomeOpen,
      startRoleTour,
      startPageTour,
      startFeatureTour,
      finishTour,
      skipWelcome,
      dismissWelcomeForever,
      getRoleTourProgress,
      hasSeenVersion,
    }),
    [
      isActive,
      welcomeOpen,
      startRoleTour,
      startPageTour,
      startFeatureTour,
      finishTour,
      skipWelcome,
      dismissWelcomeForever,
      getRoleTourProgress,
      hasSeenVersion,
    ],
  )

  const unseenFeatures = FEATURE_TOURS.filter((f) => !seenFeatures.includes(f.id))

  // Page-specific tours — a subtle trigger appears on pages that have one,
  // giving users an on-demand walkthrough without reading docs.
  const pageTourKey = resolvePageTourKey(pathname)
  const pageTourAvailable = !!pageTourKey && (PAGE_TOURS[pageTourKey]?.length ?? 0) > 0

  return (
    <TourContext.Provider value={contextValue}>
      {children}

      {/* Welcome modal — first login (per tour version) */}
      <WelcomeModal
        open={welcomeOpen}
        userName={userName}
        roleLabel={roleLabel}
        onStart={() => void startRoleTour()}
        onSkip={skipWelcome}
        onDismissForever={dismissWelcomeForever}
      />

      {/* Feature announcement tours */}
      {!welcomeOpen && !isActive && unseenFeatures.length > 0 && (
        <div className="fixed bottom-5 right-5 z-[90] flex flex-col items-end gap-3 pointer-events-none">
          {unseenFeatures.map((feature: FeatureTourConfig) => (
            <FeatureTourBanner
              key={feature.id}
              feature={feature}
              onShow={() => void startFeatureTour(feature.id)}
              onDismiss={() => markFeatureSeen(feature.id)}
            />
          ))}
        </div>
      )}
    </TourContext.Provider>
  )
}
