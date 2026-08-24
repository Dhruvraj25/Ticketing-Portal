'use server'

import { getCurrentUser } from '@/lib/auth-utils'
import { db } from '@/lib/db'
import {
  ticket, timeLog, user, project, module as moduleTable,
  projectDeveloper, projectClient, supportWallet, attachment,
  notification as notificationSchema,
} from '@/lib/db/schema'
import { and, eq, desc, sql, isNull, isNotNull, ne, count, inArray, gte } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { wrapServerAction } from '@/lib/performance-profiler'
import type { TicketStatus, TicketPriority, TicketCategory, UserRole } from '@/lib/types'
// Shared consolidated stats — eliminates duplicate implementation that was
// identical to tickets/queries.ts's getConsolidatedDashboardData.
import { getConsolidatedDashboardData } from '@/app/actions/tickets/queries'
// Database warmup — blocks the first request until the pool is ready.
// Without this, the first dashboard query races against the async pool
// warmup, causing cascading timeouts on Neon cold start.
import { waitForDb } from '@/lib/db'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DashboardUser {
  id: string; name: string; email: string; role: UserRole
}

export interface ConsolidatedStats {
  totalTickets: number
  openTickets: number
  inProgressTickets: number
  resolvedTickets: number
  openRevisions: number
  pendingEstimates: number
  approvedEstimates: number
  rejectedEstimates: number
  autoApprovedEstimates: number
  awaitingApproval: number
  recentlyApproved: number
}

export interface SidebarDataResult {
  activeTimer: any | null
  projects: { id: number; projectName: string; projectCode: string; ticketCount: number }[]
  unassignedTickets: any[]
  developers: { id: string; name: string; email: string; activeTickets: number }[]
  projectAnalytics: any[]
}

export interface ProjectMetricsResult {
  totalProjects: number
  activeProjects: number
  totalProjectHours: number
  openTickets: number
  closedTickets: number
}

export interface RenewalStatus {
  showReminder: boolean
  lowHours: boolean
  expiringSoon: boolean
  contractExpired: boolean
  remainingHours: number
  totalPurchasedHours: number
  contractStartDate: string | null
  contractEndDate: string | null
  daysRemaining: number
  walletId: number | null
}

export interface DashboardCriticalData {
  user: DashboardUser
  consolidatedStats: ConsolidatedStats
  recentTickets: any[]
  projectMetrics: ProjectMetricsResult | null
  renewalStatus: RenewalStatus
}

// ── Cache Configuration ────────────────────────────────────────────────────
// Tuned for single-orchestration streaming:
// - Stats: Reuses shared cache from tickets/queries.ts (60s TTL, 'consolidated-dashboard-stats' tag)
// - Sidebar: 300s cache (↑ 120s) — projects, developers, unassigned change infrequently
// - Metrics: 300s cache — global admin aggregates, rarely change
// - Renewal: 300s cache — contract dates/status change at most daily

const SIDEBAR_CACHE_TTL = 300     // ↑ 120s → 300s (60% fewer queries vs 120s)
const METRICS_CACHE_TTL = 300     // Global aggregates, rarely change
const RENEWAL_CACHE_TTL = 300     // Contract status changes at most daily
const RECENT_TICKETS_CACHE_TTL = 30 // Recent tickets stale-by-30s is fine for dashboard

// ─── Internal Helpers (accept currentUser, no repeated auth) ───────────────
// NOTE: Consolidated stats are now fetched via the shared getConsolidatedDashboardData
// from tickets/queries.ts, eliminating the duplicate implementation that previously
// lived here. Both implementations were identical — same FILTER query, same return shape.
// The shared version uses cache tag 'consolidated-dashboard-stats' (60s TTL).

