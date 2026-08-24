'use server'

import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { project, user, ticket, module as moduleTable, projectDeveloper, projectClient } from '@/lib/db/schema'
import { and, eq, desc, asc, count, inArray, isNotNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { wrapServerAction, recordActionExecution, cached } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'
import type { ProjectStatus } from '@/lib/types'
import { PROJECT_CACHE_TTL, getProjectListCacheKey } from './cache'

// ============================================================================
// PROJECT TICKET STATS — lightweight single-query aggregations (cached 60s TTL)
// ============================================================================

/**
 * Returns ticket statistics for a single project using optimized SQL aggregations.
 * Replaces getTickets() + client-side filtering.
 * Executes ONE lightweight SQL query using FILTER (CASE WHEN) clauses.
 */
async function _getProjectTicketStatsImpl(projectId: number) {
  const [result] = await db
    .select({
      total: count(),
      open: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'new')::int`,
      assigned: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'assigned')::int`,
      inProgress: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'in_progress')::int`,
      resolved: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'resolved')::int`,
      closed: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'closed')::int`,
      reopened: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} IN ('estimate_pending', 'estimate_approved', 'request_for_revision'))::int`,
    })
    .from(ticket)
    .where(eq(ticket.projectId, projectId))

  return {
    total: Number(result?.total) || 0,
    open: Number(result?.open) || 0,
    assigned: Number(result?.assigned) || 0,
    inProgress: Number(result?.inProgress) || 0,
    resolved: Number(result?.resolved) || 0,
    closed: Number(result?.closed) || 0,
    reopened: Number(result?.reopened) || 0,
  }
}

const getCachedProjectTicketStats = unstable_cache(
  async (projectId: number) => _getProjectTicketStatsImpl(projectId),
  undefined,
  { revalidate: PROJECT_CACHE_TTL, tags: ['project-ticket-stats'] },
)

export const getProjectTicketStats = wrapServerAction('getProjectTicketStats', async function getProjectTicketStats(projectId: number) {
  const currentUser = await getCurrentUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }

  return getCachedProjectTicketStats(projectId)
})

// ============================================================================
// PAGINATED PROJECT LIST — server-side filtering, sorting, searching, pagination
// ============================================================================

export interface ProjectListFilters {
  page?: number
  limit?: number
  search?: string
  status?: string
  clientId?: string
  managerId?: string
  sortBy?: 'name' | 'created' | 'tickets' | 'progress'
  sortOrder?: 'asc' | 'desc'
}

