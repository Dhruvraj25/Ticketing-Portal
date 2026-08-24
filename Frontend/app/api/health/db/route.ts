/**
 * Database Health Check & Warmup Endpoint
 *
 * GET /api/health/db
 *
 * Purpose:
 * - Pre-warms the database connection pool before the first user request
 * - Verifies the pool is healthy (connections are functional)
 * - Returns pool statistics for monitoring
 *
 * Call this after deployment to trigger Neon cold start BEFORE the
 * first user hits the dashboard. This transforms the user's 32-second
 * cold-start wait into a sub-second warm response.
 *
 * Integration:
 * - Deploy script: curl https://app.example.com/api/health/db after build
 * - Cron job: every 4 minutes to prevent Neon spin-down
 * - Docker HEALTHCHECK: every 30s
 */

import { NextResponse } from 'next/server'
import { pool, waitForDb, getConnectionLifecycleStats } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const start = Date.now()

  // Step 1: Wait for pool warmup (blocks until connections are established)
  const warmedUp = await waitForDb(35000)

  const warmupTime = Date.now() - start

  if (!warmedUp) {
    return NextResponse.json(
      {
        status: 'degraded',
        message: 'Pool warmup timed out — queries will cold-start',
        warmupMs: warmupTime,
        pool: getConnectionLifecycleStats(),
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    )
  }

  // Step 2: Verify connectivity with a lightweight query
  let connectivityOk = false
  let queryTime = 0
  try {
    const qStart = Date.now()
    const client = await pool.connect()
    await client.query('SELECT 1 AS health_check')
    client.release()
    queryTime = Date.now() - qStart
    connectivityOk = true
  } catch (err) {
    connectivityOk = false
    queryTime = Date.now() - warmupTime
  }

  const stats = getConnectionLifecycleStats()

  const response = {
    status: connectivityOk ? 'healthy' : 'unhealthy',
    message: connectivityOk
      ? `Pool warm (warmup: ${warmupTime}ms, query: ${queryTime}ms)`
      : `Pool not responding (elapsed: ${warmupTime}ms)`,
    warmupMs: warmupTime,
    queryMs: queryTime,
    pool: {
      totalConnections: stats.totalConnections,
      idleConnections: stats.idleConnections,
      activeConnections: stats.activeConnections,
      waitingClients: stats.waitingClients,
      connectionTimeouts: stats.connectionTimeouts,
      connectionErrors: stats.connectionErrors,
      isLeaking: stats.isLeaking,
    },
    timestamp: new Date().toISOString(),
  }

  const statusCode = connectivityOk ? 200 : 503
  return NextResponse.json(response, { status: statusCode })
}
