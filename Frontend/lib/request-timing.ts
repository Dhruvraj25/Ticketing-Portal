/**
 * SupportHub Request Timing Utilities
 *
 * Provides lightweight timing instrumentation for page loads.
 * In development mode, timing data is collected internally for
 * the centralized perf logger. In production, all methods are no-ops.
 *
 * @deprecated Use the centralized perf logger from '@/lib/performance-logger' instead.
 */

const IS_DEV = process.env.NODE_ENV !== 'production'

interface TimingPoint {
  label: string
  start: number
}

let points: TimingPoint[] = []
let started = false
let startTime = 0

/**
 * Start timing from this point. Must be called before the first mark().
 */
export function startTimer() {
  startTime = performance.now()
  started = true
}

/**
 * Mark the completion of a phase. Records the elapsed time.
 * Data collected internally — console output consolidated into perf logger.
 */
export function mark(label: string) {
  if (!IS_DEV) return

  const now = performance.now()

  if (!started) {
    startTime = now
    started = true
  }

  const elapsed = Math.round((now - startTime) * 100) / 100
  points.push({ label, start: elapsed })
  startTime = now
}

// ─── Deep Function Tracing ─────────────────────────────────────────────────

interface PhaseTiming {
  label: string
  duration: number
  subphases?: PhaseTiming[]
}

const phaseStack: PhaseTiming[][] = []
let allPhases: PhaseTiming[] = []

/**
 * Wraps an async function with deep tracing.
 * In production, measures timing but no console output.
 */
export async function traceFunction<T>(
  label: string,
  fn: () => Promise<T>,
  callerHint?: string,
): Promise<{ result: T; duration: number }> {
  const currentPhase: PhaseTiming = { label, duration: 0, subphases: [] }
  phaseStack.push(currentPhase.subphases!)

  const start = performance.now()
  try {
    const result = await fn()
    const duration = performance.now() - start
    currentPhase.duration = duration

    phaseStack.pop()

    if (phaseStack.length > 0) {
      phaseStack[phaseStack.length - 1].push(currentPhase)
    } else {
      allPhases.push(currentPhase)
    }

    return { result, duration }
  } catch (error) {
    const duration = performance.now() - start
    currentPhase.duration = duration
    phaseStack.pop()

    if (phaseStack.length > 0) {
      phaseStack[phaseStack.length - 1].push(currentPhase)
    } else {
      allPhases.push(currentPhase)
    }

    throw error
  }
}

/**
 * Print a consolidated timing report.
 * Console output consolidated into centralized perf logger.
 *
 * @param title - Page name like 'Dashboard'
 */
export function printWaterfall(title: string) {
  if (!IS_DEV) return

  if (allPhases.length === 0) return

  const total = allPhases.reduce((s, p) => s + p.duration, 0)

  allPhases.length = 0
  phaseStack.length = 0
  _currentMark = null
}

let _currentMark: { label: string; start: number } | null = null

export function markStart(label: string, additionalInfo?: string) {
  if (!IS_DEV) return
  _currentMark = { label, start: performance.now() }
}

export function markEnd() {
  if (!IS_DEV || !_currentMark) return
  _currentMark = null
}

/**
 * Print a consolidated timing report for the full request.
 */
export function printReport(title: string, sqlStats?: { count: number; totalMs: number }) {
  if (!IS_DEV) {
    points = []
    started = false
    startTime = 0
    return
  }

  points = []
  started = false
  startTime = 0
}

/**
 * Alias for printReport — kept for backward compatibility.
 */
export const summary = printReport

/**
 * Clear all timing data without printing.
 */
export function clearTiming() {
  points = []
  started = false
  startTime = 0
  allPhases.length = 0
  phaseStack.length = 0
  _currentMark = null
}
