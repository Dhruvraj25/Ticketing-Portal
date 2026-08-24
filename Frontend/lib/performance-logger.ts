/**
 * SupportHub Centralized Performance Analytics Logger
 *
 * Single entry point for all performance logging in the application.
 * Provides structured, grouped, and categorized performance analytics.
 *
 * Only active in development mode (NODE_ENV !== 'production').
 * In production, all methods are no-ops.
 *
 * Usage:
 *   import { perf } from '@/lib/performance-logger'
 *
 *   perf.navigation('/dashboard/projects')   → NAVIGATION analytics
 *   perf.layout('Auth', 71)                   → LAYOUT analytics
 *   perf.serverAction('getProjects', 118)     → ACTION analytics
 *   perf.api('GET', '/api/projects', 200, 184)→ API analytics
 *   perf.component('DashboardSidebar', 42)    → COMPONENT analytics
 *   perf.summary()                            → End-of-page summary
 */

const IS_DEV = process.env.NODE_ENV !== 'production'
const IS_AUDIT = process.env.PERF_AUDIT === 'true'

// ============================================================================
// Internal Helpers
// ============================================================================

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

function classify(ms: number): 'fast' | 'normal' | 'slow' | 'critical' {
  if (ms < 100) return 'fast'
  if (ms < 300) return 'normal'
  if (ms < 1000) return 'slow'
  return 'critical'
}

function classifyIcon(ms: number): string {
  const c = classify(ms)
  switch (c) {
    case 'fast': return '  '
    case 'normal': return '~'
    case 'slow': return '⚠'
    case 'critical': return '🔴'
  }
}

// ============================================================================
// Page Load Timer
// ============================================================================

interface PageLoadMark {
  label: string
  duration: number
  category: string
}

let pageMarks: PageLoadMark[] = []
let pageStartTime = 0
let pageRoute = ''
let pageSummaryPrinted = false

// ============================================================================
// Slow Operation Logging
// ============================================================================

interface SlowOp {
  type: string
  name: string
  duration: number
}

const slowOps: SlowOp[] = []

// ============================================================================
// Public API
// ============================================================================