async function _getRecentTicketsImpl(userId: string, role: string, limit = 5) {
  const conditions: any[] = []
  if (role === 'client') conditions.push(eq(ticket.clientId, userId))
  else if (role === 'developer') conditions.push(eq(ticket.assignedToId, userId))

  // For LIMIT 5, correlated subqueries are MORE efficient than CTEs.
  // Each subquery is a targeted PK index seek (~0.1ms each, 5 rows = ~0.5ms total).
  // CTEs would scan the ENTIRE user/attachment tables before joining to 5 rows.
  // This is the opposite of getTicketsList (large result sets) where CTEs win.
  const rows = await db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      description: ticket.description, status: ticket.status, priority: ticket.priority,
      category: ticket.category, clientId: ticket.clientId, projectId: ticket.projectId,
      moduleId: ticket.moduleId, assignedToId: ticket.assignedToId,
      assignedAt: ticket.assignedAt, resolvedAt: ticket.resolvedAt, closedAt: ticket.closedAt,
      revisionCount: ticket.revisionCount, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt,
      clientName: user.name,
      clientEmail: user.email,
      assignedToName: sql<string>`COALESCE((SELECT name FROM "user" WHERE id = ${ticket.assignedToId}), NULL)`,
      projectName: project.projectName,
      projectCode: project.projectCode,
      moduleName: moduleTable.moduleName,
      attachmentCount: sql<number>`COALESCE((SELECT COUNT(*)::int FROM ${attachment} WHERE ${attachment.ticketId} = ${ticket.id}), 0)`,
    })
    .from(ticket)
    .leftJoin(user, eq(ticket.clientId, user.id))
    .leftJoin(project, eq(ticket.projectId, project.id))
    .leftJoin(moduleTable, eq(ticket.moduleId, moduleTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ticket.createdAt))
    .limit(limit)

  return rows.map((r: any) => ({
    ...r, status: r.status as TicketStatus, priority: r.priority as TicketPriority,
    category: r.category as TicketCategory, clientName: r.clientName ?? undefined,
    clientEmail: r.clientEmail ?? undefined, assignedToName: r.assignedToName ?? undefined,
    projectName: r.projectName ?? undefined, projectCode: r.projectCode ?? undefined,
    moduleName: r.moduleName ?? undefined, attachmentCount: r.attachmentCount ?? 0,
  }))
}

// Cache recent tickets: 30s TTL — stale-by-30s is fine for a dashboard widget.
// Keyed by userId+role so each user gets their own cache entry.
const getCachedRecentTickets = unstable_cache(
  async (cacheKey: string) => {
    const { userId, role, limit } = JSON.parse(cacheKey)
    return _getRecentTicketsImpl(userId, role, limit)
  },
  undefined,
  { revalidate: RECENT_TICKETS_CACHE_TTL, tags: ['recent-tickets'] },
)

