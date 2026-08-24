'use server'

import { unstable_cache } from 'next/cache'
import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { db } from '@/lib/db'
import { user, ticket } from '@/lib/db/schema'
import { and, eq, desc, ne, count, inArray } from 'drizzle-orm'
import { wrapServerAction, recordActionExecution, cached } from '@/lib/performance-profiler'

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
