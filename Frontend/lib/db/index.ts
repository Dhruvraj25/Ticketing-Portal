import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import { recordSqlTiming, getCurrentActionContext } from '@/lib/performance-profiler'

// Use globalThis.performance instead of perf_hooks for Edge Runtime compatibility
const performance = globalThis.performance

/**
 * NOTE: `min` is NOT a valid pg.Pool option and is silently ignored.
 * The pool starts with 0 connections; idle connections are maintained
 * by the keep-alive mechanism below.
 *
 * Sanitize the DATABASE_URL for compatibility with the pg (node-postgres) driver.
 * Strips unsupported options like `channel_binding=require` which is a libpq
 * feature not available in the pure-JS pg driver.
 */
function sanitizeConnectionUrl(url: string | undefined): string | undefined {
  if (!url) return url
  // Remove `channel_binding=require` (not supported by node-postgres)
  let sanitized = url.replace(/[&?]channel_binding=require/gi, '')
  // Clean up trailing & or ? left behind after removal
  sanitized = sanitized.replace(/[?&]$/, '')
  return sanitized
}

/**
 * Database Connection Pool
 *
 * ═══ Critical Configuration ═══
 *
 * Root cause analysis (benchmark confirmed):
 * - The 5000ms connectionTimeout was TOO AGGRESSIVE for Neon DB free tier.
 *   Neon cold starts take 10-30s (compute spins down after ~5min idle).
 *   Every connection attempt timed out at 5s, causing cascading failures:
 *     warmup failed → keep-alive never started → pool stayed cold →
 *     first real query also timed out → "connection terminated" error
 *
 * Fixes applied:
 * 1. connectionTimeoutMillis: 20000 (was 15000→5000) — 20s gives Neon
 *    ample time to cold-start even under load.
 * 2. idleTimeoutMillis: 120000 (was 30000→10000) — MUST exceed the
 *    keep-alive interval (60s). Otherwise, connections are terminated by
 *    the idle timeout before the next keep-alive can refresh them,
 *    leaving the pool empty for ~30s windows between pings.
 * 3. keepAlive: true — TCP-level keep-alive detects dead connections
 *    and prevents accumulation of stale sockets in the pool.
 * 4. Removed `min: 2` — pg.Pool does NOT support a `min` option.
 *    It is silently ignored. Minimum connections are maintained by the
 *    periodic keep-alive mechanism below.
 * 5. Removed maxUses: 7500 — NOT a standard pg.Pool option.
 *    It belongs to pg-pool (a different library) and was silently ignored.
 *
 * ═══ Neon Connection Architecture ═══
 * Uses Neon's pooler endpoint (*-pooler.*.neon.tech). The pooler multiplexes
 * many PostgreSQL connections through fewer actual compute connections.
 * For a Next.js server, the pooler is appropriate.
 *
 * For local dev, a DIRECT connection (drop `-pooler` suffix) reduces
 * latency by ~5-10ms per query but consumes 1 compute slot per connection.
 * With max=25, direct would need 25 slots — exceeding Neon free tier (20).
 */
export const pool = new Pool({
  connectionString: sanitizeConnectionUrl(process.env.DATABASE_URL),
  max: process.env.DATABASE_POOL_MAX ? parseInt(process.env.DATABASE_POOL_MAX) : 25,
  connectionTimeoutMillis: 20000,  // 20s for Neon cold starts (was 15s)
  idleTimeoutMillis: 120000,  // ↑ 30s→120s: must exceed keep-alive interval (60s)
  keepAlive: true,           // TCP-level keep-alive detects dead connections
})

// Track connection timeout errors for health monitoring
let connectionTimeoutCount = 0
let connectionErrorCount = 0

// Handle pool-level errors gracefully instead of crashing the process
pool.on('error', (err) => {
  // Track timeout errors separately — these indicate Neon cold start or network issues
  if ((err as any).code === 'ETIMEDOUT' || (err as any).code === '57014' || err.message?.includes('timeout')) {
    connectionTimeoutCount++
  } else {
    connectionErrorCount++
  }
  // Silently handle in audit/production mode
  if (process.env.NODE_ENV === 'production' && process.env.PERF_AUDIT !== 'true') {
    console.error('[DB Pool] Unexpected error on idle client:', err.message)
  }
})

