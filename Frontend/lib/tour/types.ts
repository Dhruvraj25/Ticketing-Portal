import type { UserRole } from '@/lib/types'

/**
 * Product Tour — shared types.
 *
 * The tour layer is intentionally decoupled from driver.js so that swapping
 * the underlying library (or adding a new role/page) never touches business
 * logic. Everything a tour needs is declared here and in `config.ts`.
 */

export type TourRole = UserRole

export type TourPopoverSide = 'top' | 'right' | 'bottom' | 'left'
export type TourPopoverAlign = 'start' | 'center' | 'end'

export interface TourStep {
  /** Stable id — used for debugging and future analytics */
  id: string
  /** Popover title */
  title: string
  /** Popover body copy */
  description: string
  /**
   * CSS selector of the element to highlight. Prefer `[data-tour="..."]`
   * attributes; plain `#id` / `.class` selectors also work.
   */
  element?: string
  /** Preferred popover placement — driver.js auto-adjusts when space is tight */
  side?: TourPopoverSide
  align?: TourPopoverAlign
  /**
   * Route to navigate to before highlighting this step (cross-page tours).
   * Omit for steps on the current page.
   */
  href?: string
  /**
   * How long (ms) to wait for the element to appear before skipping the step.
   * Defaults to 10_000 (10s).
   */
  waitForElement?: number
  /**
   * When the primary selector cannot be found, fall back to these selectors
   * (in order) before giving up and skipping the step.
   */
  fallbackElement?: string[]
  /**
   * Mark a step that needs a real ticket id (e.g. `Additional Hours` lives on a
   * ticket detail page). When true and the element is missing on the tickets
   * list page, the tour opens the first available ticket and re-waits.
   */
  needsTicketContext?: boolean
  /**
   * CSS selector of a UI control (tab, accordion trigger, expand button) to
   * click BEFORE waiting for `element`. Activates targets hidden behind
   * interactive UI so the tour never highlights a detached/invisible element.
   * The click is a no-op if the selector is absent (e.g. the tab is already
   * active) — the step then proceeds normally.
   */
  clickElement?: string
  /** Keep the highlighted element interactive (default: true = disabled) */
  disableActiveInteraction?: boolean
}

export interface TourConfig {
  id: string
  title: string
  /** Short subtitle used by the welcome modal / restart surfaces */
  description?: string
  steps: TourStep[]
}

export interface FeatureTourConfig {
  id: string
  title: string
  description: string
  /** lucide icon name rendered by the announcement banner */
  icon: string
  steps: TourStep[]
}

/**
 * Persisted per-user tour state (localStorage — user preferences).
 * No business logic depends on this data.
 */
export interface TourStorageState {
  /** Last tour version the user has seen (or been offered) */
  version: string | null
  completedAt: string | null
  skippedAt: string | null
  dismissedForever: boolean
  /**
   * Index of the last highlighted step of the role tour (resume support).
   * Only written when the user exits the product tour mid-way; 0 means no
   * resumable progress.
   */
  lastStepIndex?: number
}

export interface TourContextValue {
  /** A tour overlay is currently active */
  isActive: boolean
  /** Welcome modal open state */
  welcomeOpen: boolean
  setWelcomeOpen: (open: boolean) => void
  /** Launch the full role-based tour for the authenticated user (optionally resuming from a step index) */
  startRoleTour: (role?: TourRole, startFrom?: number) => Promise<void>
  /** Launch the tour configured for the current (or given) page */
  startPageTour: (path?: string) => Promise<void>
  /** Launch a short feature announcement tour */
  startFeatureTour: (id: string) => Promise<void>
  /**
   * Role-tour progress for the signed-in user, read synchronously from the
   * existing localStorage tour state. Used by the Help Hub to decide between
   * "Product Tour", "Continue Product Tour" and "Replay Product Tour".
   */
  getRoleTourProgress: () => { completed: boolean; lastStepIndex: number }
  /** Mark the current tour version as completed for this user */
  finishTour: () => void
  /** Dismiss the welcome modal for this browser session only */
  skipWelcome: () => void
  /** Never show the welcome modal for this tour version again */
  dismissWelcomeForever: () => void
  /** True when the user has already seen the current tour version */
  hasSeenVersion: boolean
}
