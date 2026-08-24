'use server'

import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { ticket, timeLog, module as moduleTable, user } from '@/lib/db/schema'
import { and, eq, count, inArray, sum, sql } from 'drizzle-orm'
import { wrapServerAction } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'

const ANALYTICS_CACHE_TTL = 60 // 60 seconds

// ============================================================================
// PROJECT DETAIL ANALYTICS — per-project deep dive for project page (cached)
// ============================================================================

/** Internal implementation — accepts projectId directly */
async function _getProjectDetailAnalyticsImpl(projectId: number) {
  // Get all ticket IDs for this project
  const projectTickets = await db
    .select({ id: ticket.id })
    .from(ticket)
    .where(eq(ticket.projectId, projectId))
  const projectTicketIds = projectTickets.map((t) => t.id)

  // Total hours logged
  let totalMinutesLogged = 0
  if (projectTicketIds.length > 0) {
    const [timeResult] = await db
      .select({ total: sum(timeLog.durationMinutes) })
      .from(timeLog)
      .where(
        and(
          inArray(timeLog.ticketId, projectTicketIds),
          sql`${timeLog.endTime} IS NOT NULL`,
        ),
      )
    totalMinutesLogged = Number(timeResult?.total) || 0
  }

  // Ticket counts by status
  const ticketCounts = await db
    .select({ status: ticket.status, count: count() })
    .from(ticket)
    .where(eq(ticket.projectId, projectId))
    .groupBy(ticket.status)

  const ticketStatusMap: Record<string, number> = {}
  let totalTickets = 0
  for (const r of ticketCounts) {
    const c = Number(r.count) || 0
    ticketStatusMap[r.status] = c
    totalTickets += c
  }

  // Module stats
  const moduleTicketCounts = await db
    .select({
      moduleId: ticket.moduleId,
      count: count(),
    })
    .from(ticket)
    .where(
      and(
        eq(ticket.projectId, projectId),
        sql`${ticket.moduleId} IS NOT NULL`,
      ),
    )
    .groupBy(ticket.moduleId)

  const moduleIds = moduleTicketCounts
    .filter((r) => r.moduleId !== null)
    .map((r) => r.moduleId as number)

  const moduleNames = moduleIds.length > 0
    ? await db
        .select({ id: moduleTable.id, name: moduleTable.moduleName })
        .from(moduleTable)
        .where(inArray(moduleTable.id, moduleIds))
    : []
  const moduleNameMap = new Map(moduleNames.map((m) => [m.id, m.name]))

  const moduleStats = moduleTicketCounts
    .filter((r) => r.moduleId !== null)
    .map((r) => ({
      moduleId: r.moduleId as number,
      moduleName: moduleNameMap.get(r.moduleId as number) || `Module #${r.moduleId}`,
      ticketCount: Number(r.count) || 0,
    }))

  // Developer contribution
  let devTimeLogs: { userId: string; totalMinutes: number }[] = []
  if (projectTicketIds.length > 0) {
    const rows = await db
      .select({
        userId: timeLog.userId,
        totalMinutes: sum(timeLog.durationMinutes),
      })
      .from(timeLog)
      .where(
        and(
          inArray(timeLog.ticketId, projectTicketIds),
          sql`${timeLog.endTime} IS NOT NULL`,
        ),
      )
      .groupBy(timeLog.userId)
    devTimeLogs = rows.map((r) => ({ userId: r.userId, totalMinutes: Number(r.totalMinutes) || 0 }))
  }

  const developerUserIds = devTimeLogs.map((r) => r.userId)
  const devUsers = developerUserIds.length > 0
    ? await db
        .select({ id: user.id, name: user.name, role: user.role })
        .from(user)
        .where(inArray(user.id, developerUserIds))
    : []
  const devUserMap = new Map(devUsers.map((u) => [u.id, u]))

  const developerContributions = devTimeLogs
    .map((r) => {
      const u = devUserMap.get(r.userId)
      return {
        userId: r.userId,
        userName: u?.name || 'Unknown',
        role: u?.role || 'developer',
        totalMinutes: Number(r.totalMinutes) || 0,
      }
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes)

  const developerHours = developerContributions
    .filter((c) => c.role === 'developer')
    .reduce((s, c) => s + c.totalMinutes, 0)
  const managerHours = developerContributions
    .filter((c) => c.role === 'project_manager' || c.role === 'admin')
    .reduce((s, c) => s + c.totalMinutes, 0)

  return {
    totalHours: Math.round((totalMinutesLogged || 0) / 60 * 10) / 10,
    totalTickets,
    ticketStatusMap,
    moduleStats,
    developerContributions,
    developerHours: Math.round(developerHours / 60 * 10) / 10,
    managerHours: Math.round(managerHours / 60 * 10) / 10,
  }
}

const getCachedProjectDetailAnalytics = unstable_cache(
  async (projectId: number) => _getProjectDetailAnalyticsImpl(projectId),
  undefined,
  { revalidate: ANALYTICS_CACHE_TTL, tags: ['project-analytics'] },
)

export const getProjectDetailAnalytics = wrapServerAction('getProjectDetailAnalytics', async function getProjectDetailAnalytics(projectId: number) {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }
  return getCachedProjectDetailAnalytics(projectId)
})