// ── Connection Pool Warmup ────────────────────────────────────────────────
//
// Root cause: Previous warmup used pool.query('SELECT 1') with 5000ms timeout
// and 3 retries at 1/2/4s delays. Each attempt timed out at 5s. After 18s total
// all retries exhausted, the pool stayed cold, keep-alive never started.
//
// Fixes:
// 1. Use pool.connect() instead of pool.query() — establishes TCP connection
//    first. Once TCP connects, the Neon compute is ready for queries.
// 2. connectionTimeoutMillis: 15000 (pool default) — gives Neon 15s per attempt.
// 3. 1 retry after 5s delay — total window ~35s for Neon cold start.
// 4. Keep-alive starts INDEPENDENTLY of warmup success.

const WARMUP_CONNECTIONS = 5      // pre-warm enough for dashboard burst
// Reduced from 120s to 60s — Neon free tier can spin down after ~5min of
// idle, but the keep-alive must fire often enough to catch transient pool
// drains (connection drops, restart, etc.). 60s is conservative and ensures
// the pool never goes cold between user requests.
const KEEPALIVE_INTERVAL_MS = 60_000

let _warmupCompleted = false
let _keepAliveTimer: ReturnType<typeof setInterval> | null = null

// Promise-based warmup tracker — blocks the first request until the pool
// is fully warm, instead of the previous fire-and-forget approach where
// the first request raced against the async warmup.
let _warmupResolve: (() => void) | null = null
const _warmupPromise = new Promise<void>((resolve) => {
  _warmupResolve = resolve
})

/**
 * Warm up a single connection using pool.connect() — establishes TCP + Neon compute.
 * Uses the pool's 20000ms connectionTimeoutMillis. Retries once after 5s delay.
 * On success, runs SELECT 1 to verify the connection is fully functional.
 */
async function warmupPrimaryConnection(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let client: any = null
    try {
      // pool.connect() establishes TCP — this is what wakes Neon from cold start.
      // Once connect() resolves, the Neon compute is ready for queries.
      client = await pool.connect()
      // Verify the connection with a lightweight query
      await client.query('SELECT 1 AS warmup')
      client.release()
      client = null
      _warmupCompleted = true
      if (process.env.NODE_ENV !== 'production') {
        console.log(`  [DB] Connection pool warmed up (attempt ${attempt + 1})`)
      }
      return true
    } catch (err) {
      if (client) {
        try { client.release() } catch { /* ignore */ }
        client = null
      }
      if (attempt === 0) {
        // Wait 5s for Neon to finish cold start before retrying
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`  [DB] Warmup attempt 1 failed, retrying in 5s:`, (err as Error).message)
        }
        await new Promise((resolve) => setTimeout(resolve, 5000))
      } else {
        console.warn('[DB] All warmup attempts exhausted. Queries will cold-start lazily:', (err as Error).message)
      }
    }
  }
  return false
}

/**
 * Warm up additional connections via pool.connect() for concurrent burst handling.
 * Fire-and-forget: individual failures are silently ignored.
 */
async function warmAdditionalConnections(count: number): Promise<void> {
  const tasks: Promise<void>[] = []
  for (let i = 0; i < count; i++) {
    tasks.push(
      (async () => {
        let c: any = null
        try {
          c = await pool.connect()
          await c.query('SELECT 1 AS warmup')
          c.release()
        } catch {
          if (c) { try { c.release() } catch { /* ignore */ } }
        }
      })(),
    )
  }
  await Promise.all(tasks)
}

/**
 * Periodic keep-alive to prevent NeonDB from spinning down.
 * Uses pool.connect() + immediate release — no SELECT 1 needed because
 * a successful connect() proves the TCP connection and Neon compute are live.
 * The connect() itself is the liveness check; SELECT 1 would add an unnecessary
 * round-trip (~5-10ms via pooler) every 2 minutes for no diagnostic value.
 * Starts unconditionally (even if warmup failed) to catch Neon when available.
 */
