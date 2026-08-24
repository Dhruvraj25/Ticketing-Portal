import { NextResponse } from 'next/server'
import { pool, getConnectionLifecycleStats, getConnectionPoolStats } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Health Check Endpoint
 *
 * Returns the health status of the application including:
 * - Server status (always OK if reachable)
 * - Database connectivity (lightweight query)
 * - Pool health (active/idle/waiting connections, leak detection)
 * - Connection acquisition latency (avg/max wait times)
 * - Memory usage
 * - Uptime
 *
 * Used by monitoring services and load balancers to verify
 * the application is healthy and ready to serve traffic.
 */
export async function GET() {
  const start = performance.now()

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    database: { status: 'unknown', latencyMs: 0 },
    pool: {} as Record<string, unknown>,
  }

  // Collect pool health stats (always available, doesn't require a query)
  const lifecycle = getConnectionLifecycleStats()
  const poolStats = getConnectionPoolStats()
  health.pool = {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    activeConnections: pool.totalCount - pool.idleCount,
    waitingClients: pool.waitingCount,
    totalConnects: lifecycle.totalConnects,
    totalReleases: lifecycle.totalReleases,
    isLeaking: lifecycle.isLeaking,
    maxConnectionWaitMs: lifecycle.maxConnectionWaitMs,
    avgConnectionWaitMs: lifecycle.avgConnectionWaitMs,
    connectionWaitCount: poolStats.connectionWaitCount,
  }

  // Check database connectivity with a lightweight query
  try {
    const dbStart = performance.now()
    await pool.query('SELECT 1 AS health_check')
    const dbLatency = Math.round(performance.now() - dbStart)
    health.database = { status: 'connected', latencyMs: dbLatency }
  } catch (err) {
    health.status = 'degraded'
    health.database = {
      status: 'disconnected',
      latencyMs: Math.round(performance.now() - start),
    }
  }

  const responseTime = Math.round(performance.now() - start)

  return NextResponse.json(
    {
      ...health,
      responseTimeMs: responseTime,
      environment: process.env.NODE_ENV || 'development',
    },
    {
      status: health.status === 'healthy' ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
}
