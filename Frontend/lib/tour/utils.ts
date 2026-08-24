/**
 * Product Tour — shared runtime helpers.
 *
 * - `waitForTourElement`: polls every 100ms (max 10s) until the selector exists,
 *   is visible and is enabled. Used for dynamic / async pages.
 * - `waitForRouteChange`: waits until `window.location.pathname` matches a target
 *   (or a predicate). Never relies on arbitrary delays.
 * - `tourLog`: structured debug logging, enabled via `?tourDebug=true` in the URL
 *   or `localStorage["sh:tour:debug"] === "true"`.
 */

export interface WaitForElementOptions {
  /** Max time to poll before giving up (default 10_000) */
  timeout?: number
  /** Poll interval (default 100) */
  interval?: number
  /**
   * Also require the element to be interactive (not disabled). Defaults to
   * `false` — tour steps regularly highlight disabled CTAs (e.g. a “Next”
   * button that needs form fields filled first), which is expected behaviour.
   */
  requireEnabled?: boolean
}

/** True when the element is attached and actually visible on screen. */
export function isElementReady(el: Element | null): el is Element {
  if (!el || !el.isConnected) return false

  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false
  }
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return false
  return true
}

/**
 * Poll the DOM until the element exists and is visible.
 * Returns the element, or `null` on timeout. Never throws.
 */
export function waitForTourElement(
  selector: string,
  { timeout = 10_000, interval = 100, requireEnabled = false }: WaitForElementOptions = {},
): Promise<Element | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null)
      return
    }
    const ready = (el: Element | null) => {
      if (!isElementReady(el)) return false
      if (!requireEnabled) return true
      const control = el as HTMLButtonElement
      if (typeof control.disabled === 'boolean' && control.disabled) return false
      if (el.hasAttribute('aria-disabled') && el.getAttribute('aria-disabled') === 'true') return false
      return true
    }

    const startedAt = Date.now()
    const existing = document.querySelector(selector)
    if (existing && ready(existing)) {
      resolve(existing)
      return
    }

    const timer = window.setInterval(() => {
      const el = document.querySelector(selector)
      if (el && ready(el)) {
        window.clearInterval(timer)
        resolve(el)
        return
      }
      if (Date.now() - startedAt >= timeout) {
        window.clearInterval(timer)
        resolve(null)
      }
    }, interval)
  })
}

/**
 * Wait until `window.location.pathname` satisfies `target`.
 * Accepts an exact path or a predicate. Resolves `false` on timeout.
 */
export function waitForRouteChange(
  target: string | ((pathname: string) => boolean),
  { timeout = 10_000, interval = 100 }: WaitForElementOptions = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false)
      return
    }
    const match = (pathname: string) =>
      typeof target === 'function' ? target(pathname) : pathname === target

    if (match(window.location.pathname)) {
      resolve(true)
      return
    }

    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      if (match(window.location.pathname)) {
        window.clearInterval(timer)
        resolve(true)
        return
      }
      if (Date.now() - startedAt >= timeout) {
        window.clearInterval(timer)
        resolve(false)
      }
    }, interval)
  })
}

/**
 * Resolve after the browser has painted the next frame.
 *
 * Used right before starting a new driver.js step following a route change:
 * by this point React has committed the new page, Suspense has resolved and
 * the target element is mounted — waiting one painted frame lets the browser
 * settle entrance animations / layout so the highlight measures the final
 * geometry instead of a half-visible snapshot.
 */
export function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      resolve()
      return
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Debug mode — `?tourDebug=true` or localStorage["sh:tour:debug"] === "true"
// ────────────────────────────────────────────────────────────────────────────

export function isTourDebug(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const viaUrl = new URLSearchParams(window.location.search).get('tourDebug') === 'true'
    const viaStorage = window.localStorage.getItem('sh:tour:debug') === 'true'
    return viaUrl || viaStorage
  } catch {
    return false
  }
}

/**
 * Structured debug log. Only logs when debug mode is enabled, so it never
 * affects production output.
 */
export function tourLog(event: string, ...args: unknown[]): void {
  if (!isTourDebug()) return
  // eslint-disable-next-line no-console
  console.debug(`[Tour:${event}]`, ...args)
}
