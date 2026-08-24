/**
 * Performance Profiler - SupportHub Phase 1 Benchmark Instrumentation
 * Collects timing data for Server Actions, SQL queries, React renders.
 * Stores data in buffers for report generation.
 */

const IS_DEV = process.env.NODE_ENV !== 'production'
const IS_AUDIT = process.env.PERF_AUDIT === 'true'

// Import live console reporter

//import { finishPageReport } from '@/lib/performance-logger'

// --- Timing Buffer ---

export interface TimingEntry {
  label: string
  durationMs: number
  category: 'server_action' | 'sql_query' | 'page_render' | 'api_route' | 'middleware' | 'auth' | 'react_render' | 'hydration' | 'controller'
  caller?: string
  timestamp: number
  metadata?: Record<string, unknown>
}

let timingBuffer: TimingEntry[] = []
let requestIdCounter = 0

export function getRequestId(): string {
  requestIdCounter++
  return `req_${Date.now()}_${requestIdCounter}`
}

export function resetBuffer() {
  timingBuffer = []
}

export function recordTiming(entry: TimingEntry) {
  if (!IS_DEV && !IS_AUDIT) return
  timingBuffer.push(entry)
}

export function getTimingBuffer(): TimingEntry[] {
  if (!IS_DEV && !IS_AUDIT) return []
  return [...timingBuffer]
}

// ── Per-Request Cache (replaces React.cache()) ────────────────────────────
// Uses a module-level Map keyed by a string (function name + serialized args).
// The cache is cleared at the start of each page request (in PageTimer
// constructor) to prevent cross-request leaks.
//
// Why not React.cache()? Turbopack can have module resolution issues with
// `import { cache } from 'react'` in certain configurations. This custom
// implementation is simpler, more robust, and provides equivalent per-request
// deduplication.

let _requestCache = new Map<string, Promise<unknown>>()

/**
 * Wraps an async function with per-request deduplication.
 * Returns the cached promise if the same key was already used in this request.
 * The cache is automatically cleared at the start of each page request.
 *
 * @param key - A stable string key (e.g. `'getTicketsList::{"page":1}'`)
 * @param fn - The async function to execute (only called on first invocation)
 */
export function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = _requestCache.get(key)
  if (existing) return existing as Promise<T>
  const promise = fn()
  _requestCache.set(key, promise)
  return promise
}

/** Clears the per-request cache — must be called at the start of each request. */
export function clearRequestCache() {
  _requestCache = new Map()
}

// ── Actual Execution Counter (distinguishes cache hits from wrapper calls) ─
// wrapServerAction counts every invocation (including cache hits where the
// cached implementation is skipped). This counter records only actual
// executions of the underlying cached implementation function.

const _actionExecCounts = new Map<string, number>()

/**
 * Call inside a cached implementation to record that an actual execution
 * happened (vs a wrapper-only call that returned a cached promise).
 */
export function recordActionExecution(actionName: string) {
  _actionExecCounts.set(actionName, (_actionExecCounts.get(actionName) || 0) + 1)
}

/** Returns a copy of the actual execution counts for summary reporting. */
export function getActionExecutionCounts(): Record<string, number> {
  return Object.fromEntries(_actionExecCounts)
}

// --- Server Action Wrapper (with action context tracking) ---

type AsyncFunction<T = unknown> = (...args: any[]) => Promise<T>

export function wrapServerAction<T>(
  fnName: string,
  fn: AsyncFunction<T>,
): AsyncFunction<T> {
  const wrapped = async (...args: any[]): Promise<T> => {
    const start = performance.now()
    // Push action context so SQL queries can reference their parent
    pushActionContext(fnName)
    try {
      const result = await fn(...args)
      const duration = performance.now() - start
      // Dev-only: record timing + log slow server actions
      if (IS_DEV) {
        recordTiming({
          label: fnName,
          durationMs: duration,
          category: 'server_action',
          timestamp: Date.now(),
          metadata: { args: args.length },
        })
        if (duration > 100) {
          const flag = duration > 1000 ? '🔴' : duration > 500 ? '🟡' : duration > 200 ? '🟠' : '~'
          console.warn(`  ${flag} [ACTION] ${fnName.padEnd(36)} ${Math.round(duration)}ms`)
        }
      }
      return result
    } catch (error) {
      const duration = performance.now() - start
      if (IS_DEV) {
        recordTiming({
          label: `${fnName} (FAILED)`,
          durationMs: duration,
          category: 'server_action',
          timestamp: Date.now(),
          metadata: { error: String(error) },
        })
        console.error(`  🔴 [ACTION] ${fnName} FAILED after ${Math.round(duration)}ms`)
      }
      throw error
    } finally {
      popActionContext()
    }
  }
  return wrapped
}