export interface ProjectListResult {
  projects: ProjectListItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ProjectListItem {
  id: number
  projectName: string
  projectCode: string
  clientId: string
  managerId: string
  description: string | null
  startDate: string | null
  status: ProjectStatus
  createdAt: Date
  updatedAt: Date
  clientName?: string
  clientEmail?: string
  managerName?: string
  managerEmail?: string
  moduleCount: number
  ticketCount: number
}

/**
 * Optimized getProjects — Phase 3 (Profiling Instrumentation)
 *
 * Optimizations (unchanged from Phase 2):
 * 1. Developer role queries (projectDeveloper + ticket) run in parallel
 * 2. Total count + main data query run in parallel via Promise.all()
 * 3. Module/ticket counts use scalar subqueries in the SELECT, eliminating
 *    two separate GROUP BY queries and the post-query Map building
 *
 * New in Phase 3:
 * - Stage-level timing for each logical phase
 * - Individual SQL query profiling with execution time, rows, and parent action
 * - Final breakdown table with all stage timings
 * - Slow query warning (>200ms prints exact SQL)
 * - Slow mapping warning (>50ms prints record count)
 */
export const getProjects = wrapServerAction('getProjects', async function getProjects(filters?: ProjectListFilters) {
  const IS_DEV = process.env.NODE_ENV !== 'production'
  const stageTimings: Record<string, number> = {}
  const sqlTimings: { label: string; sql: string; durationMs: number; rows?: number }[] = []
  let sqlCounter = 0
  const totalStart = performance.now()

  /** Pool.query() in db/index.ts already logs every SQL query with timing, rows, and parent action.
   *  This helper adds stage-level tracking so we can attribute wall-clock time to each logical phase
   *  and identify which stage (not which SQL statement) is the bottleneck. */
  async function profileSql<T>(label: string, query: Promise<T[]>): Promise<{ data: T[]; rows: number }> {
    sqlCounter++
    const start = performance.now()
    const data = await query
    const duration = performance.now() - start
    const rowCount = data.length
    // Store the timing for the final breakdown. We capture a representative SQL snippet
    // for the >200ms warning (the full SQL is already logged by db/index.ts).
    sqlTimings.push({ label, sql: `SQL #${sqlCounter}`, durationMs: duration, rows: rowCount })
    if (IS_DEV && duration > 200) {
      // The full SQL text is already printed by db/index.ts with this same query.
      // This warning just calls attention to it within the getProjects breakdown.
      console.log(`  ⚠️  [getProjects] SQL #${sqlCounter} (${label}) exceeded 200ms: ${Math.round(duration)}ms, rows: ${rowCount} — see full SQL above`)
    }
    return { data, rows: rowCount }
  }

  // ── Stage 1: getCurrentUser() ───────────────────────────────────────
  let stageStart = performance.now()
  const currentUser = await getCurrentUser()
  stageTimings['getCurrentUser'] = performance.now() - stageStart

  const page = Math.max(1, filters?.page || 1)
  const limit = Math.min(100, Math.max(1, filters?.limit || 50))
  const offset = (page - 1) * limit
  const sortBy = filters?.sortBy || 'created'
  const sortOrder = filters?.sortOrder || 'desc'

  // ── Stage 2: Role filtering ─────────────────────────────────────────
  stageStart = performance.now()

  // Build WHERE conditions
  const conditions: ReturnType<typeof eq>[] = []

  // Role-based filtering
  if (currentUser.role === 'client') {
    // Check both: direct project.clientId match AND project_client junction table
    // This ensures ALL client users (primary + secondary) can see their projects.
    const [directProjects, linkedProjectIds] = await Promise.all([
      db
        .select({ projectId: project.id })
        .from(project)
        .where(eq(project.clientId, currentUser.id)),
      db
        .select({ projectId: projectClient.projectId })
        .from(projectClient)
        .where(eq(projectClient.userId, currentUser.id)),
    ])
    const allProjectIds = [...new Set([
      ...directProjects.map((p) => p.projectId),
      ...linkedProjectIds.map((pc) => pc.projectId),
    ])]
    if (allProjectIds.length === 0) {
      conditions.push(eq(project.id, -1))
    } else {
      conditions.push(inArray(project.id, allProjectIds))
    }
  } else if (currentUser.role === 'project_manager') {
    conditions.push(eq(project.managerId, currentUser.id))
  } else if (currentUser.role === 'developer') {
    // OPTIMIZATION: Run both developer ID queries in parallel
    const [{ data: devAssignments }, { data: ticketAssignments }] = await Promise.all([
      profileSql('dev_assignments',
        db
          .select({ projectId: projectDeveloper.projectId })
          .from(projectDeveloper)
          .where(eq(projectDeveloper.userId, currentUser.id)),
      ),
      profileSql('ticket_assignments',
        db
          .select({ projectId: ticket.projectId })
          .from(ticket)
          .where(and(eq(ticket.assignedToId, currentUser.id), isNotNull(ticket.projectId))),
      ),
    ])
    const devIds = devAssignments.map((r) => r.projectId)
    const ticketIds = ticketAssignments
      .map((r) => r.projectId)
      .filter((id): id is number => id !== null)
    const combinedIds = [...new Set([...devIds, ...ticketIds])]

    if (combinedIds.length === 0) {
      conditions.push(eq(project.id, -1))
    } else {
      conditions.push(inArray(project.id, combinedIds))
    }
  }

  // Additional filters
  if (filters?.status && filters.status !== 'all') {
    conditions.push(eq(project.status, filters.status))
  }
  if (filters?.clientId && currentUser.role !== 'client') {
    conditions.push(eq(project.clientId, filters.clientId))
  }
  if (filters?.managerId && currentUser.role !== 'project_manager') {
    conditions.push(eq(project.managerId, filters.managerId))
  }

  // Search filter
  if (filters?.search) {
    const q = `%${filters.search.toLowerCase()}%`
    conditions.push(
      sql`(LOWER(${project.projectName}) LIKE ${q} OR LOWER(${project.projectCode}) LIKE ${q} OR LOWER(COALESCE(${project.description}, '')) LIKE ${q})`,
    )
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // Determine sort column
  let orderBy: any
  switch (sortBy) {
    case 'name':
      orderBy = sortOrder === 'asc' ? asc(project.projectName) : desc(project.projectName)
      break
    case 'created':
    default:
      orderBy = sortOrder === 'asc' ? asc(project.createdAt) : desc(project.createdAt)
      break
  }

  const clientUser = alias(user, 'client_user')
  const managerUser = alias(user, 'manager_user')

  stageTimings['Role filter'] = performance.now() - stageStart

  // ── Stage 3 & 4: Count query + Projects query (parallel) ───────────
  // Module counts and ticket counts are scalar subqueries inside the main SELECT,
  // so they execute as part of the projects query — not as separate round-trips.
  stageStart = performance.now()

  const [countResultArr, rows] = await Promise.all([
    profileSql('count_query',
      db
        .select({ total: count() })
        .from(project)
        .where(whereClause),
    ).then(r => r.data),

    profileSql('projects_query',
      db
        .select({
          id: project.id,
          projectName: project.projectName,
          projectCode: project.projectCode,
          clientId: project.clientId,
          managerId: project.managerId,
          description: project.description,
          startDate: project.startDate,
          status: project.status,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          clientName: clientUser.name,
          clientEmail: clientUser.email,
          managerName: managerUser.name,
          managerEmail: managerUser.email,
          // Scalar subqueries: PostgreSQL evaluates these inline per row —
          // no separate round-trips needed, no N+1.
          moduleCount: sql<number>`(SELECT COUNT(*)::int FROM ${moduleTable} WHERE ${moduleTable.projectId} = ${project.id})`.mapWith(Number),
          ticketCount: sql<number>`(SELECT COUNT(*)::int FROM ${ticket} WHERE ${ticket.projectId} = ${project.id})`.mapWith(Number),
        })
        .from(project)
        .leftJoin(clientUser, eq(project.clientId, clientUser.id))
        .leftJoin(managerUser, eq(project.managerId, managerUser.id))
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
    ).then(r => r.data),
  ])

  // Separate the combined Promise.all duration into logical stages for the breakdown.
  // Since both run in parallel, the wall-clock time is max(count, projects).
  // We attribute individual SQL durations from the profiled results.
  const countTiming = sqlTimings.find(t => t.label === 'count_query')
  const projectsTiming = sqlTimings.find(t => t.label === 'projects_query')
  // Module counts and ticket counts are scalar subqueries inside projects_query,
  // so their timing is included in the projects query duration. PostgreSQL's
  // planner evaluates them inline — no separate round-trips, no N+1.
  stageTimings['Count query'] = countTiming?.durationMs ?? 0
  stageTimings['Projects query'] = projectsTiming?.durationMs ?? 0
  // These are marked as 0 because they run as scalar subqueries inside the main SELECT.
  // The Projects query line already includes their execution time.
  stageTimings['Module counts'] = -1 // -1 signals scalar subquery — included in Projects query
  stageTimings['Ticket counts'] = -1 // -1 signals scalar subquery — included in Projects query

  const total = Number(countResultArr[0]?.total) || 0

  // ── Stage 5: JavaScript mapping ─────────────────────────────────────
  stageStart = performance.now()

  const projects = rows.map((r) => ({
    id: r.id,
    projectName: r.projectName,
    projectCode: r.projectCode,
    clientId: r.clientId,
    managerId: r.managerId,
    description: r.description,
    startDate: r.startDate,
    status: r.status as ProjectStatus,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    clientName: r.clientName ?? undefined,
    clientEmail: r.clientEmail ?? undefined,
    managerName: r.managerName ?? undefined,
    managerEmail: r.managerEmail ?? undefined,
    moduleCount: r.moduleCount,
    ticketCount: r.ticketCount,
  }))

  const mappingTime = performance.now() - stageStart
  stageTimings['Mapping'] = mappingTime

  if (IS_DEV && mappingTime > 50) {
    console.log(`  ⚠️  [getProjects] JavaScript mapping exceeded 50ms: ${Math.round(mappingTime)}ms, records: ${rows.length}`)
  }

  // ── Final Breakdown ─────────────────────────────────────────────────
  if (IS_DEV) {
    const totalTime = performance.now() - totalStart

    console.log()
    console.log('─'.repeat(70))
    console.log('  getProjects — Stage Breakdown')
    console.log('─'.repeat(70))

    const stages = [
      'getCurrentUser',
      'Role filter',
      'Count query',
      'Projects query',
      'Module counts',
      'Ticket counts',
      'Mapping',
    ]

    for (const stage of stages) {
      const t = stageTimings[stage]
      if (t === undefined) continue
      const isInQuery = t === -1
      const rounded = Math.round(t)
      const displayTime = isInQuery ? '<1' : String(rounded)
      const flag = isInQuery ? '≈' : rounded > 1000 ? '🔴' : rounded > 500 ? '🟡' : rounded > 200 ? '🟠' : '  '
      const note = isInQuery ? ' (scalar subquery — included in Projects query)' : ''
      console.log(`  ${flag}  ${stage.padEnd(28)} ${'.'.repeat(12)} ${String(displayTime).padStart(6)}ms${note}`)
    }

    const totalDisplay = Math.round(totalTime)
    console.log('     ' + '─'.repeat(48))
    console.log(`     ${'Total'.padEnd(28)} ${'.'.repeat(12)} ${String(totalDisplay).padStart(6)}ms`)
    console.log()

    // ── Slow query warnings ───────────────────────────────────────────
    const slowQueries = sqlTimings.filter(t => t.durationMs > 200)
    if (slowQueries.length > 0) {
      console.log('  ⚠️  SQL queries exceeding 200ms (see full SQL text in pool.query log above):')
      for (const q of slowQueries) {
        const roundMs = Math.round(q.durationMs)
        const flag = roundMs > 1000 ? '🔴' : '🟠'
        console.log(`     ${flag} ${q.label} (${q.sql}): ${roundMs}ms, rows: ${q.rows}`)
      }
      console.log()
    }
  }

  return projects
})

// ============================================================================
// GET PROJECT BY ID — cached with unstable_cache (60s TTL)
// ============================================================================

/** Internal implementation: fetch project data from DB */
async function _getProjectByIdImpl(projectId: number) {
  const [p] = await db
    .select({
      id: project.id,
      projectName: project.projectName,
      projectCode: project.projectCode,
      clientId: project.clientId,
      managerId: project.managerId,
      description: project.description,
      startDate: project.startDate,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  if (!p) return null

  // Fetch user names and counts in parallel
  const userIds = [p.clientId, p.managerId]
  const [users, [moduleCount], [ticketCount]] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(inArray(user.id, userIds)),
    db
      .select({ count: count() })
      .from(moduleTable)
      .where(eq(moduleTable.projectId, projectId)),
    db
      .select({ count: count() })
      .from(ticket)
      .where(eq(ticket.projectId, projectId)),
  ])

  const userMap = new Map(users.map((u) => [u.id, u]))
  const client = userMap.get(p.clientId)
  const manager = userMap.get(p.managerId)

  return {
    ...p,
    status: p.status as ProjectStatus,
    clientName: client?.name,
    clientEmail: client?.email,
    managerName: manager?.name,
    managerEmail: manager?.email,
    moduleCount: Number(moduleCount?.count) || 0,
    ticketCount: Number(ticketCount?.count) || 0,
  }
}

const getCachedProjectById = unstable_cache(
  async (projectId: number) => _getProjectByIdImpl(projectId),
  undefined,
  { revalidate: PROJECT_CACHE_TTL, tags: ['project-by-id'] },
)

export const getProjectById = wrapServerAction('getProjectById', async function getProjectById(projectId: number) {
  const currentUser = await getCurrentUser()

  const projectData = await getCachedProjectById(projectId)
  if (!projectData) throw new Error('Project not found')

  // Permission check — runs every time (lightweight, can't cache)
  if (currentUser.role === 'client' && projectData.clientId !== currentUser.id) {
    throw new Error('Access denied')
  }
  if (currentUser.role === 'project_manager' && projectData.managerId !== currentUser.id) {
    throw new Error('Access denied')
  }
  if (currentUser.role === 'developer') {
    const [devAccess] = await db
      .select({ count: count() })
      .from(projectDeveloper)
      .where(and(eq(projectDeveloper.projectId, projectId), eq(projectDeveloper.userId, currentUser.id)))
      .limit(1)

    if (Number(devAccess?.count) === 0) {
      const [ticketAccess] = await db
        .select({ count: count() })
        .from(ticket)
        .where(and(eq(ticket.projectId, projectId), eq(ticket.assignedToId, currentUser.id)))
        .limit(1)
      if (Number(ticketAccess?.count) === 0) {
        throw new Error('Access denied')
      }
    }
  }

  return projectData
})

// ============================================================================
// LIGHTWEIGHT PROJECT NAMES — for dropdowns and filters only
// ============================================================================

/** Internal implementation (no getCurrentUser — accepts role + userId) */
async function _getProjectNamesData(role: string, userId: string, filters?: {
  status?: ProjectStatus
  clientId?: string
  managerId?: string
}) {
  const conditions: ReturnType<typeof eq>[] = []

  if (role === 'client') {
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
    if (allProjectIds.length === 0) {
      conditions.push(eq(project.id, -1))
    } else {
      conditions.push(inArray(project.id, allProjectIds))
    }
  } else if (role === 'project_manager') {
    conditions.push(eq(project.managerId, userId))
  } else if (role === 'developer') {
    const devAssignments = await db
      .select({ projectId: projectDeveloper.projectId })
      .from(projectDeveloper)
      .where(eq(projectDeveloper.userId, userId))
    const ticketAssignments = await db
      .select({ projectId: ticket.projectId })
      .from(ticket)
      .where(and(eq(ticket.assignedToId, userId), isNotNull(ticket.projectId)))
    const devIds = devAssignments.map((r) => r.projectId)
    const ticketIds = ticketAssignments
      .map((r) => r.projectId)
      .filter((id): id is number => id !== null)
    const combinedIds = [...new Set([...devIds, ...ticketIds])]
    if (combinedIds.length === 0) {
      conditions.push(eq(project.id, -1))
    } else {
      conditions.push(inArray(project.id, combinedIds))
    }
  }

  if (filters?.status) conditions.push(eq(project.status, filters.status))
  if (filters?.clientId && role !== 'client') conditions.push(eq(project.clientId, filters.clientId))
  if (filters?.managerId && role !== 'project_manager') conditions.push(eq(project.managerId, filters.managerId))

  return db
    .select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode })
    .from(project)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(project.createdAt))
}