// ============================================================================
// MODULE ANALYTICS — per-module ticket, hour, and resolution stats (cached)
// ============================================================================

/** Internal implementation — accepts projectId directly */
async function _getModuleAnalyticsImpl(projectId: number) {
  const modules = await db
    .select({ id: moduleTable.id, moduleName: moduleTable.moduleName, status: moduleTable.status })
    .from(moduleTable)
    .where(eq(moduleTable.projectId, projectId))
    .orderBy(moduleTable.moduleName)

  if (modules.length === 0) return []

  const moduleIds = modules.map((m) => m.id)

  const ticketData = await db
    .select({
      moduleId: ticket.moduleId,
      status: ticket.status,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt,
      id: ticket.id,
    })
    .from(ticket)
    .where(
      and(
        eq(ticket.projectId, projectId),
        inArray(ticket.moduleId, moduleIds),
        sql`${ticket.moduleId} IS NOT NULL`,
      ),
    )

  const moduleTicketIds = ticketData.map((t) => t.id)
  const hourData = moduleTicketIds.length > 0
    ? await db
        .select({
          ticketId: timeLog.ticketId,
          totalMinutes: sum(timeLog.durationMinutes),
        })
        .from(timeLog)
        .where(
          and(
            inArray(timeLog.ticketId, moduleTicketIds),
            sql`${timeLog.endTime} IS NOT NULL`,
          ),
        )
        .groupBy(timeLog.ticketId)
    : []

  const hoursByTicket = new Map(hourData.map((h) => [h.ticketId, Number(h.totalMinutes) || 0]))

  return modules.map((mod) => {
    const modTickets = ticketData.filter((t) => t.moduleId === mod.id)
    const total = modTickets.length
    const resolved = modTickets.filter((t) => t.status === 'resolved' || t.status === 'closed')

    const resolutionTimes = resolved
      .filter((t) => t.resolvedAt)
      .map((t) =>
        (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) /
        (1000 * 60 * 60),
      )

    const avgResolutionHours =
      resolutionTimes.length > 0
        ? Math.round(
            (resolutionTimes.reduce((s, h) => s + h, 0) / resolutionTimes.length) * 10,
          ) / 10
        : 0

    const moduleMinutes = modTickets.reduce(
      (s, t) => s + (hoursByTicket.get(t.id) || 0),
      0,
    )

    return {
      moduleId: mod.id,
      moduleName: mod.moduleName,
      status: mod.status,
      ticketCount: total,
      resolvedCount: resolved.length,
      totalMinutes: moduleMinutes,
      totalHours: Math.round((moduleMinutes / 60) * 10) / 10,
      avgResolutionHours,
    }
  })
}

const getCachedModuleAnalytics = unstable_cache(
  async (projectId: number) => _getModuleAnalyticsImpl(projectId),
  undefined,
  { revalidate: ANALYTICS_CACHE_TTL, tags: ['module-analytics'] },
)

export const getModuleAnalytics = wrapServerAction('getModuleAnalytics', async function getModuleAnalytics(projectId: number) {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }
  return getCachedModuleAnalytics(projectId)
})

// ============================================================================
// PROJECT TICKET ANALYTICS — per-project ticket stats for dashboard (cached)
// ============================================================================

/** Internal implementation */
async function _getProjectTicketAnalyticsImpl() {
  // Optimized single-pass query for all ticket statuses per project
  const rows = await db
    .select({
      projectId: ticket.projectId,
      status: ticket.status,
      count: count(),
    })
    .from(ticket)
    .groupBy(ticket.projectId, ticket.status)

  // Group by project
  const countsByProject = new Map<number, { total: number; open: number; inProgress: number; resolved: number; closed: number }>()

  for (const row of rows) {
    if (!row.projectId) continue
    let entry = countsByProject.get(row.projectId)
    if (!entry) {
      entry = { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 }
      countsByProject.set(row.projectId, entry)
    }
    const c = Number(row.count) || 0
    entry.total += c
    if (row.status === 'open' || row.status === 'assigned' || row.status === 'new') entry.open += c
    if (row.status === 'in_progress' || row.status === 'reopened') entry.inProgress += c
    if (row.status === 'resolved' || row.status === 'pending_client') entry.resolved += c
    if (row.status === 'closed') entry.closed += c
  }

  return Array.from(countsByProject.entries()).map(([projectId, counts]) => ({
    projectId,
    ...counts,
  }))
}

const getCachedProjectTicketAnalytics = unstable_cache(
  async (role: string, userId: string) => _getProjectTicketAnalyticsImpl(),
  undefined,
  { revalidate: ANALYTICS_CACHE_TTL, tags: ['project-ticket-analytics'] },
)

export const getProjectTicketAnalytics = wrapServerAction('getProjectTicketAnalytics', async function getProjectTicketAnalytics() {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }
  return getCachedProjectTicketAnalytics(currentUser.role, currentUser.id)
})