// ─── Action Context Stack (tracks which server action is currently executing) ─

let actionContextStack: string[] = []

export function pushActionContext(actionName: string) {
  actionContextStack.push(actionName)
}

export function popActionContext() {
  actionContextStack.pop()
}

export function getCurrentActionContext(): string | undefined {
  return actionContextStack[actionContextStack.length - 1]
}

// --- SQL Query Timing ---

export interface SqlTimingEntry {
  queryLabel: string
  durationMs: number
  truncatedSql: string
  queryNumber: number
  parentAction?: string
  rows?: number
}

let sqlQueryBuffer: SqlTimingEntry[] = []
let sqlQueryCounter = 0

export function resetSqlBuffer() {
  sqlQueryBuffer = []
  sqlQueryCounter = 0
}

export function recordSqlTiming(durationMs: number, sql: string, rows?: number): number {
  if (!IS_DEV && !IS_AUDIT) return 0
  sqlQueryCounter++
  const truncated = sql.replace(/\s+/g, ' ').substring(0, 100)
  const parentAction = getCurrentActionContext()
  sqlQueryBuffer.push({
    queryLabel: `[SQL #${sqlQueryCounter}]`,
    durationMs,
    truncatedSql: truncated,
    queryNumber: sqlQueryCounter,
    parentAction,
    rows,
  })
  recordTiming({
    label: `SQL #${sqlQueryCounter}`,
    durationMs,
    category: 'sql_query',
    timestamp: Date.now(),
    metadata: { sql: truncated, parentAction, rows },
  })
  return sqlQueryCounter
}

export function getSqlQueryBuffer(): SqlTimingEntry[] {
  if (!IS_DEV && !IS_AUDIT) return []
  return [...sqlQueryBuffer]
}

// --- Benchmark Report ---

export interface BenchmarkReport {
  generatedAt: string
  requestId: string
  summary: {
    totalServerActions: number
    totalSqlQueries: number
    totalApiRoutes: number
    totalDurationMs: number
  }
  slowestServerActions: TimingEntry[]
  slowestSqlQueries: TimingEntry[]
  pageWaterfall: TimingEntry[]
  categoryBreakdown: Record<string, { count: number; totalMs: number; avgMs: number }>
  fullTimeline: TimingEntry[]
}

export function generateReport(requestId?: string): BenchmarkReport {
  if (!IS_DEV && !IS_AUDIT) {
    return {
      generatedAt: new Date().toISOString(),
      requestId: requestId || '',
      summary: { totalServerActions: 0, totalSqlQueries: 0, totalApiRoutes: 0, totalDurationMs: 0 },
      slowestServerActions: [],
      slowestSqlQueries: [],
      pageWaterfall: [],
      categoryBreakdown: {},
      fullTimeline: [],
    }
  }
  const rid = requestId || getRequestId()
  const entries = getTimingBuffer()
  const sqlEntries = getSqlQueryBuffer()
  const totalDuration = entries.reduce((sum, e) => sum + e.durationMs, 0)

  const serverActions = entries
    .filter(e => e.category === 'server_action')
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 20)

  const slowestSql = entries
    .filter(e => e.category === 'sql_query')
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 20)

  const categoryBreakdown: Record<string, { count: number; totalMs: number; avgMs: number }> = {}
  for (const e of entries) {
    if (!categoryBreakdown[e.category]) {
      categoryBreakdown[e.category] = { count: 0, totalMs: 0, avgMs: 0 }
    }
    categoryBreakdown[e.category].count++
    categoryBreakdown[e.category].totalMs += e.durationMs
  }
  for (const key of Object.keys(categoryBreakdown)) {
    categoryBreakdown[key].avgMs = Math.round((categoryBreakdown[key].totalMs / categoryBreakdown[key].count) * 10) / 10
  }

  return {
    generatedAt: new Date().toISOString(),
    requestId: rid,
    summary: {
      totalServerActions: serverActions.length,
      totalSqlQueries: sqlEntries.length,
      totalApiRoutes: entries.filter(e => e.category === 'api_route').length,
      totalDurationMs: Math.round(totalDuration),
    },
    slowestServerActions: serverActions,
    slowestSqlQueries: slowestSql,
    pageWaterfall: entries.filter(e => e.category !== 'sql_query'),
    categoryBreakdown,
    fullTimeline: entries,
  }
}