export const perf = {
  // ── Phase 2: Generic Timing ─────────────────────────────────────────────

  /**
   * Start a named timer. Returns a function that ends timing and logs.
   * Usage: const end = perf.start('Auth Check')
   *        ... do work ...
   *        end()
   */
  start(label: string): () => void {
    if (!IS_DEV && !IS_AUDIT) return () => {}
    const start = performance.now()
    return () => {
      const duration = performance.now() - start
      perf.measure(label, duration, 'generic')
    }
  },

  /**
   * Record a named measurement.
   */
  measure(label: string, durationMs: number, category: string = 'generic') {
    if (!IS_DEV && !IS_AUDIT) return
    pageMarks.push({ label, duration: durationMs, category })
  },

  /**
   * End timing and log. Returns the duration.
   */
  end(label: string): number {
    if (!IS_DEV && !IS_AUDIT) return 0
    const mark = pageMarks.find(m => m.label === label)
    return mark?.duration ?? 0
  },

  // ── Phase 2: pageLoad — Full Page Load Timing ────────────────────────────

  /**
   * Track a full page load lifecycle. Alias for navigation().
   * Call at the start of a page component or layout.
   */
  pageLoad(route: string) {
    return perf.navigation(route)
  },

  // ── Phase 3: Navigation Analytics ───────────────────────────────────────

  /**
   * Track a page navigation.
   * Call at the start of a page component or layout.
   * Subsequent layout(), serverAction(), api(), component() calls accumulate.
   * Call summary() at the end to print the full report.
   */
  navigation(route: string) {
    if (!IS_DEV && !IS_AUDIT) return
    pageRoute = route
    pageStartTime = performance.now()
    pageMarks = []
    pageSummaryPrinted = false
    slowOps.length = 0

    console.groupCollapsed(`  [NAVIGATION] ${route}`)
    console.log(`  Route: ${route}`)
    console.groupEnd()
  },

  // ── Phase 4: Dashboard Layout Analytics ─────────────────────────────────

  /**
   * Record a layout phase timing.
   */
  layout(phase: string, durationMs: number) {
    if (!IS_DEV && !IS_AUDIT) return
    pageMarks.push({ label: phase, duration: durationMs, category: 'layout' })

    // Only log slow layout phases immediately
    if (durationMs >= 300) {
      slowOps.push({ type: 'LAYOUT', name: phase, duration: durationMs })
    }
  },

  // ── Phase 5: Server Action Analytics ────────────────────────────────────

  /**
   * Record a server action timing.
   * Fast actions (<100ms) are collected silently and shown only in the summary.
   * Slow actions (>=300ms) are logged immediately as warnings.
   */
  serverAction(name: string, durationMs: number) {
    if (!IS_DEV && !IS_AUDIT) return

    // Track for summary (always)
    pageMarks.push({ label: `${name}()`, duration: durationMs, category: 'server_action' })

    // Only log slow actions immediately (avoids flooding console)
    if (durationMs >= 300) {
      console.warn(`  ⚠ [ACTION] ${name}  ${formatMs(durationMs)}`)
      slowOps.push({ type: 'ACTION', name, duration: durationMs })
    }
  },

  // ── Phase 6: API Analytics ──────────────────────────────────────────────

  /**
   * Record an API call timing.
   */
  api(method: string, endpoint: string, status: number, durationMs: number, sizeBytes?: number) {
    if (!IS_DEV && !IS_AUDIT) return

    pageMarks.push({ label: `${method} ${endpoint}`, duration: durationMs, category: 'api' })

    // Only log slow API calls immediately
    if (durationMs >= 500) {
      const sizeStr = sizeBytes ? ` | ${Math.round(sizeBytes / 1024)}KB` : ''
      console.warn(`  ⚠ [API] ${method} ${endpoint}  Status: ${status}  Time: ${formatMs(durationMs)}${sizeStr}`)
      slowOps.push({ type: 'API', name: `${method} ${endpoint}`, duration: durationMs })
    }
  },

  // ── Phase 7: Component Render Analytics ─────────────────────────────────

  /**
   * Record a component render timing.
   * Only for expensive components (sidebar, providers, charts, tables).
   */
  component(name: string, durationMs: number) {
    if (!IS_DEV && !IS_AUDIT) return

    pageMarks.push({ label: name, duration: durationMs, category: 'component' })

    // Only log expensive renders
    if (durationMs > 16) {
      const icon = classifyIcon(durationMs)
      console.log(`  ${icon} [RENDER] ${name.padEnd(30)} ${formatMs(durationMs)}`)
      if (durationMs >= 300) {
        slowOps.push({ type: 'RENDER', name, duration: durationMs })
      }
    }
  },

  // ── Phase 8: Database Query Timing ──────────────────────────────────────

  /**
   * Record a database query timing.
   */
  database(label: string, durationMs: number, rows?: number) {
    if (!IS_DEV && !IS_AUDIT) return

    pageMarks.push({ label: `DB: ${label}`, duration: durationMs, category: 'database' })

    // Only log slow queries immediately
    if (durationMs > 200) {
      const rowsStr = rows !== undefined ? `  rows: ${rows}` : ''
      console.warn(`  ⚠ [DB] ${label.padEnd(30)} ${formatMs(durationMs)}${rowsStr}`)
      slowOps.push({ type: 'DB', name: label, duration: durationMs })
    }
  },

  // ── Phase 9: Warning / Slow Operation ───────────────────────────────────

  /**
   * Log a performance warning.
   */
  warning(message: string, durationMs: number) {
    if (!IS_DEV && !IS_AUDIT) return
    const level = durationMs >= 1000 ? 'CRITICAL' : durationMs >= 500 ? 'SLOW' : 'WARN'
    console.warn(`  ⚠ ${level}  ${message}  (${formatMs(durationMs)})`)
    slowOps.push({ type: level, name: message, duration: durationMs })
  },

  // ── Phase 10: End-of-Page Summary ───────────────────────────────────────

  /**
   * Print the end-of-page performance summary.
   * Call once per page render (after all data is fetched).
   * Uses console.groupCollapsed() to keep console tidy.
   */
  summary(totalDuration?: number) {
    if ((!IS_DEV && !IS_AUDIT) || pageSummaryPrinted) return
    pageSummaryPrinted = true

    const totalTime = totalDuration ?? (pageStartTime ? performance.now() - pageStartTime : 0)

    // Group marks by category
    const layoutMarks = pageMarks.filter(m => m.category === 'layout')
    const actionMarks = pageMarks.filter(m => m.category === 'server_action')
    const apiMarks = pageMarks.filter(m => m.category === 'api')
    const componentMarks = pageMarks.filter(m => m.category === 'component')
    const dbMarks = pageMarks.filter(m => m.category === 'database')

    console.groupCollapsed(`  [SUMMARY] ${pageRoute || '(unknown)'}  │ ${formatMs(totalTime)} total`)
    console.log('')
    console.log('══════════════════════════════════════════════')
    console.log('  PAGE ANALYTICS')
    console.log('')
    console.log(`  Route:  ${pageRoute || '(unknown)'}`)
    console.log('')

    // Layout section
    for (const m of layoutMarks) {
      const icon = classifyIcon(m.duration)
      console.log(`  ${icon}  ${m.label.padEnd(22)} ${formatMs(m.duration).padStart(8)}`)
    }

    // Actions section
    for (const m of actionMarks) {
      const icon = classifyIcon(m.duration)
      console.log(`  ${icon}  ${m.label.padEnd(22)} ${formatMs(m.duration).padStart(8)}`)
    }

    // API section
    for (const m of apiMarks) {
      const icon = classifyIcon(m.duration)
      console.log(`  ${icon}  ${m.label.padEnd(22)} ${formatMs(m.duration).padStart(8)}`)
    }

    // Component section
    for (const m of componentMarks) {
      const icon = classifyIcon(m.duration)
      console.log(`  ${icon}  ${m.label.padEnd(22)} ${formatMs(m.duration).padStart(8)}`)
    }

    // DB section
    for (const m of dbMarks) {
      const icon = classifyIcon(m.duration)
      console.log(`  ${icon}  ${m.label.padEnd(22)} ${formatMs(m.duration).padStart(8)}`)
    }

    // Total
    console.log('')
    console.log(`  TOTAL`.padEnd(25) + ` ${formatMs(totalTime).padStart(8)}`)
    console.log('══════════════════════════════════════════════')
    console.log('')

    // Slow operation warnings
    if (slowOps.length > 0) {
      console.log(`  ⚠ ${slowOps.length} Slow Operation(s):`)
      for (const op of slowOps) {
        const icon = op.duration >= 1000 ? '🔴' : '⚠'
        console.log(`    ${icon} ${op.type}: ${op.name} (${formatMs(op.duration)})`)
      }
    }

    console.groupEnd()
  },

  // ── Phase 11: Development-Only Guard ────────────────────────────────────

  /**
   * Check if performance logging is active (development mode only).
   */
  get enabled(): boolean {
    return IS_DEV || IS_AUDIT
  },

  /**
   * Reset all accumulated data (for testing or between navigations).
   */
  reset() {
    pageMarks = []
    pageStartTime = 0
    pageRoute = ''
    pageSummaryPrinted = false
    slowOps.length = 0
  },

  getPageMarks() {
    return [...pageMarks]
  },

  getPageRoute() {
    return pageRoute
  },

  getSlowOps() {
    return [...slowOps]
  },
}

