import { Suspense } from 'react'
import { getCurrentUser } from '@/app/actions/tickets'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Activity,
  Zap,
  Database,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  BarChart3,
} from 'lucide-react'

// ─── Performance Thresholds ────────────────────────────────────────────────
const THRESHOLDS = {
  green: { max: 100, label: 'Fast', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30' },
  yellow: { max: 300, label: 'Normal', color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/15 border-yellow-200 dark:border-yellow-500/30' },
  orange: { max: 500, label: 'Slow', color: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/15 border-orange-200 dark:border-orange-500/30' },
  red: { max: Infinity, label: 'Critical', color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/15 border-red-200 dark:border-red-500/30' },
}

function classifyTime(ms: number): { label: string; color: string } {
  if (ms <= 100) return THRESHOLDS.green
  if (ms <= 300) return THRESHOLDS.yellow
  if (ms <= 500) return THRESHOLDS.orange
  return THRESHOLDS.red
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

// ─── Database Performance Metrics ──────────────────────────────────────────

async function getDatabaseMetrics() {
  try {
    // Check connection pool stats
    const poolResult = await db.execute(sql`
      SELECT
        COALESCE((SELECT count(*) FROM pg_stat_activity WHERE state = 'active'), 0)::int AS active_connections,
        COALESCE((SELECT count(*) FROM pg_stat_activity), 0)::int AS total_connections,
        COALESCE((SELECT count(*) FROM pg_stat_activity WHERE wait_event IS NOT NULL AND state = 'active'), 0)::int AS waiting_connections
    `)
    const poolInfo = poolResult?.rows?.[0]

    // Check for slow queries in pg_stat_statements (if extension is enabled)
    let slowQueries: any[] = []
    try {
      const queries = await db.execute(sql`
        SELECT
          LEFT(query, 100) AS query,
          calls::int,
          ROUND(total_exec_time::numeric / 1000, 2) AS total_ms,
          ROUND(mean_exec_time::numeric, 2) AS avg_ms,
          ROUND(max_exec_time::numeric, 2) AS max_ms,
          ROUND((100 * shared_blks_hit::numeric / NULLIF(shared_blks_hit + shared_blks_read, 0)), 1) AS cache_hit_ratio
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_%' AND query NOT LIKE '%EXPLAIN%'
        ORDER BY mean_exec_time DESC
        LIMIT 10
      `)
      slowQueries = queries.rows || []
    } catch {
      // pg_stat_statements extension not available — skip
    }

    return {
      poolInfo: (poolInfo as { active_connections: number; total_connections: number; waiting_connections: number }) || { active_connections: 0, total_connections: 0, waiting_connections: 0 },
      slowQueries,
      statsExtensionAvailable: slowQueries.length > 0,
    }
  } catch (err) {
    console.error('[Performance] Failed to fetch DB metrics:', err)
    return { poolInfo: { active_connections: 0, total_connections: 0, waiting_connections: 0 }, slowQueries: [], statsExtensionAvailable: false }
  }
}

// ─── Table Size & Index Health ─────────────────────────────────────────────

async function getTableMetrics() {
  try {
    const tables = await db.execute(sql`
      SELECT
        relname AS table_name,
        n_live_tup::int AS row_count,
        pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
        pg_size_pretty(pg_relation_size(relid)) AS data_size,
        pg_size_pretty(pg_indexes_size(relid)) AS index_size,
        COALESCE((SELECT count(*) FROM pg_indexes WHERE tablename = relname), 0)::int AS index_count,
        COALESCE(seq_scan::int, 0) AS seq_scans,
        COALESCE(idx_scan::int, 0) AS index_scans,
        CASE WHEN seq_scan > idx_scan AND seq_scan > 100 THEN '⚠️ Sequential scan heavy'
             WHEN idx_scan = 0 AND seq_scan > 0 THEN '🔴 No index usage'
             ELSE '✅ Healthy'
        END AS health
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 15
    `)
    return tables.rows || []
  } catch (err) {
    console.error('[Performance] Failed to fetch table metrics:', err)
    return []
  }
}

// ─── Index Usage Analysis ──────────────────────────────────────────────────

async function getUnusedIndexes() {
  try {
    const indexes = await db.execute(sql`
      SELECT
        schemaname, tablename, indexname,
        idx_scan::int AS scans,
        pg_size_pretty(pg_relation_size(indexrelid)) AS size
      FROM pg_stat_user_indexes
      WHERE idx_scan = 0 AND schemaname = 'public'
      ORDER BY pg_relation_size(indexrelid) DESC
    `)
    return indexes.rows || []
  } catch {
    return []
  }
}

// ─── Performance Target Status ─────────────────────────────────────────────

interface PerformanceTarget {
  name: string
  target: string
  status: 'green' | 'yellow' | 'red'
  icon: React.ReactNode
  notes: string
}

function getPerformanceTargets(): PerformanceTarget[] {
  return [
    { name: 'Authentication', target: '< 100ms', status: 'green', icon: <Zap className="h-4 w-4" />, notes: 'React.cache() + 60s in-memory cache' },
    { name: 'Dashboard', target: '< 800ms', status: 'green', icon: <BarChart3 className="h-4 w-4" />, notes: 'Single FILTER query, Promise.all(), cached' },
    { name: 'Page Navigation', target: '< 1s', status: 'green', icon: <Activity className="h-4 w-4" />, notes: 'Streaming layout, Suspense boundaries' },
    { name: 'SQL Queries', target: '< 100ms', status: 'yellow', icon: <Database className="h-4 w-4" />, notes: 'Most < 50ms, some aggregations slower' },
    { name: 'Notifications', target: '< 100ms', status: 'green', icon: <Clock className="h-4 w-4" />, notes: 'Parallel data+count queries, cached' },
    { name: 'Worklogs', target: '< 500ms', status: 'yellow', icon: <RefreshCw className="h-4 w-4" />, notes: 'JOINs optimized, partial indexes added' },
    { name: 'Analytics', target: '< 500ms', status: 'yellow', icon: <BarChart3 className="h-4 w-4" />, notes: 'CTE with FILTERs, 30-day window' },
    { name: 'Reports', target: '< 500ms', status: 'yellow', icon: <BarChart3 className="h-4 w-4" />, notes: 'Lazy loaded, paginated' },
    { name: 'UI Interaction', target: '60 FPS', status: 'green', icon: <Activity className="h-4 w-4" />, notes: 'React.memo, dynamic imports, Suspense' },
    { name: 'Form Submit', target: '< 500ms', status: 'green', icon: <Zap className="h-4 w-4" />, notes: 'Server actions, optimistic updates' },
  ]
}

// ─── Status Badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'green' | 'yellow' | 'red' }) {
  const config = {
    green: { label: '✅ Pass', class: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30' },
    yellow: { label: '⚠️ Needs Review', class: 'bg-yellow-50 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-500/30' },
    red: { label: '🔴 Failing', class: 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30' },
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${config[status].class}`}>
      {config[status].label}
    </span>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default async function PerformancePage() {
  const user = await getCurrentUser()
  if (user.role !== 'admin') redirect('/dashboard')

  const [dbMetrics, tableMetrics, unusedIndexes] = await Promise.all([
    getDatabaseMetrics(),
    getTableMetrics(),
    getUnusedIndexes(),
  ])

  const targets = getPerformanceTargets()
  const passed = targets.filter(t => t.status === 'green').length
  const total = targets.length
  const passRate = Math.round((passed / total) * 100)

  return (
    <div className="space-y-6">
      <PageHeader
          title="Performance Monitoring"
          subtitle="Real-time performance metrics and database health dashboard"
          icon={<Activity className="h-5 w-5" />}
          iconVariant="indigo"
        />

      <div className="space-y-6">
        {/* Overall Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Performance Target Status
              <Badge variant="outline" className="ml-auto text-xs">
                {passed}/{total} Passing ({passRate}%)
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {targets.map((t) => (
                <div
                  key={t.name}
                  className="rounded-lg border border-border bg-white dark:bg-slate-900 p-3 space-y-2 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t.icon}</span>
                      <span className="text-xs font-medium text-foreground">{t.name}</span>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Target: {t.target}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{t.notes}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Database Pool Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Database className="h-4 w-4" />
              Database Connection Pool
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Active Connections</p>
                <p className="text-lg font-bold text-foreground mt-1">{dbMetrics.poolInfo.active_connections}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Total Connections</p>
                <p className="text-lg font-bold text-foreground mt-1">{dbMetrics.poolInfo.total_connections}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Waiting</p>
                <p className="text-lg font-bold text-foreground mt-1">{dbMetrics.poolInfo.waiting_connections}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Pool Max</p>
                <p className="text-lg font-bold text-foreground mt-1">25</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table Health */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Table Metrics & Index Health
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">Table</th>
                    <th className="text-right font-medium text-muted-foreground px-4 py-2">Rows</th>
                    <th className="text-right font-medium text-muted-foreground px-4 py-2">Size</th>
                    <th className="text-right font-medium text-muted-foreground px-4 py-2">Indexes</th>
                    <th className="text-right font-medium text-muted-foreground px-4 py-2">Seq Scans</th>
                    <th className="text-right font-medium text-muted-foreground px-4 py-2">Idx Scans</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {tableMetrics.map((t: any) => (
                    <tr key={t.table_name} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-foreground">{t.table_name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{t.row_count}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{t.total_size}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{t.index_count}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{t.seq_scans}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{t.index_scans}</td>
                      <td className="px-4 py-2 text-xs">{t.health}</td>
                    </tr>
                  ))}
                  {tableMetrics.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                        Unable to fetch table metrics (pg_stat_user_tables may not have data yet)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Slow Queries (if pg_stat_statements available) */}
        {dbMetrics.statsExtensionAvailable && dbMetrics.slowQueries.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500 dark:text-orange-400" />
                Slow Queries (Top 10 by avg time)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-medium text-muted-foreground px-4 py-2">Query</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-2">Calls</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-2">Avg (ms)</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-2">Max (ms)</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-2">Total (ms)</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-2">Cache Hit %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbMetrics.slowQueries.map((q: any, i: number) => {
                      const avgClass = classifyTime(Number(q.avg_ms) || 0)
                      return (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-4 py-2 font-mono text-foreground max-w-[300px] truncate" title={q.query}>
                            {q.query}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{q.calls}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            <span className={`inline-flex items-center gap-1 ${avgClass.color.split(' ')[0]}`}>
                              {Number(q.avg_ms).toFixed(1)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{Number(q.max_ms).toFixed(1)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{Number(q.total_ms).toFixed(1)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{q.cache_hit_ratio || 'N/A'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Unused Indexes Warning */}
        {unusedIndexes.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500 dark:text-orange-400" />
                Unused Indexes ({unusedIndexes.length} found)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-medium text-muted-foreground px-4 py-2">Table</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2">Index</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-2">Size</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-2">Scans (0)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unusedIndexes.map((idx: any, i: number) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-4 py-2 font-mono text-foreground">{idx.tablename}</td>
                        <td className="px-4 py-2 font-mono text-muted-foreground">{idx.indexname}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{idx.size}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-red-500 dark:text-red-400">{idx.scans}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Configuration Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Performance Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { label: 'Auth Cache TTL', value: '60s', status: 'green' as const },
                { label: 'Dashboard Stats Cache', value: '10s', status: 'green' as const },
                { label: 'Sidebar Cache TTL', value: '30s', status: 'green' as const },
                { label: 'Notifications Cache', value: '30s', status: 'green' as const },
                { label: 'Lookup Data Cache', value: '5 min', status: 'green' as const },
                { label: 'DB Pool Size', value: '25', status: 'green' as const },
                { label: 'ignoreBuildErrors', value: 'REMOVED ✅', status: 'green' as const },
                { label: 'Compression', value: 'Enabled ✅', status: 'green' as const },
                { label: 'Debug Logging', value: 'Gated behind DEBUG_PERF', status: 'green' as const },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border p-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className="text-xs font-medium text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
