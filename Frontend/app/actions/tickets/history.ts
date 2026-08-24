'use server'

import { unstable_cache } from 'next/cache'
import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { db } from '@/lib/db'
import { ticket, ticketHistory, timeLog, user, project, revisionHistory } from '@/lib/db/schema'
import { eq, and, desc, sql, inArray, gte, lte, sum, count, isNotNull } from 'drizzle-orm'
import { wrapServerAction } from '@/lib/performance-profiler'

// ── Cache TTLs ─────────────────────────────────────────────────────────────
// Worklog data changes only when timers stop or tickets are updated.
// 60s TTL balances freshness with cross-request reuse for all worklog views.
const WORKLOG_CACHE_TTL = 60

// ── Manager Analytics (cached via unstable_cache, 60s TTL) ─────────────────

export const clearManagerAnalyticsCache = wrapServerAction('clearManagerAnalyticsCache', async function clearManagerAnalyticsCache() {
  // No-op: unstable_cache automatically invalidates via TTL.
  // The old in-memory Map was process-local and didn't survive restarts.
  // unstable_cache handles cross-instance dedup automatically.
})

async function _getManagerAnalyticsImpl() {
  const developers = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.role, 'developer'))
  if (developers.length === 0) return []

  const devIds = developers.map((d) => d.id)

  // OPTIMIZATION: 2 queries run in parallel via Promise.all.
  // Both use FILTER aggregates and index-only scans on devIds.
  const [ticketCounts, timeResults] = await Promise.all([
    db
      .select({
        assignedToId: ticket.assignedToId,
        activeCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} != 'closed')::int`,
        resolvedCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'closed')::int`,
      })
      .from(ticket)
      .where(inArray(ticket.assignedToId, devIds))
      .groupBy(ticket.assignedToId),
    db
      .select({ userId: timeLog.userId, total: sum(timeLog.durationMinutes) })
      .from(timeLog)
      .where(inArray(timeLog.userId, devIds))
      .groupBy(timeLog.userId),
  ])

  const activeMap = new Map(ticketCounts.map((r) => [r.assignedToId, r.activeCount]))
  const resolvedMap = new Map(ticketCounts.map((r) => [r.assignedToId, r.resolvedCount]))
  const timeMap = new Map(timeResults.map((r) => [r.userId, Number(r.total) || 0]))

  return developers.map((dev) => ({
    id: dev.id, name: dev.name,
    activeTickets: activeMap.get(dev.id) || 0,
    resolvedTickets: resolvedMap.get(dev.id) || 0,
    totalTimeMinutes: timeMap.get(dev.id) || 0,
  }))
}

const getCachedManagerAnalytics = unstable_cache(
  async () => _getManagerAnalyticsImpl(),
  ['manager-analytics'],
  { revalidate: WORKLOG_CACHE_TTL, tags: ['manager-analytics'] },
)

export const getManagerAnalytics = wrapServerAction('getManagerAnalytics', async function getManagerAnalytics() {
  const currentUser = await getUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') throw new Error('Access denied')
  return getCachedManagerAnalytics()
})

// ── Developer Analytics (cached 60s TTL, user-specific) ────────────────────