async function getSidebarData(currentUser: { id: string; role: string }): Promise<SidebarDataResult> {
  const { id: userId, role } = currentUser

  if (role === 'project_manager' || role === 'admin') {
    const [unassignedTickets, developers, projectAnalytics] = await Promise.all([
      (async () => {
        const tickets = await db
          .select({
            id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
            status: ticket.status, priority: ticket.priority, category: ticket.category,
            clientId: ticket.clientId, projectId: ticket.projectId, createdAt: ticket.createdAt,
          })
          .from(ticket).where(and(isNull(ticket.assignedToId), ne(ticket.status, 'closed')))
          .orderBy(desc(ticket.createdAt)).limit(10)
        if (tickets.length === 0) return []
        const userIds = [...new Set(tickets.map((t) => t.clientId))]
        const users = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds))
        const userMap = new Map(users.map((u) => [u.id, u.name]))
        return tickets.map((t: any) => ({ ...t, status: t.status as TicketStatus, priority: t.priority as TicketPriority, category: t.category as TicketCategory, clientName: userMap.get(t.clientId) }))
      })(),
      (async () => {
        const devs = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.role, 'developer'))
        if (devs.length === 0) return []
        const devIds = devs.map((d) => d.id)
        const ticketCounts = await db.select({ assignedToId: ticket.assignedToId, count: count() }).from(ticket).where(and(inArray(ticket.assignedToId, devIds), ne(ticket.status, 'closed'))).groupBy(ticket.assignedToId)
        const countMap = new Map(ticketCounts.map((r: any) => [r.assignedToId, Number(r.count) || 0]))
        return devs.map((dev) => ({ ...dev, activeTickets: countMap.get(dev.id) || 0 }))
      })(),
      (async () => {
        try {
          const projectsList = await db
            .select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode })
            .from(project)
            .where(role === 'project_manager' ? eq(project.managerId, userId) : undefined)
            .orderBy(sql`${project.projectName} DESC`)
          if (projectsList.length === 0) return []
          const projectIds = projectsList.map((p) => p.id)
          const ticketCounts = await db.select({ projectId: ticket.projectId, status: ticket.status, count: count() }).from(ticket).where(and(inArray(ticket.projectId, projectIds), isNotNull(ticket.projectId))).groupBy(ticket.projectId, ticket.status)
          const countsByProject = new Map<number, any>()
          for (const row of ticketCounts) {
            if (!row.projectId) continue
            let entry = countsByProject.get(row.projectId)
            if (!entry) { entry = { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 }; countsByProject.set(row.projectId, entry) }
            const c = Number(row.count) || 0
            entry.total += c
            if (row.status === 'open' || row.status === 'assigned') entry.open += c
            if (row.status === 'in_progress' || row.status === 'reopened') entry.inProgress += c
            if (row.status === 'resolved' || row.status === 'pending_client') entry.resolved += c
            if (row.status === 'closed') entry.closed += c
          }
          return projectsList.map((p) => ({ id: p.id, projectName: p.projectName, projectCode: p.projectCode, ...(countsByProject.get(p.id) || { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 }) }))
        } catch (err) {
          console.error('[Sidebar] Failed to load project analytics:', err)
          return []
        }
      })(),
    ])
    return { activeTimer: null, projects: projectAnalytics.map((pa: any) => ({ id: pa.id, projectName: pa.projectName, projectCode: pa.projectCode, ticketCount: pa.total })), unassignedTickets, developers, projectAnalytics }
  }

  if (role === 'developer') {
    // Before: devAssignments + ticketAssignments in Promise.all, then projectRows sequentially.
    // After:  projectRows IIFE runs concurrently with activeTimerResult — eliminates the await chain.
    const [activeTimerResult, projectRows] = await Promise.all([
      db.select().from(timeLog).where(and(eq(timeLog.userId, userId), isNull(timeLog.endTime))).limit(1),
      (async () => {
        const [devProjects, ticketProjects] = await Promise.all([
          db.select({ projectId: projectDeveloper.projectId }).from(projectDeveloper).where(eq(projectDeveloper.userId, userId)),
          db.select({ projectId: ticket.projectId }).from(ticket).where(and(eq(ticket.assignedToId, userId), isNotNull(ticket.projectId))),
        ])
        const combinedIds = [...new Set([
          ...devProjects.map((r) => r.projectId),
          ...ticketProjects.map((r) => r.projectId).filter((id): id is number => id !== null),
        ])]
        if (combinedIds.length === 0) return []
        return db
          .select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode })
          .from(project)
          .where(inArray(project.id, combinedIds))
      })(),
    ])

    const activeTimer = activeTimerResult[0] || null
    return { activeTimer, projects: (projectRows as any[]).map((p: any) => ({ ...p, ticketCount: 0 })), unassignedTickets: [], developers: [], projectAnalytics: [] }
  }

  // Check both: direct project.clientId match AND project_client junction table
  const [directProjects, linkedProjectIds] = await Promise.all([
    db
      .select({ projectId: project.id })
      .from(project)
      .where(eq(project.clientId, userId)),
    db
      .select({ projectId: projectClient.projectId })
      .from(projectClient)
      .where(eq(projectClient.userId, userId)),
  ])
  const allProjectIds = [...new Set([
    ...directProjects.map((p) => p.projectId),
    ...linkedProjectIds.map((pc) => pc.projectId),
  ])]

  let projectRows: any[] = []
  if (allProjectIds.length > 0) {
    // OPTIMIZED: Filter the ticket count subquery by the client's project IDs only.
    // Before: scanned ALL tickets and grouped by projectId (full table scan).
    // After:  scans only tickets belonging to the client's projects.
    // Impact: for a client with 3 projects, scans ~5% of the ticket table.
    const ticketCountSubquery = db.select({
      projectId: ticket.projectId,
      cnt: count().as('cnt'),
    }).from(ticket)
      .where(inArray(ticket.projectId, allProjectIds))
      .groupBy(ticket.projectId)
      .as('t')

    projectRows = await db
      .select({
        id: project.id,
        projectName: project.projectName,
        projectCode: project.projectCode,
        ticketCount: sql<number>`COALESCE(t.cnt, 0)::int`,
      })
      .from(project)
      .leftJoin(ticketCountSubquery, eq(project.id, ticketCountSubquery.projectId))
      .where(and(inArray(project.id, allProjectIds), eq(project.status, 'active')))
  }

  return { activeTimer: null, projects: projectRows.map((p) => ({ ...p, ticketCount: p.ticketCount ?? 0 })), unassignedTickets: [], developers: [], projectAnalytics: [] }
}

const getCachedSidebarData = unstable_cache(
  async (userId: string, role: string) => getSidebarData({ id: userId, role }),
  undefined,
  { revalidate: SIDEBAR_CACHE_TTL, tags: ['sidebar-data'] },
)