function startKeepAlive() {
  if ((globalThis as any).__dbKeepAliveTimer) return

  const timer = setInterval(async () => {
    let client: any = null
    try {
      // pool.connect() succeeds only if TCP connects AND Neon compute is ready.
      // No need for SELECT 1 — if connect resolved, the connection works.
      client = await pool.connect()
      client.release()
    } catch {
      if (client) { try { client.release() } catch { /* ignore */ } }
      if (process.env.NODE_ENV !== 'production') {
        console.warn('  [DB] Keep-alive ping failed (pool may be cold)')
      }
    }
  }, KEEPALIVE_INTERVAL_MS)
  ;(globalThis as any).__dbKeepAliveTimer = timer
  _keepAliveTimer = timer

  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    timer.unref()
  }
}

// ── Bootstrap: warmup + keep-alive run in parallel ───────────────────────
// The keep-alive starts immediately even if warmup fails. This ensures that
// once Neon becomes available (e.g., after a slow cold start), the keep-alive
// will catch it and maintain the connection.

warmupPrimaryConnection().then((success) => {
  if (success) {
    // Warm additional connections in parallel
    warmAdditionalConnections(WARMUP_CONNECTIONS - 1).then(() => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`  [DB] ${WARMUP_CONNECTIONS} connections pre-warmed for concurrent load`)
      }
    })
  }
  // Resolve the warmup promise whether or not we succeeded.
  // If warmup failed, the first request will cold-start the pool itself.
  if (_warmupResolve) {
    _warmupResolve()
    _warmupResolve = null
  }
})

// Start keep-alive unconditionally — will connect once Neon is available
startKeepAlive()

/**
 * Block until the database connection pool is warm.
 * Call this at the start of any critical path (dashboard, first request)
 * to ensure the pool has had time to establish TCP connections before
 * the first real query executes.
 *
 * Without this, the first request's queries race against the async warmup:
 *   Warmup:  ───[connect]──[SELECT 1]───[resolve]
 *   Request:  ─────[await db.select(...)]───⚠️  pool not ready yet
 *
 * With this:
 *   Warmup:  ───[connect]──[SELECT 1]───[resolve]
 *   Request:  ──[waitForDb]──[await db.select(...)]───✅
 *
 * The timeout (30s) ensures we don't hang forever if Neon is unreachable.
 */
export async function waitForDb(timeoutMs = 30000): Promise<boolean> {
  if (_warmupCompleted) return true

  try {
    await Promise.race([
      _warmupPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Database warmup timed out')), timeoutMs),
      ),
    ])
    return true
  } catch {
    console.warn('[DB] waitForDb timed out after ' + timeoutMs + 'ms — queries will cold-start')
    return false
  }
}

// ── Connection Pool Instrumentation ───────────────────────────────────────
// Wraps pool.connect to measure time waiting for a connection from the pool.
// This identifies connection contention as a bottleneck.

const IS_DEV_SQL = process.env.NODE_ENV !== 'production'

// Track cumulative SQL time for the current request
let sqlTimeTotal = 0
let sqlQueryCount = 0

// Connection pool statistics
export interface ConnectionPoolStats {
  totalConnections: number
  connectionWaitTotalMs: number
  connectionWaitCount: number
  activeConnections: number
  idleConnections: number
  waitingClients: number
}

let connectionPoolStats: ConnectionPoolStats = {
  totalConnections: 0,
  connectionWaitTotalMs: 0,
  connectionWaitCount: 0,
  activeConnections: 0,
  idleConnections: 0,
  waitingClients: 0,
}

export function getConnectionPoolStats(): ConnectionPoolStats {
  return { ...connectionPoolStats }
}

export function resetConnectionPoolStats() {
  connectionPoolStats = {
    totalConnections: 0, connectionWaitTotalMs: 0, connectionWaitCount: 0,
    activeConnections: 0, idleConnections: 0, waitingClients: 0,
  }
}

export function resetSqlTiming() {
  sqlTimeTotal = 0
  sqlQueryCount = 0
}

export function getSqlTiming() {
  return { totalMs: sqlTimeTotal, count: sqlQueryCount }
}