async function _getDeveloperAnalyticsImpl(userId: string, days: number) {
  const since = new Date()
  since.setDate(since.getDate() - days)

  // All queries are scoped to the selected period (7/30/90 days):
  // - Status distribution & "Tickets Assigned" = tickets created within range
  // - Resolved stats = tickets resolved within range
  // - Time logged = worklogs started within range
  const [statusDistribution, resolutionStats, timeResult] = await Promise.all([
    db
      .select({ status: ticket.status, count: count() })
      .from(ticket)
      .where(and(eq(ticket.assignedToId, userId), gte(ticket.createdAt, since)))
      .groupBy(ticket.status),
    db
      .select({ resolvedCount: count(), avgHours: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${ticket.resolvedAt} - ${ticket.createdAt}) ) / 3600), 0)` })
      .from(ticket).where(and(eq(ticket.assignedToId, userId), gte(ticket.resolvedAt, since))),
    // MERGED: Single query with FILTER for billable vs total time
    // Before: 2 separate SUM queries (total + billable) on timeLog
    // After:  1 query with COALESCE(SUM) + FILTER — one scan instead of two
    db
      .select({
        total: sql<number>`COALESCE(SUM(${timeLog.durationMinutes}), 0)::int`,
        billable: sql<number>`COALESCE(SUM(${timeLog.durationMinutes}) FILTER (WHERE ${timeLog.isBillable} = true), 0)::int`,
      })
      .from(timeLog)
      .where(and(eq(timeLog.userId, userId), gte(timeLog.startTime, since))),
  ])

  const totalTickets = statusDistribution.reduce((s, r) => s + Number(r.count), 0)
  const resolvedCount = Number(resolutionStats?.[0]?.resolvedCount) || 0
  const avgResolutionHours = Number(resolutionStats?.[0]?.avgHours) || 0

  return {
    statusDistribution: statusDistribution.map((r) => ({ status: r.status, count: Number(r.count) })),
    totalTimeMinutes: Number(timeResult?.[0]?.total) || 0,
    billableTimeMinutes: Number(timeResult?.[0]?.billable) || 0,
    totalTickets, resolvedTickets: resolvedCount,
    avgResolutionHours: Math.round(avgResolutionHours * 10) / 10,
  }
}

const getCachedDeveloperAnalytics = unstable_cache(
  async (userId: string, days: number) => _getDeveloperAnalyticsImpl(userId, days),
  undefined,
  { revalidate: WORKLOG_CACHE_TTL, tags: ['developer-analytics'] },
)

export const getDeveloperAnalytics = wrapServerAction('getDeveloperAnalytics', async function getDeveloperAnalytics(days: number = 30) {
  const currentUser = await getUser()
  if (currentUser.role !== 'developer') throw new Error('Only developers can view their own analytics')
  return getCachedDeveloperAnalytics(currentUser.id, days)
})

// ── Analytics (admin/manager only, cached 60s TTL) ─────────────────────────

async function _getAnalyticsDataImpl() {
  const since = new Date()
  since.setDate(since.getDate() - 30)

  // ── SINGLE QUERY OPTIMIZATION ────────────────────────────────────────
  // Phase 8: Merged revision stats into the main WITH clause.
  // Before: 3 queries (1 main analytics + 1 revision stats + 1 ticket revision sums)
  // After:  1 query — ALL data comes from a single round trip.
  // The revision_stats CTE covers the same 30-day window as the daily CTE,
  // and the ticket_revisions CTE computes global revision stats across all tickets.
  // This eliminates 2 extra round trips entirely.
  // Expected: ~40-80ms → ~15-30ms
  const analyticsSql = sql`
    WITH daily AS (
      SELECT DATE(${ticket.createdAt})::text AS date, ${ticket.status} AS status, ${ticket.priority} AS priority, ${ticket.category} AS category,
        EXTRACT(EPOCH FROM (${ticket.resolvedAt} - ${ticket.createdAt})) / 3600 AS resolution_hours,
        CASE WHEN ${ticket.resolvedAt} IS NOT NULL THEN 1 ELSE 0 END AS is_resolved
      FROM ${ticket}
      WHERE ${ticket.createdAt} >= ${since}
    ),
    revision_stats AS (
      SELECT ${revisionHistory.requestedByRole} AS role
      FROM ${revisionHistory}
      WHERE ${revisionHistory.createdAt} >= ${since}
    ),
    ticket_revisions AS (
      SELECT ${ticket.revisionCount}
      FROM ${ticket}
      WHERE ${ticket.revisionCount} > 0
    )
    SELECT
      (SELECT COALESCE(json_agg(json_build_object('date', date, 'count', count) ORDER BY date), '[]'::json) FROM (SELECT date, COUNT(*)::int AS count FROM daily GROUP BY date) sub)::text AS daily_volume,
      (SELECT COALESCE(json_agg(json_build_object('status', status, 'count', count)), '[]'::json) FROM (SELECT status, COUNT(*)::int AS count FROM daily GROUP BY status) sub)::text AS status_distribution,
      (SELECT COALESCE(json_agg(json_build_object('priority', priority, 'count', count)), '[]'::json) FROM (SELECT priority, COUNT(*)::int AS count FROM daily GROUP BY priority) sub)::text AS priority_distribution,
      (SELECT COALESCE(json_agg(json_build_object('category', category, 'count', count)), '[]'::json) FROM (SELECT category, COUNT(*)::int AS count FROM daily GROUP BY category) sub)::text AS category_distribution,
      (SELECT COALESCE(AVG(resolution_hours), 0)::float8 FROM daily WHERE is_resolved = 1) AS avg_resolution_hours,
      (SELECT COUNT(*)::int FROM daily WHERE is_resolved = 1) AS resolved_count,
      (SELECT COUNT(*)::int FROM daily) AS total_count,
      (SELECT COUNT(*)::int FROM revision_stats) AS total_revisions,
      (SELECT COUNT(*)::int FROM revision_stats WHERE role = 'client') AS client_revisions,
      (SELECT COUNT(*)::int FROM revision_stats WHERE role = 'project_manager') AS manager_revisions,
      (SELECT COUNT(*)::int FROM revision_stats WHERE role = 'admin') AS admin_revisions,
      (SELECT COUNT(*)::int FROM ticket_revisions) AS total_tickets_with_revisions,
      (SELECT COALESCE(SUM("revisionCount"), 0)::int FROM ticket_revisions) AS total_revision_sum
  `

  const result = await db.execute(analyticsSql)
  const r = result.rows[0]
  const dailyVolume = r?.daily_volume ? JSON.parse(String(r.daily_volume)) : []
  const statusDist = r?.status_distribution ? JSON.parse(String(r.status_distribution)) : []
  const priorityDist = r?.priority_distribution ? JSON.parse(String(r.priority_distribution)) : []
  const categoryDist = r?.category_distribution ? JSON.parse(String(r.category_distribution)) : []
  const avgResolutionHours = Number(r?.avg_resolution_hours) || 0
  const totalTickets = Number(r?.total_count) || 0
  const resolvedCount = Number(r?.resolved_count) || 0

  const totalRevisions = Number(r?.total_revisions) || 0
  const clientRevisions = Number(r?.client_revisions) || 0
  const managerRevisions = Number(r?.manager_revisions) || 0
  const adminRevisions = Number(r?.admin_revisions) || 0
  const totalTicketsWithRevisions = Number(r?.total_tickets_with_revisions) || 0
  const totalRevisionSum = Number(r?.total_revision_sum) || 0

  const avgRevisionsPerTicket = totalTicketsWithRevisions > 0
    ? Math.round((totalRevisionSum / totalTicketsWithRevisions) * 10) / 10
    : 0

  return {
    dailyVolume, statusDistribution: statusDist, priorityDistribution: priorityDist, categoryDistribution: categoryDist,
    avgResolutionHours: Math.round(avgResolutionHours * 10) / 10, totalTickets, resolvedTickets: resolvedCount,
    revisionAnalytics: {
      totalRevisions, clientRevisions, managerRevisions, adminRevisions, avgRevisionsPerTicket,
    },
  }
}

const getCachedAnalyticsData = unstable_cache(
  async () => _getAnalyticsDataImpl(),
  ['analytics'],
  { revalidate: WORKLOG_CACHE_TTL, tags: ['analytics'] },
)

export const getAnalyticsData = wrapServerAction('getAnalyticsData', async function getAnalyticsData() {
  const currentUser = await getUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') throw new Error('Access denied')
  return getCachedAnalyticsData()
})

// ── Worklog Summary (developer-specific, cached 60s TTL) ───────────────────

async function _getWorklogSummaryImpl(userId: string, days: number) {
  const since = new Date()
  since.setDate(since.getDate() - days)

  // ── OPTIMIZATION: Move aggregation FROM JS TO SQL ─────────────────────────
  // Before: Loaded ALL time log rows into JS (1000+ rows), then iterated in
  //         for-loops to build dailyMap and byTicketMap. This transferred
  //         megabytes of data over the network and CPU-processed in Node.js.
  // After:  SQL GROUP BY with PostgreSQL computes dailySummary and totalMinutes
  //         server-side. Only 2 lightweight aggregations + 1 batch ticket fetch.
  // Expected: ~300-800ms → <30ms for 1000+ time logs

  const [dailySummary, totalResult] = await Promise.all([
    // Daily summary via SQL GROUP BY on DATE(startTime)
    db
      .select({
        date: sql<string>`DATE(${timeLog.startTime})::text`,
        totalMinutes: sql<number>`COALESCE(SUM(${timeLog.durationMinutes}), 0)::int`,
        billableMinutes: sql<number>`COALESCE(SUM(${timeLog.durationMinutes}) FILTER (WHERE ${timeLog.isBillable} = true), 0)::int`,
      })
      .from(timeLog)
      .where(and(eq(timeLog.userId, userId), gte(timeLog.startTime, since), sql`${timeLog.endTime} IS NOT NULL`))
      .groupBy(sql`DATE(${timeLog.startTime})`)
      .orderBy(sql`DATE(${timeLog.startTime})`),

    // Total + billable minutes in a single FILTER query
    db
      .select({
        totalMinutes: sql<number>`COALESCE(SUM(${timeLog.durationMinutes}), 0)::int`,
        billableMinutes: sql<number>`COALESCE(SUM(${timeLog.durationMinutes}) FILTER (WHERE ${timeLog.isBillable} = true), 0)::int`,
      })
      .from(timeLog)
      .where(and(eq(timeLog.userId, userId), gte(timeLog.startTime, since), sql`${timeLog.endTime} IS NOT NULL`)),
  ])

  const totalMinutes = Number(totalResult?.[0]?.totalMinutes) || 0
  const billableMinutes = Number(totalResult?.[0]?.billableMinutes) || 0

  // ── By-ticket summary via SQL GROUP BY + JOIN ─────────────────────────────
  // Single query aggregates timeLogs per ticket and joins ticket info.
  // Uses LEFT JOIN so tickets with time logs but no ticket row still appear.
  const byTicket = await db
    .select({
      ticketId: timeLog.ticketId,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      totalMinutes: sql<number>`COALESCE(SUM(${timeLog.durationMinutes}), 0)::int`,
      billableMinutes: sql<number>`COALESCE(SUM(${timeLog.durationMinutes}) FILTER (WHERE ${timeLog.isBillable} = true), 0)::int`,
      entries: count().mapWith(Number),
    })
    .from(timeLog)
    .leftJoin(ticket, eq(timeLog.ticketId, ticket.id))
    .where(and(eq(timeLog.userId, userId), gte(timeLog.startTime, since), sql`${timeLog.endTime} IS NOT NULL`))
    .groupBy(timeLog.ticketId, ticket.id)
    .orderBy(sql`COALESCE(SUM(${timeLog.durationMinutes}), 0) DESC`)

  return {
    dailySummary: dailySummary.map((d) => ({ date: d.date, totalMinutes: d.totalMinutes, billableMinutes: d.billableMinutes })),
    byTicket: byTicket.map((t) => ({
      ticketId: t.ticketId,
      ticketNumber: t.ticketNumber || `#${t.ticketId}`,
      title: t.title || 'Deleted Ticket',
      totalMinutes: t.totalMinutes,
      billableMinutes: t.billableMinutes,
      entries: t.entries,
    })),
    totalMinutes,
    billableMinutes,
  }
}