/** Cross-request cached wrapper (primitives only, no headers()) */
const getCachedProjectNames = unstable_cache(
  async (role: string, userId: string, status: string | undefined, clientId: string | undefined, managerId: string | undefined) => {
    return _getProjectNamesData(role, userId, { status: status as any, clientId, managerId })
  },
  undefined,
  { revalidate: PROJECT_CACHE_TTL, tags: ['project-names'] },
)

/**
 * React.cache() wrapper for per-request deduplication.
 * Uses JSON.stringify() to create a stable cache key because
 * React.cache() uses WeakMap (reference equality) on the first
 * argument — object literals would otherwise always miss.
 */
function _getProjectNamesImpl(filtersKey: string): Promise<{ id: number; projectName: string; projectCode: string }[]> {
  return cached(`getProjectNames::${filtersKey}`, async () => {
  recordActionExecution('getProjectNames')
  const filters: { status?: ProjectStatus; clientId?: string; managerId?: string } | undefined = filtersKey ? JSON.parse(filtersKey) : undefined
  const t0 = performance.now()
  const { role, id: userId } = await getCurrentUser()
  const result = await getCachedProjectNames(role, userId, filters?.status, filters?.clientId, filters?.managerId)
  const elapsed = Math.round(performance.now() - t0)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`  [Profiler] getProjectNames: ${elapsed}ms | Queries: 1`)
  }
  return result
  })
}

export const getProjectNames = wrapServerAction('getProjectNames', async function getProjectNames(filters?: {
  status?: ProjectStatus
  clientId?: string
  managerId?: string
}) {
  return _getProjectNamesImpl(JSON.stringify(filters ?? null))
})
