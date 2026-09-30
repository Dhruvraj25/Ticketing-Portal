'use server'

import { unstable_cache } from 'next/cache'
import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { db } from '@/lib/db'
import { user, ticket, project } from '@/lib/db/schema'
import { and, eq, desc, ne, count, inArray } from 'drizzle-orm'
import { wrapServerAction, recordActionExecution, cached } from '@/lib/performance-profiler'
import type { AssignableResource } from '@/lib/ticket-assignment'

// ============================================================================
// USER LIST (Admin & Project Manager) — for dropdowns and selection (cached 300s)
// ============================================================================

/** Internal implementation: fetch all users from DB */
async function _getUserListData() {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      // Customer company (New Project → Company dropdown); null for older clients.
      companyName: user.companyName,
      userType: user.userType,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
}

const getCachedUserList = unstable_cache(
  async () => _getUserListData(),
  ['user-list'],
  { revalidate: 300, tags: ['user-list'] },
)

export const getUserList = wrapServerAction('getUserList', async function getUserList() {
  const currentUser = await getUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }

  return getCachedUserList()
})

// ============================================================================
// DEVELOPERS — for assignment dropdowns (cached 300s)
// ============================================================================

/** Internal implementation: fetches developers + active ticket counts */
async function _getDevelopersData() {
  const developers = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(eq(user.role, 'developer'))

  if (developers.length === 0) return []

  // Single GROUP BY query replaces N+1 per-developer queries
  const devIds = developers.map(d => d.id)
  const ticketCounts = await db
    .select({
      assignedToId: ticket.assignedToId,
      count: count(),
    })
    .from(ticket)
    .where(and(inArray(ticket.assignedToId, devIds), ne(ticket.status, 'closed')))
    .groupBy(ticket.assignedToId)

  const countMap = new Map(ticketCounts.map(r => [r.assignedToId, Number(r.count) || 0]))

  return developers.map(dev => ({
    ...dev,
    activeTickets: countMap.get(dev.id) || 0,
  }))
}

const getCachedDevelopers = unstable_cache(
  async () => _getDevelopersData(),
  ['developers'],
  { revalidate: 300, tags: ['lookup-developers'] },
)

/**
 * Public wrapper: React.cache() per-request dedup + unstable_cache cross-request (300s).
 * Before: SQL queries ran on every page load (ticket detail, ticket list, assignments).
 * After:  SQL runs at most once per 300s across all users hitting the same cache entry.
 */
export const getDevelopers = wrapServerAction('getDevelopers', async function getDevelopers() {
  return getCachedDevelopers()
})

// ============================================================================
// ASSIGNABLE RESOURCES — developers + project managers (for assignment)
// ============================================================================
// Managers carry the projects they manage: a manager is assignable only to a
// ticket in one of those projects (lib/ticket-assignment.ts canBeAssignee —
// enforced again by assignTicket). The plain developer list (getDevelopers)
// is unchanged for its other uses (e.g. Team).

async function _getAssignableResourcesData(): Promise<AssignableResource[]> {
  const [developers, managers, managed] = await Promise.all([
    _getDevelopersData(),
    db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.role, 'project_manager')),
    db.select({ id: project.id, managerId: project.managerId }).from(project),
  ])
  const byManager = new Map<string, number[]>()
  for (const p of managed) if (p.managerId) byManager.set(p.managerId, [...(byManager.get(p.managerId) ?? []), p.id])

  const managerIds = managers.map((m) => m.id)
  const counts = managerIds.length > 0
    ? await db.select({ assignedToId: ticket.assignedToId, count: count() }).from(ticket)
        .where(and(inArray(ticket.assignedToId, managerIds), ne(ticket.status, 'closed'))).groupBy(ticket.assignedToId)
    : []
  const countMap = new Map(counts.map((r) => [r.assignedToId, Number(r.count) || 0]))

  return [
    ...developers.map((d) => ({ ...d, role: 'developer' as const })),
    ...managers
      .filter((m) => (byManager.get(m.id) ?? []).length > 0)
      .map((m) => ({ ...m, activeTickets: countMap.get(m.id) || 0, role: 'project_manager' as const, managedProjectIds: byManager.get(m.id) ?? [] })),
  ]
}

const getCachedAssignableResources = unstable_cache(
  async () => _getAssignableResourcesData(),
  ['assignable-resources'],
  { revalidate: 300, tags: ['lookup-developers', 'lookup-projects'] },
)

export const getAssignableResources = wrapServerAction('getAssignableResources', async function getAssignableResources(): Promise<AssignableResource[]> {
  const currentUser = await getUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') return []
  return getCachedAssignableResources()
})