// ============================================================================
// Legacy / Backward Compatibility
// ============================================================================

/**
 * Convenience wrapper that mimics the previous pageTimer.finish() API.
 * Creates a summary from pre-collected data.
 */
export function finishPageReport(
  pageName: string,
  totalTime: number,
  extras?: {
    authTime?: number
    serverActions?: { name: string; durationMs: number }[]
    sqlQueries?: { label: string; durationMs: number; sql: string }[]
    componentRenders?: { componentName: string; avgMs: number; totalMs: number; renderCount: number }[]
    reactRenderTime?: number
  },
) {
  if (!IS_DEV && !IS_AUDIT) return

  // Repopulate page marks from extras
  if (extras?.authTime) {
    pageMarks.push({ label: 'Authentication', duration: extras.authTime, category: 'layout' })
  }
  if (extras?.serverActions) {
    for (const sa of extras.serverActions) {
      pageMarks.push({ label: `${sa.name}()`, duration: sa.durationMs, category: 'server_action' })
      if (sa.durationMs >= 300) {
        slowOps.push({ type: 'ACTION', name: sa.name, duration: sa.durationMs })
      }
    }
  }
  if (extras?.sqlQueries) {
    for (const q of extras.sqlQueries) {
      if (q.durationMs > 100) {
        pageMarks.push({ label: `DB: ${q.label}`, duration: q.durationMs, category: 'database' })
      }
    }
  }
  if (extras?.reactRenderTime) {
    pageMarks.push({ label: 'Hydration', duration: extras.reactRenderTime, category: 'component' })
  }

  // Print summary
  pageRoute = pageName
  perf.summary(totalTime)
}

// ============================================================================
// Session Summary (across multiple page loads)
// ============================================================================

class SessionRecord {
  pages: Map<string, { times: number[]; count: number }> = new Map()
  startTime: number = Date.now()
  totalPages = 0

  record(pageName: string, loadTimeMs: number) {
    this.totalPages++
    const existing = this.pages.get(pageName) || { times: [], count: 0 }
    existing.times.push(loadTimeMs)
    existing.count++
    this.pages.set(pageName, existing)
  }

  print() {
    if (!IS_DEV || this.totalPages === 0) return
    const duration = Math.round((Date.now() - this.startTime) / 1000)
    const mins = Math.floor(duration / 60)
    const secs = duration % 60

    console.log('')
    console.log('══════════════════════════════════════════════')
    console.log('  PERFORMANCE SESSION SUMMARY')
    console.log(`  Session: ${mins}m ${secs}s | Pages: ${this.totalPages}`)
    console.log('')
    console.log('  Page                      Avg        Best       Worst     Visits')
    console.log('  ────────────────────────────────────────────────────────────────')

    const sorted = Array.from(this.pages.entries())
      .map(([name, data]) => ({
        name,
        avg: Math.round(data.times.reduce((s, t) => s + t, 0) / data.times.length),
        best: Math.round(Math.min(...data.times)),
        worst: Math.round(Math.max(...data.times)),
        count: data.count,
      }))
      .sort((a, b) => b.count - a.count)

    for (const page of sorted) {
      console.log(
        `  ${page.name.padEnd(24)} ` +
        `${formatMs(page.avg).padStart(8)}  ` +
        `${formatMs(page.best).padStart(8)}  ` +
        `${formatMs(page.worst).padStart(8)}  ` +
        `${page.count}x`,
      )
    }
    console.log('══════════════════════════════════════════════')
    console.log('')
  }
}

let _sessionInstance: SessionRecord | null = null

export function getSessionSummary(): SessionRecord {
  if (!_sessionInstance) _sessionInstance = new SessionRecord()
  return _sessionInstance
}

export default perf