async function getProjectMetricsInternal(): Promise<ProjectMetricsResult> {
  const [ps, ts, tr] = await Promise.all([
    db.select({ total: sql<number>`COUNT(*)::int`, active: sql<number>`COUNT(*) FILTER (WHERE ${project.status} = 'active')::int` }).from(project),
    db.select({ openCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} IN ('open','assigned','in_progress','reopened'))::int`, closedCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'closed')::int` }).from(ticket),
    db.select({ total: sql<number>`COALESCE(SUM(${timeLog.durationMinutes}), 0)::int` }).from(timeLog).where(sql`${timeLog.endTime} IS NOT NULL`),
  ])
  return { totalProjects: Number(ps?.[0]?.total) || 0, activeProjects: Number(ps?.[0]?.active) || 0, totalProjectHours: Math.round((Number(tr?.[0]?.total) || 0) / 60 * 10) / 10, openTickets: Number(ts?.[0]?.openCount) || 0, closedTickets: Number(ts?.[0]?.closedCount) || 0 }
}

const getCachedProjectMetrics = unstable_cache(
  async () => getProjectMetricsInternal(),
  ['project-metrics-default'],
  { revalidate: METRICS_CACHE_TTL, tags: ['project-metrics'] },
)

/** Renewal status — cached separately because contract data changes at most daily. */
const getCachedRenewalStatus = unstable_cache(
  async (userId: string) => getRenewalStatusInternal({ id: userId }),
  undefined,
  { revalidate: RENEWAL_CACHE_TTL, tags: ['renewal-status'] },
)

/**
 * Fire-and-forget notification creation for renewal reminders.
 * Extracted from getRenewalStatusInternal so the SELECT/INSERT doesn't
 * block the critical path of getDashboardCriticalData.
 */
async function _fireNotificationReminder(
  userId: string,
  wallet: { id: number | null; remainingHours: number },
  lowHours: boolean,
  expiringSoon: boolean,
  contractExpired: boolean,
  daysRemaining: number,
) {
  try {
    const notificationTitle = contractExpired
      ? 'Support Contract Expired'
      : 'Support Renewal Reminder'
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [existing] = await db
      .select({ id: notificationSchema.id })
      .from(notificationSchema)
      .where(and(
        eq(notificationSchema.userId, userId),
        eq(notificationSchema.title, notificationTitle),
        gte(notificationSchema.createdAt, twentyFourHoursAgo),
      ))
      .limit(1)

    if (!existing) {
      let message: string
      if (contractExpired) {
        message = 'Your support contract has expired.'
      } else if (lowHours && expiringSoon) {
        message = `Support hours low (${wallet.remainingHours}h) + contract expires in ${daysRemaining} days.`
      } else if (lowHours) {
        message = `Only ${wallet.remainingHours} support hours remaining.`
      } else {
        message = `Support expires in ${daysRemaining} days.`
      }

      await db.insert(notificationSchema).values({
        userId,
        title: notificationTitle,
        message,
        link: wallet.id ? `/dashboard/wallets/${wallet.id}` : '/dashboard/wallets',
        isRead: false,
      })
    }
  } catch (err) {
    console.error('[Dashboard] Notification reminder failed:', err)
  }
}

async function getRenewalStatusInternal(currentUser: { id: string }): Promise<RenewalStatus> {
  const [wallet] = await db
    .select({
      id: supportWallet.id, remainingHours: supportWallet.remainingHours,
      totalPurchasedHours: supportWallet.totalPurchasedHours,
      contractStartDate: supportWallet.contractStartDate, contractEndDate: supportWallet.contractEndDate,
    })
    .from(supportWallet).where(eq(supportWallet.clientId, currentUser.id)).limit(1)

  if (!wallet) return { showReminder: false, lowHours: false, expiringSoon: false, contractExpired: false, remainingHours: 0, totalPurchasedHours: 0, contractStartDate: null, contractEndDate: null, daysRemaining: 0, walletId: null }

  const lowHours = wallet.remainingHours <= 10
  let daysRemaining = 0, expiringSoon = false, contractExpired = false
  if (wallet.contractEndDate) {
    const end = new Date(wallet.contractEndDate)
    const today = new Date(); today.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0)
    daysRemaining = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    contractExpired = daysRemaining <= 0
    expiringSoon = daysRemaining > 0 && daysRemaining <= 30
  }
  const showReminder = lowHours || expiringSoon || contractExpired

  // ── Create in-app notification (fire-and-forget, not on critical path) ─
  // Before: the SELECT check for existing notifications was AWAITED in the
  // critical path of getDashboardCriticalData. Now it's deferred to AFTER
  // the renewal status is returned, so the dashboard renders immediately.
  if (showReminder) {
    _fireNotificationReminder(currentUser.id, wallet, lowHours, expiringSoon, contractExpired, daysRemaining).catch(() => {})
  }

  return { showReminder, lowHours, expiringSoon, contractExpired, remainingHours: wallet.remainingHours, totalPurchasedHours: wallet.totalPurchasedHours, contractStartDate: wallet.contractStartDate, contractEndDate: wallet.contractEndDate, daysRemaining: Math.max(0, daysRemaining), walletId: wallet.id }
}