// Track connection release times
let lastReleaseTime = 0
let maxWaitTime = 0

// ── Connection Lifecycle Audit ────────────────────────────────────────────
// Tracks connect/release counts to detect connection leaks.
// A leak occurs when connect count > release count + currently active.
let totalConnects = 0
let totalReleases = 0

export function getConnectionLifecycleStats() {
  return {
    totalConnects,
    totalReleases,
    activeConnections: pool.totalCount - pool.idleCount,
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
    maxConnectionWaitMs: Math.round(maxWaitTime),
    avgConnectionWaitMs: connectionPoolStats.connectionWaitCount > 0
      ? Math.round(connectionPoolStats.connectionWaitTotalMs / connectionPoolStats.connectionWaitCount)
      : 0,
    isLeaking: totalConnects > totalReleases + (pool.totalCount - pool.idleCount),
    connectionTimeouts: connectionTimeoutCount,
    connectionErrors: connectionErrorCount,
  }
}

export function resetConnectionLifecycleStats() {
  totalConnects = 0
  totalReleases = 0
  maxWaitTime = 0
}

// Listen for pool drain to detect if connections are being released properly
pool.on('remove', () => {
  if (process.env.NODE_ENV !== 'production') {
    const leaked = totalConnects - totalReleases - (pool.totalCount - pool.idleCount)
    if (leaked > 1) {
      console.warn(`  [Pool] ⚠️  Potential connection leak: ${leaked} unreturned connections`)
    }
  }
})

/**
 * Audit the PostgreSQL pool and print a comprehensive report.
 * Checks: single shared pool, connection lifecycle, pool limits.
 */


/**
 * Print a snapshot of the current PostgreSQL pool state.
 * Shows active connections, idle connections, and waiting clients.
 */


// Wrap pool.connect to measure time waiting for a connection from the pool.
// This is the PRIMARY instrumentation for detecting pool exhaustion.
// Every pool.connect() call is intercepted: we record the wait start time,
// then instrument the returned client to track connection release.
//
// IMPORTANT: Connection acquisition time is measured and logged SEPARATELY
// from SQL execution time. This lets us distinguish:
//   - "Query is slow" (SQL execution) vs
//   - "Pool is exhausted" (connection wait).
const originalPoolConnect = pool.connect.bind(pool) as (...args: any[]) => any
pool.connect = function (
  this: typeof pool,
  callback?: (err: Error | null, client: any, release: any) => void,
): any {
  // ═══ ALWAYS measure wait time (even in production) ═══
  // performance.now() is sub-microsecond — no measurable overhead.
  // Production needs this data to detect pool exhaustion.
  const waitStart = performance.now()
  const result = originalPoolConnect(callback as any)

  if (result && typeof (result as Promise<unknown>).then === 'function') {
    return (result as Promise<unknown>).then((client: any) => {
      const waitTime = performance.now() - waitStart

      // ── Connection wait counters (ALWAYS tracked, even in production) ──
      connectionPoolStats.connectionWaitCount++
      connectionPoolStats.connectionWaitTotalMs += waitTime
      connectionPoolStats.totalConnections = pool.totalCount
      connectionPoolStats.idleConnections = pool.idleCount
      connectionPoolStats.waitingClients = pool.waitingCount

      // Track per-connection wait time for reporting (max wait tracking)
      maxWaitTime = Math.max(maxWaitTime, waitTime)

      // Detect pool exhaustion: waitingCount > 0 when we get a connection
      if (pool.waitingCount > 0 || waitTime > 100) {
        connectionPoolStats.waitingClients = pool.waitingCount
      }

      // Increment connect counter
      totalConnects++

      // ── SEPARATE CONNECTION ACQUISITION LOG (dev-only, no prod noise) ──
      if (IS_DEV_SQL && waitTime > 5) {
        const actionCtx = getCurrentActionContext()
        const ctxTag = actionCtx ? ` [${actionCtx}]` : ''
        if (waitTime > 200) {
          console.warn(`  🟡 [CONN] Acquired connection in ${Math.round(waitTime)}ms${ctxTag} (pool: ${pool.totalCount} total, ${pool.idleCount} idle, ${pool.waitingCount} waiting)`)
        } else if (waitTime > 50) {
          console.log(`  ~ [CONN] Acquired connection in ${Math.round(waitTime)}ms${ctxTag} (pool: ${pool.totalCount} total, ${pool.idleCount} idle, ${pool.waitingCount} waiting)`)
        }
      }

      // Wrap client.release() to measure connection release timing
      if (client && typeof client.release === 'function') {
        const originalRelease = client.release.bind(client)
        client.release = (...releaseArgs: any[]) => {
          totalReleases++
          const releaseStart = performance.now()
          const releaseResult = originalRelease(...releaseArgs)
          const releaseTime = performance.now() - releaseStart
          lastReleaseTime = releaseTime
          return releaseResult
        }
      }

      return client
    })
  }

  return result
} as typeof pool.connect