/** @deprecated Use the centralized perf logger from '@/lib/performance-logger' instead */
export function printBenchmarkReport(report: BenchmarkReport, pageTitle: string = 'Page') {
  // Consolidated into centralized performance-logger
}

// --- Page Timer ---

export class PageTimer {
  private title: string
  private marks: { label: string; durationMs: number }[] = []
  private startTime: number
  private cumulative = 0

  constructor(title: string) {
    this.title = title
    this.startTime = performance.now()
    resetBuffer()
    resetSqlBuffer()
    clearRequestCache()
  }

  mark(label: string, durationMs?: number) {
    if (durationMs !== undefined) {
      this.marks.push({ label, durationMs })
      this.cumulative += durationMs
    } else {
      const now = performance.now()
      const elapsed = now - this.startTime - this.cumulative
      this.marks.push({ label, durationMs: Math.round(elapsed * 100) / 100 })
      this.cumulative += elapsed
    }
    recordTiming({
      label,
      durationMs: this.marks[this.marks.length - 1].durationMs,
      category: 'page_render',
      timestamp: Date.now(),
    })
  }

  finish(): BenchmarkReport {
    const total = this.marks.reduce((s, m) => s + m.durationMs, 0)
    const requestId = getRequestId()

    const report = generateReport(requestId)

    // Use centralized logger instead of inline console.log
    // finishPageReport(this.title, total, {
    //   serverActions: getTimingBuffer()
    //     .filter(e => e.category === 'server_action')
    //     .slice(0, 10)
    //     .map(e => ({ name: e.label, durationMs: e.durationMs })),
    //   sqlQueries: getSqlQueryBuffer()
    //     .slice(0, 20)
    //     .map(e => ({
    //       label: e.queryLabel,
    //       durationMs: e.durationMs,
    //       sql: e.truncatedSql,
    //     })),
    //   reactRenderTime: getTimingBuffer()
    //     .filter(e => e.category === 'react_render')
    //     .reduce((s, e) => s + e.durationMs, 0),
    //   componentRenders: getComponentRenderReport().slice(0, 10).map(c => ({
    //     componentName: c.componentName,
    //     avgMs: c.avgMs,
    //     totalMs: c.totalMs,
    //     renderCount: c.renderCount,
    //   })),
    // })

    return report
  }
}

// --- React Component Render Timing ---

const componentTimers = new Map<string, { count: number; totalMs: number }>()

export function startComponentRender(componentName: string): number {
  if (!IS_DEV && !IS_AUDIT) return 0
  return performance.now()
}

export function endComponentRender(componentName: string, startTime: number) {
  if (!IS_DEV || !startTime) return
  const duration = performance.now() - startTime
  const existing = componentTimers.get(componentName) || { count: 0, totalMs: 0 }
  existing.count++
  existing.totalMs += duration
  componentTimers.set(componentName, existing)

  if (duration > 16) {
    recordTiming({
      label: `${componentName} (render)`,
      durationMs: Math.round(duration * 100) / 100,
      category: 'react_render',
      timestamp: Date.now(),
      metadata: { renderCount: existing.count },
    })
  }
}

export function getComponentRenderReport() {
  return Array.from(componentTimers.entries())
    .map(([name, data]) => ({
      componentName: name,
      renderCount: data.count,
      avgMs: Math.round((data.totalMs / data.count) * 100) / 100,
      totalMs: Math.round(data.totalMs),
    }))
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 20)
}

/** @deprecated Use perf.component() from centralized logger */
export function printComponentReport() {
  // Consolidated into centralized performance-logger
}

export function resetAll() {
  if (!IS_DEV && !IS_AUDIT) return
  resetBuffer()
  resetSqlBuffer()
  componentTimers.clear()
  sqlQueryCounter = 0
  requestIdCounter = 0
  clearRequestCache()
}