// ═══════════════════════════════════════════════════════════════════════════╗
// PHASE 3: Streaming Dashboard Architecture                               ║
// ═══════════════════════════════════════════════════════════════════════════╝
//
// Single orchestration — the page calls ONE server action for critical data.
// Sidebar widgets (heaviest queries) are streamed via a separate Suspense
// boundary that calls getDashboardSidebarData on its own.
//
// Data flow:
//   Page → getDashboardCriticalData()  (blocking — stats + tickets + renewal)
//         → <Suspense> → getDashboardSidebarData()  (streamed — sidebar)
//
// This ensures:
// 1. Critical content (KPI cards, recent tickets) renders immediately
// 2. Sidebar widgets stream in after, never blocking the main content
// 3. Cache TTLs prevent redundant DB queries across page navigations

/**
 * CRITICAL PATH: Fetches everything needed for the main content area.
 * Runs 3-4 cached queries in parallel:
 *   - Consolidated stats (1 FILTER query)
 *   - Recent 5 tickets (1 JOIN query, LIMIT 5)
 *   - Project metrics (admin-only, 3 aggregate queries)
 *   - Renewal status (client-only, 1 wallet query)
 */
export const getDashboardCriticalData = wrapServerAction('getDashboardCriticalData', async function getDashboardCriticalData(): Promise<DashboardCriticalData> {
  // ── PHASE 5: Block first request until DB pool is warm ────────────
  // On Neon free tier, the compute spins down after ~5min idle. The first
  // request after idle must wait for the compute to wake (5-15s). Without
  // this waitForDb call, the dashboard's queries race against the async
  // warmup: the first query tries to connect → pool is empty → connect()
  // blocks for 15s (connectionTimeoutMillis) → fails → retries → all
  // cascading into the ~32s initial load.
  //
  // waitForDb() blocks up to 30s for the pool to warm up (5 attempts,
  // each with 15s timeout). Once resolved, the pool has 2+ established
  // connections ready for immediate use.
  await waitForDb()

  const currentUser = await getCurrentUser()
  const { id: userId, name, email, role } = currentUser

  // Recent tickets now cached (30s TTL) to avoid redundant queries on every dashboard load
  const recentTicketsKey = JSON.stringify({ userId, role, limit: 5 })

  // Use shared getConsolidatedDashboardData from tickets/queries.ts instead of
  // the local duplicate implementation. This eliminates one redundant SQL query
  // implementation and uses a single cache namespace.
  const [consolidatedStats, recentTickets, projectMetrics, renewalStatus] = await Promise.all([
    getConsolidatedDashboardData(),
    getCachedRecentTickets(recentTicketsKey),
    role === 'admin' ? getCachedProjectMetrics() : Promise.resolve(null),
    role === 'client' ? getCachedRenewalStatus(userId) : Promise.resolve({
      showReminder: false, lowHours: false, expiringSoon: false, contractExpired: false,
      remainingHours: 0, totalPurchasedHours: 0, contractStartDate: null, contractEndDate: null,
      daysRemaining: 0, walletId: null,
    } as RenewalStatus),
  ])

  return {
    user: { id: userId, name, email, role: role as UserRole },
    consolidatedStats,
    recentTickets,
    projectMetrics,
    renewalStatus,
  }
})

/**
 * STREAMED PATH: Sidebar widgets fetched separately.
 * Heaviest queries: unassigned tickets, developer workload, project analytics.
 * Never blocks the main content — called from a Suspense boundary.
 */
export const getDashboardSidebarData = wrapServerAction('getDashboardSidebarData', async function getDashboardSidebarData(): Promise<SidebarDataResult> {
  const currentUser = await getCurrentUser()
  return getCachedSidebarData(currentUser.id, currentUser.role)
})