// ── SQL Query Timing ──────────────────────────────────────────────────────
// Wrap pool.query to measure execution time of every SQL statement.
// This catches ALL queries (drizzle select/insert/update/delete/execute)
// without modifying drizzle internals or breaking connection lifecycle.

const originalPoolQuery = pool.query.bind(pool) as unknown as (
  queryTextOrConfig: string | { text: string; values?: unknown[] },
  values?: unknown[] | ((err: Error | null, result: unknown) => void),
  callback?: (err: Error | null, result: unknown) => void,
) => Promise<unknown> | void

// Type-safe replacement for pool.query
pool.query = function (
  this: typeof pool,
  queryTextOrConfig: string | { text: string; values?: unknown[] },
  values?: unknown[] | ((err: Error | null, result: unknown) => void),
  callback?: (err: Error | null, result: unknown) => void,
): Promise<unknown> | void {
  const start = IS_DEV_SQL ? performance.now() : 0

  // Extract the SQL text regardless of calling convention
  const queryText =
    typeof queryTextOrConfig === 'string'
      ? queryTextOrConfig
      : queryTextOrConfig?.text || ''

  // Forward to original pool.query (type-safe cast for the result)
  const result = originalPoolQuery(queryTextOrConfig, values as any, callback as any)

  // Helper to extract row count from the result
  const getRowCount = (res: unknown): number | undefined => {
    if (res && typeof res === 'object' && 'rowCount' in res) {
      const rc = (res as { rowCount: number | null }).rowCount
      return rc !== null ? rc : undefined
    }
    return undefined
  }

  // Handle Promise-based API (the common case with drizzle)
  if (result && typeof (result as Promise<unknown>).then === 'function') {
    return (result as Promise<unknown>).then((res) => {
      if (IS_DEV_SQL) {
        const duration = performance.now() - start
        sqlTimeTotal += duration
        sqlQueryCount++
        const rows = getRowCount(res)

        // Record to profiler buffer (with rows + parent action from action context stack)
        const parentAction = getCurrentActionContext()
        recordSqlTiming(duration, queryText, rows)

        // Dev-only: log slow SQL queries (>100ms) to identify bottlenecks
        if (IS_DEV_SQL && duration > 100) {
          const truncated = queryText.replace(/\s+/g, ' ').substring(0, 80)
          const parentAction = getCurrentActionContext()
          const rowsInfo = rows !== undefined ? ` rows:${rows}` : ''
          const flag = duration > 1000 ? '🔴' : duration > 500 ? '🟡' : duration > 200 ? '🟠' : '~'
          const actionTag = parentAction ? ` [${parentAction}]` : ''
          console.log(`  ${flag} [SQL]  ${('[#' + sqlQueryCount + ']').padEnd(8)} ${Math.round(duration)}ms${rowsInfo} ${truncated}${actionTag}`)
        }
      }
      return res
    }).catch((err: Error) => {
      // Record timing even on failure
      if (IS_DEV_SQL) {
        const duration = performance.now() - start
        sqlTimeTotal += duration
        sqlQueryCount++
        recordSqlTiming(duration, queryText)
      }
      console.error('[DB] SQL query failed:', err.message)
      throw err
    })
  }

  return result
} as typeof pool.query

export const db = drizzle(pool, { schema })