const getCachedWorklogSummary = unstable_cache(
  async (cacheKey: string) => {
    const { userId, days } = JSON.parse(cacheKey)
    return _getWorklogSummaryImpl(userId, days)
  },
  undefined,
  { revalidate: WORKLOG_CACHE_TTL, tags: ['worklog-summary'] },
)

export const getWorklogSummary = wrapServerAction('getWorklogSummary', async function getWorklogSummary(days: number = 30) {
  const currentUser = await getUser()
  if (currentUser.role !== 'developer') throw new Error('Only developers can view their worklog summary')
  const cacheKey = JSON.stringify({ userId: currentUser.id, days })
  return getCachedWorklogSummary(cacheKey)
})

// ── Employee Productivity (admin/manager, cached 60s TTL) ──────────────────

async function _getEmployeeProductivityImpl(roles: string[], since: Date, until: Date, resolvedSince: Date | null) {
  const employees = await db
    .select({ id: user.id, name: user.name, role: user.role, email: user.email })
    .from(user)
    .where(inArray(user.role, roles as any))
  if (employees.length === 0) return []

  const empIds = employees.map((e) => e.id)

  // Resolved counts are only scoped to a period when an explicit startDate is
  // provided (Resource Dashboard period selector). Callers without a range
  // (e.g. the Worklogs page) keep the original all-time resolved semantics.
  const resolvedFilter = resolvedSince ? gte(ticket.resolvedAt, resolvedSince) : undefined

  const [aggregatedTimeLogs, resolvedCounts] = await Promise.all([
    db
      .select({
        userId: timeLog.userId, totalMinutes: sql<number>`COALESCE(SUM(${timeLog.durationMinutes}), 0)::int`,
        ticketCount: sql<number>`COUNT(DISTINCT ${timeLog.ticketId})::int`,
        lastActivity: sql<Date>`MAX(${timeLog.startTime})`,
      })
      .from(timeLog)
      .where(and(inArray(timeLog.userId, empIds), gte(timeLog.startTime, since), lte(timeLog.startTime, until), sql`${timeLog.endTime} IS NOT NULL`))
      .groupBy(timeLog.userId),
    db
      .select({ assignedToId: ticket.assignedToId, count: count() })
      .from(ticket)
      .where(and(inArray(ticket.assignedToId, empIds), inArray(ticket.status, ['resolved', 'closed']), resolvedFilter))
      .groupBy(ticket.assignedToId),
  ])

  const timeMap = new Map(aggregatedTimeLogs.map((r) => [r.userId, r.totalMinutes]))
  const ticketsMap = new Map(aggregatedTimeLogs.map((r) => [r.userId, r.ticketCount]))
  const lastActivityMap = new Map(aggregatedTimeLogs.map((r) => [r.userId, r.lastActivity]))
  const resolvedMap = new Map(resolvedCounts.map((r) => [r.assignedToId, Number(r.count) || 0]))

  return employees
    .map((emp) => {
      const totalMinutes = timeMap.get(emp.id) || 0
      const ticketsWorked = ticketsMap.get(emp.id) || 0
      return {
        id: emp.id, name: emp.name, role: emp.role, email: emp.email,
        totalMinutes, totalHours: Math.round((totalMinutes / 60) * 10) / 10,
        ticketsWorked, resolvedTickets: resolvedMap.get(emp.id) || 0,
        avgMinutesPerTicket: ticketsWorked > 0 ? Math.round(totalMinutes / ticketsWorked) : 0,
        lastActivity: lastActivityMap.get(emp.id) || null,
      }
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
}

const getCachedEmployeeProductivity = unstable_cache(
  async (cacheKey: string) => {
    const { roles, since, until, resolvedSince } = JSON.parse(cacheKey)
    return _getEmployeeProductivityImpl(roles, new Date(since), new Date(until), resolvedSince ? new Date(resolvedSince) : null)
  },
  undefined,
  { revalidate: WORKLOG_CACHE_TTL, tags: ['employee-productivity'] },
)

export const getEmployeeProductivity = wrapServerAction('getEmployeeProductivity', async function getEmployeeProductivity(filters?: { role?: string; startDate?: Date; endDate?: Date }) {
  const currentUser = await getUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') throw new Error('Access denied')

  const roles = filters?.role ? [filters.role] : ['developer', 'project_manager']
  const since = filters?.startDate || (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d })()
  const until = filters?.endDate || new Date()
  const resolvedSince = filters?.startDate ? since : null
  const cacheKey = JSON.stringify({ roles, since: since.getTime(), until: until.getTime(), resolvedSince: resolvedSince?.getTime() ?? null })
  return getCachedEmployeeProductivity(cacheKey)
})

// ── Paginated Worklogs (admin/manager, cached 60s TTL) ────────────────────

async function _getPaginatedWorklogsImpl(limit: number, offset: number) {
  // ── OPTIMIZATION: Add proper TOTAL count via COUNT(*) OVER() ─────────────
  // Before: returned `total: 0` always — pagination couldn't show accurate
  //         page counts. Users had no way to know how many pages existed.
  // After:  COUNT(*) OVER() window function provides total count in the SAME
  //         scan as the data — no separate COUNT query, no extra round-trip.
  const logs = await db
    .select({
      id: timeLog.id,
      ticketId: timeLog.ticketId,
      userId: timeLog.userId,
      description: timeLog.description,
      startTime: timeLog.startTime,
      durationMinutes: timeLog.durationMinutes,
      endTime: timeLog.endTime,
      isBillable: timeLog.isBillable,
      // JOIN enrichment directly in SQL — no separate user/ticket queries needed
      userName: user.name,
      userRole: user.role,
      ticketNumber: ticket.ticketNumber,
      ticketTitle: ticket.title,
      totalCount: sql<number>`COUNT(*) OVER()::int`,
    })
    .from(timeLog)
    .leftJoin(user, eq(timeLog.userId, user.id))
    .leftJoin(ticket, eq(timeLog.ticketId, ticket.id))
    .where(isNotNull(timeLog.endTime))
    .orderBy(desc(timeLog.startTime))
    .limit(limit)
    .offset(offset)

  if (logs.length === 0) return { logs: [], hasMore: false, total: 0 }

  const total = logs[0].totalCount

  const enrichedLogs = logs.map((l) => ({
    id: l.id,
    ticketId: l.ticketId,
    userId: l.userId,
    description: l.description,
    startTime: l.startTime,
    durationMinutes: l.durationMinutes,
    endTime: l.endTime,
    isBillable: l.isBillable,
    userName: l.userName || 'Unknown',
    userRole: l.userRole || 'developer',
    ticketNumber: l.ticketNumber || `#${l.ticketId}`,
    ticketTitle: l.ticketTitle || 'Unknown Ticket',
  }))

  return { logs: enrichedLogs, hasMore: enrichedLogs.length >= limit, total }
}

const getCachedPaginatedWorklogs = unstable_cache(
  async (cacheKey: string) => {
    const { limit, offset } = JSON.parse(cacheKey)
    return _getPaginatedWorklogsImpl(limit, offset)
  },
  undefined,
  { revalidate: WORKLOG_CACHE_TTL, tags: ['paginated-worklogs'] },
)

export const getPaginatedWorklogs = wrapServerAction('getPaginatedWorklogs', async function getPaginatedWorklogs(limit: number = 20, offset: number = 0) {
  const currentUser = await getUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') throw new Error('Access denied')
  const cacheKey = JSON.stringify({ limit, offset })
  return getCachedPaginatedWorklogs(cacheKey)
})

// ── Worklogs Cache ─────────────────────────────────────────────────────────
// Replaced in-memory Map (process-local) with unstable_cache (cross-instance).
// The cache key encodes the page identity so different pages don't collide.

export const getCachedWorklogs = wrapServerAction('getCachedWorklogs', async function getCachedWorklogs<T>(key: string, compute: () => Promise<T>): Promise<T> {
  // For backwards compatibility, still support the in-memory cache pattern
  // but delegate the actual compute to unstable_cache for the worklogs page.
  // The 'all_worklogs' key is the only one used in practice.
  if (key === 'all_worklogs') {
    const cached = unstable_cache(
      async () => compute(),
      ['worklogs-all'],
      { revalidate: WORKLOG_CACHE_TTL, tags: ['worklogs-all'] },
    )
    return cached()
  }
  // Fallback for other keys: direct compute, no caching
  return compute()
})

export const clearWorklogsCache = wrapServerAction('clearWorklogsCache', async function clearWorklogsCache() {
  // No-op: unstable_cache handles invalidation via TTL.
  // The old in-memory Map clear() was process-local.
})
