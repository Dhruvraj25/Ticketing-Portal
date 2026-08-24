/**
 * SQL Query Performance Logger
 * 
 * Tracks timing for individual DB queries and generates a per-query
 * performance report. Logs warnings for queries exceeding 500ms.
 * 
 * For EXPLAIN ANALYZE, run manually via psql or Neon console.
 */

const SLOW_QUERY_THRESHOLD_MS = 500

interface QueryStats {
  name: string
  count: number
  totalMs: number
  maxMs: number
  minMs: number
  slowCount: number
}

const queryStats = new Map<string, QueryStats>()

export function getQueryStats(): QueryStats[] {
  return Array.from(queryStats.values())
}

export function resetQueryStats(): void {
  queryStats.clear()
}

export async function timedQuery<T>(
  name: string,
  queryOrFn: Promise<T> | (() => Promise<T>),
): Promise<T> {
  const start = Date.now()

  let result: T
  try {
    if (typeof queryOrFn === 'function') {
      result = await queryOrFn()
    } else {
      result = await queryOrFn
    }
  } catch (err) {
    const elapsed = Date.now() - start
    console.error('  \ud83d\udd34 [SQL] ' + name + ' FAILED after ' + elapsed + 'ms:', err instanceof Error ? err.message : String(err))
    throw err
  }

  const elapsed = Date.now() - start

  const stats = queryStats.get(name) || { name, count: 0, totalMs: 0, maxMs: 0, minMs: Infinity, slowCount: 0 }
  stats.count++
  stats.totalMs += elapsed
  stats.maxMs = Math.max(stats.maxMs, elapsed)
  stats.minMs = Math.min(stats.minMs, elapsed)
  if (elapsed > SLOW_QUERY_THRESHOLD_MS) stats.slowCount++
  queryStats.set(name, stats)

  if (elapsed > SLOW_QUERY_THRESHOLD_MS) {
    const flag = elapsed > 2000 ? '\ud83d\udd34' : elapsed > 1000 ? '\ud83d\udfe1' : '\ud83d\udfe0'
    console.log('  ' + flag + ' [SQL] ' + name + ': ' + elapsed + 'ms (threshold: ' + SLOW_QUERY_THRESHOLD_MS + 'ms)')
  }

  return result
}

export function generateTimingReport(): string {
  const stats = getQueryStats()
  if (stats.length === 0) return 'No queries tracked. Run the dashboard first.'
  stats.sort((a, b) => b.totalMs - a.totalMs)

  const lines: string[] = []
  const now = new Date().toISOString()
  lines.push('')
  lines.push('===== SQL Query Performance Report =====')
  lines.push('Generated: ' + now)
  lines.push('')
  lines.push('Query Name'.padEnd(36) + ' | Calls | Avg(ms) | Max(ms) | Slow |')
  lines.push('-'.repeat(75))

  let grandTotal = 0
  for (const s of stats) {
    const avgMs = Math.round(s.totalMs / s.count)
    grandTotal += s.totalMs
    const name = s.name.padEnd(36).slice(0, 36)
    lines.push(name + ' | ' +
      String(s.count).padStart(5) + ' | ' +
      String(avgMs).padStart(6) + ' | ' +
      String(s.maxMs).padStart(6) + ' | ' +
      String(s.slowCount).padStart(4) + ' |')
  }

  lines.push('-'.repeat(75))
  lines.push('Total SQL time: ' + grandTotal + 'ms across ' + stats.length + ' query types')
  lines.push('')
  lines.push('Note: First-request latency is dominated by Neon cold start (5-15s).')
  lines.push('Subsequent warm requests should be <100ms for most queries.')
  lines.push('For EXPLAIN ANALYZE, run: psql <connection> -c "EXPLAIN ANALYZE <query>"')
  lines.push('')
  lines.push('==========================================')

  return lines.join('\n')
}
