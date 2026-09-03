'use server'

import { unstable_cache, revalidateTag } from 'next/cache'
import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { db } from '@/lib/db'
import { ticket, comment, timeLog, ticketHistory, attachment, user, project, module as moduleTable, revisionHistory, projectClient } from '@/lib/db/schema'
import { and, eq, desc, asc, sql, isNull, isNotNull, ne, count, inArray, gte, lte, sum, or, like } from 'drizzle-orm'
import type { TicketStatus, TicketPriority, TicketCategory } from '@/lib/types'
import { CLIENT_VISIBLE_HISTORY_ACTIONS } from '@/lib/ticket-history-visibility'
import { wrapServerAction, recordActionExecution, cached } from '@/lib/performance-profiler'

// ── List Query (minimal fields, server-side pagination, SQL filtering) ─────

export interface TicketListItem {
  id: number
  ticketNumber: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  category: string
  projectId: number | null
  projectName?: string
  projectCode?: string
  moduleId: number | null
  moduleName?: string
  clientId: string
  clientName?: string
  assignedToId: string | null
  assignedToName?: string
  createdAt: Date
  updatedAt: Date
  closedAt: Date | null
  estimatedCompletionDate: string | null
  attachmentCount: number
  revisionCount: number
  estimatedHours: number | null
  estimateStatus: string | null
  hasActiveTimer: boolean
}

export interface TicketListFilters {
  search?: string
  status?: string
  priority?: string
  projectId?: number
  moduleId?: number
  assignedToId?: string
  clientId?: string
  environment?: string
  dateFrom?: string
  dateTo?: string
  sortBy?: 'newest' | 'oldest' | 'priority' | 'status'
  page?: number
  limit?: number
}

export interface TicketListResult {
  tickets: TicketListItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

const MAX_LIST_LIMIT = 50
const DEFAULT_LIST_LIMIT = 25

/**
 * Client organization scope (Client Approver model).
 *
 * A client account/organization has ONE Approver (user_type='approver',
 * usually the project's primary client) and possibly MANY Standard client
 * users (user_type='standard') linked to the same projects via project_client.
 *
 * The Approver is authorized to see tickets created by the Standard accounts
 * of the SAME client organization, while standard users only see their own
 * tickets. Membership is derived from shared projects — never from a
 * client-submitted value — so a client can never reach another client's data.
 *
 * Returns null for non-approver users (callers keep the plain self-only rule).
 */
export async function getClientOrgUserIds(clientUserId: string, userType: string | null): Promise<string[] | null> {
  if (userType !== 'approver') return null

  try {
    const [primaryProjects, linkedProjects] = await Promise.all([
      db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.clientId, clientUserId)),
      db
        .select({ projectId: projectClient.projectId })
        .from(projectClient)
        .where(eq(projectClient.userId, clientUserId)),
    ])

    const projectIds = new Set<number>([
      ...primaryProjects.map((p) => p.id),
      ...linkedProjects.map((l) => l.projectId),
    ])
    if (projectIds.size === 0) return [clientUserId]

    const [primaryClients, members] = await Promise.all([
      db
        .select({ clientId: project.clientId })
        .from(project)
        .where(inArray(project.id, [...projectIds])),
      db
        .select({ userId: projectClient.userId })
        .from(projectClient)
        .where(inArray(projectClient.projectId, [...projectIds])),
    ])

    const ids = new Set<string>([
      clientUserId,
      ...primaryClients.map((p) => p.clientId).filter((c): c is string => !!c),
      ...members.map((m) => m.userId),
    ])
    return [...ids]
  } catch (err) {
    console.error('[ClientScope] Failed to resolve organization members:', err)
    return [clientUserId]
  }
}

// ── React.cache()-wrapped implementation ─────────────────────────────
// Deduplicates getTicketsList within the same request: if the server
// component renders multiple times (Suspense boundaries, streaming
// chunks, Strict Mode), this ensures only ONE actual SQL execution
// per unique set of filter arguments.
function _getTicketsListImpl(filtersKey: string): Promise<TicketListResult> {
  return cached(`getTicketsList::${filtersKey}`, async () => {
  recordActionExecution('getTicketsList')
  const filters: TicketListFilters | undefined = filtersKey ? JSON.parse(filtersKey) : undefined
  const t0 = performance.now()
  const currentUser = await getUser()
  const page = Math.max(1, filters?.page ?? 1)
  const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, filters?.limit ?? DEFAULT_LIST_LIMIT))
  const offset = (page - 1) * limit

  const conditions: any[] = []

  // Role-based filtering
  if (currentUser.role === 'client') {
    // Client Approver: org scope (own tickets + standard accounts of the same
    // client organization). Standard clients: their own tickets only.
    const orgIds = await getClientOrgUserIds(currentUser.id, (currentUser as any).userType ?? null)
    if (orgIds && orgIds.length > 1) {
      conditions.push(inArray(ticket.clientId, orgIds))
    } else {
      conditions.push(eq(ticket.clientId, currentUser.id))
    }
  } else if (currentUser.role === 'developer') {
    conditions.push(eq(ticket.assignedToId, currentUser.id))
  }

  // Filter by status
  if (filters?.status && filters.status !== 'all') {
    conditions.push(eq(ticket.status, filters.status))
  }

  // Filter by priority
  if (filters?.priority && filters.priority !== 'all') {
    conditions.push(eq(ticket.priority, filters.priority))
  }

  // Filter by project
  if (filters?.projectId) {
    conditions.push(eq(ticket.projectId, filters.projectId))
  }

  // Filter by module
  if (filters?.moduleId) {
    conditions.push(eq(ticket.moduleId, filters.moduleId))
  }

  // Filter by assigned developer (admin/manager only)
  if (filters?.assignedToId && currentUser.role !== 'developer') {
    conditions.push(eq(ticket.assignedToId, filters.assignedToId))
  }

  // Filter by client (admin/manager only)
  if (filters?.clientId && currentUser.role !== 'client') {
    conditions.push(eq(ticket.clientId, filters.clientId))
  }

  // Date range
  if (filters?.dateFrom) {
    conditions.push(gte(ticket.createdAt, new Date(filters.dateFrom)))
  }
  if (filters?.dateTo) {
    conditions.push(lte(ticket.createdAt, new Date(filters.dateTo)))
  }

  // Search — server-side text search on title + ticketNumber
  if (filters?.search) {
    const q = `%${filters.search}%`
    conditions.push(
      or(
        like(ticket.title, q),
        like(ticket.ticketNumber, q),
      ),
    )
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // Attachment count CTE
  const attachmentCounts = db.$with('attachment_counts').as(
    db.select({
      ticketId: attachment.ticketId,
      count: count().as('count'),
    }).from(attachment).groupBy(attachment.ticketId),
  )

  // User/project/module CTEs
  const clientUser = db.$with('client_user').as(
    db.select({ id: user.id, name: user.name }).from(user),
  )
  const assigneeUser = db.$with('assignee_user').as(
    db.select({ id: user.id, name: user.name }).from(user),
  )
  const projectRef = db.$with('project_ref').as(
    db.select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode }).from(project),
  )
  const moduleRef = db.$with('module_ref').as(
    db.select({ id: moduleTable.id, moduleName: moduleTable.moduleName }).from(moduleTable),
  )

  // Determine sort order
  let orderByClause
  switch (filters?.sortBy) {
    case 'oldest':
      orderByClause = asc(ticket.createdAt)
      break
    case 'priority':
      orderByClause = desc(sql`CASE ${ticket.priority}
        WHEN 'critical' THEN 5 WHEN 'urgent' THEN 4
        WHEN 'high' THEN 3 WHEN 'medium' THEN 2
        ELSE 1 END`)
      break
    case 'status':
      orderByClause = asc(ticket.status)
      break
    default:
      orderByClause = desc(ticket.createdAt)
  }

  // ── Single query with window function ────────────────────────────────
  // Previously used a separate COUNT query + Promise.all, which scanned the
  // ticket table TWICE (once for COUNT, once for data). Now uses COUNT(*) OVER()
  // window function: a SINGLE scan computes both the total count and the data.
  // This eliminates one full table scan entirely.
  const rows = await db
    .with(attachmentCounts, clientUser, assigneeUser, projectRef, moduleRef)
    .select({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      clientId: ticket.clientId,
      projectId: ticket.projectId,
      moduleId: ticket.moduleId,
      assignedToId: ticket.assignedToId,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      closedAt: ticket.closedAt,
      estimatedCompletionDate: ticket.estimatedCompletionDate,
      revisionCount: ticket.revisionCount,
      estimatedHours: ticket.estimatedHours,
      estimateStatus: sql<string | null>`CASE
        WHEN ${ticket.status} = 'estimate_pending' THEN 'pending'
        WHEN ${ticket.status} = 'estimate_approved' AND ${ticket.autoApproved} = true THEN 'auto_approved'
        WHEN ${ticket.status} = 'estimate_approved' THEN 'approved'
        ELSE NULL END`,
      clientName: clientUser.name,
      assignedToName: assigneeUser.name,
      projectName: projectRef.projectName,
      projectCode: projectRef.projectCode,
      moduleName: moduleRef.moduleName,
      attachmentCount: sql<number>`COALESCE(${attachmentCounts.count}, 0)::int`,
      totalCount: sql<number>`COUNT(*) OVER()::int`,
    })
    .from(ticket)
    .leftJoin(attachmentCounts, eq(ticket.id, attachmentCounts.ticketId))
    .leftJoin(clientUser, eq(ticket.clientId, clientUser.id))
    .leftJoin(assigneeUser, eq(ticket.assignedToId, assigneeUser.id))
    .leftJoin(projectRef, eq(ticket.projectId, projectRef.id))
    .leftJoin(moduleRef, eq(ticket.moduleId, moduleRef.id))
    .where(whereClause)
    .orderBy(orderByClause)
    .limit(limit)
    .offset(offset)

  const total = rows.length > 0 ? Number(rows[0].totalCount) : 0

  const t1 = performance.now()
  const elapsed = Math.round(t1 - t0)
  // Dev-only timing — gated behind DEBUG_PERF to reduce console noise
  if (process.env.NODE_ENV !== 'production' && process.env.DEBUG_PERF) {
    console.log(`  [Profiler] getTicketsList: ${elapsed}ms (target <400ms) | Queries: 1 | Scans: 1 ticket + 1 attachment`)
  }

  return {
    tickets: rows.map((r) => ({
      id: r.id,
      ticketNumber: r.ticketNumber,
      title: r.title,
      description: r.description,
      status: r.status as TicketStatus,
      priority: r.priority as TicketPriority,
      category: r.category,
      clientId: r.clientId,
      projectId: r.projectId,
      moduleId: r.moduleId,
      assignedToId: r.assignedToId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      closedAt: r.closedAt,
      estimatedCompletionDate: r.estimatedCompletionDate,
      revisionCount: r.revisionCount,
      estimatedHours: r.estimatedHours,
      estimateStatus: r.estimateStatus,
      clientName: r.clientName ?? undefined,
      assignedToName: r.assignedToName ?? undefined,
      projectName: r.projectName ?? undefined,
      projectCode: r.projectCode ?? undefined,
      moduleName: r.moduleName ?? undefined,
      attachmentCount: r.attachmentCount ?? 0,
      hasActiveTimer: false, // filled by caller if needed
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
})
}

/**
 * Public wrapper: delegates to the cached implementation.
 * wrapServerAction records profiler timing for each call,
 * but the actual implementation runs only ONCE per unique
 * filter set (deduplicated by React.cache()).
 *
 * NOTE: filters is stringified to a stable JSON key because
 * React.cache() uses WeakMap (reference equality) on the first
 * argument. Without stringification, each render pass creates a
 * new object literal → WeakMap miss → cache miss → SQL re-executes.
 */
export const getTicketsList = wrapServerAction('getTicketsList', async function getTicketsList(filters?: TicketListFilters): Promise<TicketListResult> {
  return _getTicketsListImpl(JSON.stringify(filters ?? null))
})

// ── Get Single Ticket by ID (optimized: specific columns + unstable_cache) ─

/** Internal implementation: fetch ticket data with specific columns only */
async function _getTicketByIdImpl(ticketId: number) {
  const [t] = await db
    .select({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      clientId: ticket.clientId,
      assignedToId: ticket.assignedToId,
      projectId: ticket.projectId,
      moduleId: ticket.moduleId,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      closedAt: ticket.closedAt,
      resolvedAt: ticket.resolvedAt,
      estimatedCompletionDate: ticket.estimatedCompletionDate,
      estimatedHours: ticket.estimatedHours,
      revisionCount: ticket.revisionCount,
      estimateNotes: ticket.estimateNotes,
      estimateSubmittedAt: ticket.estimateSubmittedAt,
      estimateApprovedAt: ticket.estimateApprovedAt,
      autoApproved: ticket.autoApproved,
      approvalDeadline: ticket.approvalDeadline,
      additionalHoursRequested: ticket.additionalHoursRequested,
      additionalHoursApproved: ticket.additionalHoursApproved,
    })
    .from(ticket)
    .where(eq(ticket.id, ticketId))
    .limit(1)

  if (!t) return null

  // Batch-fetch users, project, and module in parallel
  const userIds = [t.clientId, ...(t.assignedToId ? [t.assignedToId] : [])]
  const [users, projectResult, moduleResult] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(inArray(user.id, userIds)),
    t.projectId
      ? db
          .select({ projectName: project.projectName, projectCode: project.projectCode })
          .from(project)
          .where(eq(project.id, t.projectId))
          .limit(1)
      : Promise.resolve([]),
    t.moduleId
      ? db
          .select({ moduleName: moduleTable.moduleName })
          .from(moduleTable)
          .where(eq(moduleTable.id, t.moduleId))
          .limit(1)
      : Promise.resolve([]),
  ])

  const userMap = new Map(users.map((u) => [u.id, u]))
  const client = userMap.get(t.clientId)
  const assignedTo = t.assignedToId ? userMap.get(t.assignedToId) : null

  return {
    ...t,
    clientName: client?.name,
    clientEmail: client?.email,
    assignedToName: assignedTo?.name,
    projectName: projectResult[0]?.projectName,
    projectCode: projectResult[0]?.projectCode,
    moduleName: moduleResult[0]?.moduleName,
  }
}

const getCachedTicketById = unstable_cache(
  async (ticketId: number) => _getTicketByIdImpl(ticketId),
  undefined,
  { revalidate: 300, tags: ['ticket-by-id'] },
)

export const getTicketById = wrapServerAction('getTicketById', async function getTicketById(ticketId: number) {
  const currentUser = await getUser()

  const ticketData = await getCachedTicketById(ticketId)
  if (!ticketData) throw new Error('Ticket not found')

  // Permission check — runs every request (lightweight, can't cache)
  if (currentUser.role === 'client') {
    const orgIds = await getClientOrgUserIds(currentUser.id, (currentUser as any).userType ?? null)
    const allowed = orgIds ? orgIds.includes(ticketData.clientId) : ticketData.clientId === currentUser.id
    if (!allowed) {
      throw new Error('Access denied')
    }
  }
  if (currentUser.role === 'developer' && ticketData.assignedToId !== currentUser.id) {
    throw new Error('Access denied')
  }

  return ticketData
})

// ── Cached Lookup Data (rarely changes) ────────────────────────────────────
// Using React.cache() for per-request dedup + unstable_cache() for cross-request

const LOOKUP_CACHE_TTL = 300 // 5 minutes

const _fetchProjects = async function fetchProjects() {
  return db
    .select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode, clientId: project.clientId })
    .from(project)
    .where(eq(project.status, 'active'))
    .orderBy(asc(project.projectName))
}

const _fetchModules = async function fetchModules(projectId?: number) {
  const conditions = [eq(moduleTable.status, 'active')]
  if (projectId) conditions.push(eq(moduleTable.projectId, projectId))
  return db
    .select({ id: moduleTable.id, moduleName: moduleTable.moduleName, projectId: moduleTable.projectId })
    .from(moduleTable)
    .where(and(...conditions))
    .orderBy(asc(moduleTable.moduleName))
}

const _fetchDevelopers = async function fetchDevelopers() {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.role, 'developer'))
    .orderBy(asc(user.name))
}

const getCachedProjectsImpl = unstable_cache(
  async () => _fetchProjects(),
  ['lookup-projects'],
  { revalidate: LOOKUP_CACHE_TTL, tags: ['lookup-projects'] },
)

const getCachedModulesImpl = unstable_cache(
  async (projectId?: number) => _fetchModules(projectId),
  ['lookup-modules'],
  { revalidate: LOOKUP_CACHE_TTL, tags: ['lookup-modules'] },
)

const getCachedDevelopersImpl = unstable_cache(
  async () => _fetchDevelopers(),
  ['lookup-developers'],
  { revalidate: LOOKUP_CACHE_TTL, tags: ['lookup-developers'] },
)

export const getCachedProjects = wrapServerAction('getCachedProjects', async function getCachedProjects() {
  return getCachedProjectsImpl()
})

export const getCachedModules = wrapServerAction('getCachedModules', async function getCachedModules(projectId?: number) {
  return getCachedModulesImpl(projectId)
})

export const getCachedDevelopers = wrapServerAction('getCachedDevelopers', async function getCachedDevelopers() {
  return getCachedDevelopersImpl()
})

// ── Dashboard stats (single-pass FILTER query, zero redundant scans) ─────────
//
// Phase 3 Optimization:
// - Merged client approval stats into the main FILTER query (previously a
//   separate second query for clients). Now ALL stats come from ONE scan.
// - Removed duplicate FILTERs: awaitingApproval reuses pendingEstimates
//   value (both count status='estimate_pending').
// - Removed redundant getClientApprovalStats() function entirely.
// - single_query FILTERs (8) vs previously (10 FILTERs + 1 extra query for clients)
//
// Phase 6: Added unstable_cache (60s TTL) — ticket dashboard stats are queried
// on nearly every page load but only change on ticket mutations which already
// call revalidateTag('module-ticket-stats') and 'project-ticket-analytics'.
//
// Before: SQL on every request
// After:  60s cache hit for repeat visits, invalidated on ticket mutations
//
// Before: ~1700ms | Target: <300ms

/** Internal implementation: runs the FILTER query */
async function _getConsolidatedDashboardDataImpl(role: string, userId: string, userType: string | null = null) {
  // Build role-based filter
  const conditions: any[] = []
  if (role === 'client') {
    // Approver: org-wide counts (own + standard accounts of the same client).
    const orgIds = await getClientOrgUserIds(userId, userType)
    if (orgIds && orgIds.length > 1) {
      conditions.push(inArray(ticket.clientId, orgIds))
    } else {
      conditions.push(eq(ticket.clientId, userId))
    }
  } else if (role === 'developer') {
    conditions.push(eq(ticket.assignedToId, userId))
  }
  const baseFilter = conditions.length > 0 ? and(...conditions) : undefined

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // ── SINGLE query: 1 scan, 8 FILTERs ─────────────────────────────────
  const [result] = await db
    .select({
      total: count().mapWith(Number),
      open: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} IN ('new', 'manager_review'))::int`.mapWith(Number),
      inProgress: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} IN ('in_progress', 'estimate_pending'))::int`.mapWith(Number),
      resolved: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} IN ('resolved', 'client_review'))::int`.mapWith(Number),
      // Pending revision requests = tickets explicitly in 'request_for_revision'
      // (manager/admin-initiated) PLUS tickets with an active revision_history
      // record awaiting action (status 'pending' or 'pending_approval').
      // Client-initiated revisions keep the ticket in 'client_review' until a
      // manager approves, so counting tickets by status alone undercounts.
      revisions: sql<number>`COUNT(*) FILTER (
        WHERE ${ticket.status} = 'request_for_revision'
           OR EXISTS (
             SELECT 1 FROM ${revisionHistory}
             WHERE ${revisionHistory.ticketId} = ${ticket.id}
               AND ${revisionHistory.status} IN ('pending', 'pending_approval')
           )
      )::int`.mapWith(Number),
      pendingEstimates: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'estimate_pending')::int`.mapWith(Number),
      autoApprovedEstimates: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'estimate_approved' AND ${ticket.autoApproved} = true)::int`.mapWith(Number),
      approvedEstimates: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'estimate_approved' AND ${ticket.autoApproved} = false)::int`.mapWith(Number),
      recentlyApproved: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'estimate_approved' AND ${ticket.autoApproved} = false AND ${ticket.estimateApprovedAt} >= ${weekAgo})::int`.mapWith(Number),
      // R19: distinct KPI counters for the two revision-style states. Manager
      // rework = 'rework'; client-requested revision / rejected estimate =
      // 'request_for_revision'. Each card hides itself at zero.
      reworkCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'rework')::int`.mapWith(Number),
      revisionRequestedCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'request_for_revision')::int`.mapWith(Number),
      // R22: client Reports card counts — client-review (pending client approval)
      // and closed tickets, scoped to the logged-in client / approver org.
      closedCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'closed')::int`.mapWith(Number),
      clientReviewCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'client_review')::int`.mapWith(Number),
    })
    .from(ticket)
    .where(baseFilter)

  return {
    totalTickets: result.total,
    openTickets: result.open,
    inProgressTickets: result.inProgress,
    resolvedTickets: result.resolved,
    openRevisions: result.revisions,
    pendingRevisions: result.revisions,
    pendingEstimates: result.pendingEstimates,
    approvedEstimates: result.approvedEstimates,
    rejectedEstimates: result.revisions,
    autoApprovedEstimates: result.autoApprovedEstimates,
    awaitingApproval: role === 'client' ? result.pendingEstimates : 0,
    recentlyApproved: role === 'client' ? result.recentlyApproved : 0,
    reworkCount: result.reworkCount,
    revisionRequestedCount: result.revisionRequestedCount,
    closedCount: result.closedCount,
    clientReviewCount: result.clientReviewCount,
  }
}

const CONSOLIDATED_CACHE_TTL = 60

const getCachedConsolidatedData = unstable_cache(
  async (cacheKey: string) => {
    const { role, userId, userType } = JSON.parse(cacheKey)
    return _getConsolidatedDashboardDataImpl(role, userId, userType)
  },
  undefined,
  { revalidate: CONSOLIDATED_CACHE_TTL, tags: ['consolidated-dashboard-stats'] },
)

export const getConsolidatedDashboardData = wrapServerAction('getConsolidatedDashboardData', async function getConsolidatedDashboardData() {
  const { id: userId, role, userType } = await getUser()
  return getCachedConsolidatedData(JSON.stringify({ role, userId, userType }))
})

// Lightweight wrapper for pages that only need 4 basic stats
export const getDashboardStats = wrapServerAction('getDashboardStats', async function getDashboardStats() {
  const data = await getConsolidatedDashboardData()
  return {
    totalTickets: data.totalTickets, openTickets: data.openTickets,
    inProgressTickets: data.inProgressTickets, resolvedTickets: data.resolvedTickets,
  }
})

// ── Unassigned / Recent Unassigned ─────────────────────────────────────────

export const getUnassignedTickets = wrapServerAction('getUnassignedTickets', async function getUnassignedTickets() {
  const currentUser = await getUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }
  const ticketsData = await db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      description: ticket.description,
      status: ticket.status, priority: ticket.priority, category: ticket.category,
      clientId: ticket.clientId, projectId: ticket.projectId, moduleId: ticket.moduleId,
      assignedToId: ticket.assignedToId, assignedById: ticket.assignedById,
      assignedAt: ticket.assignedAt, resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt, revisionCount: ticket.revisionCount,
      createdAt: ticket.createdAt, updatedAt: ticket.updatedAt,
      estimatedHours: ticket.estimatedHours,
    })
    .from(ticket)
    .where(and(isNull(ticket.assignedToId), ne(ticket.status, 'closed')))
    .orderBy(desc(ticket.createdAt))

  if (ticketsData.length === 0) return []

  const userIds = [...new Set(ticketsData.map((t) => t.clientId))]
  const usersData = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, userIds))
  const userMap = new Map(usersData.map((u) => [u.id, u]))

  const projectIds = [...new Set(ticketsData.filter((t) => t.projectId).map((t) => t.projectId as number))]
  const moduleIds = [...new Set(ticketsData.filter((t) => t.moduleId).map((t) => t.moduleId as number))]
  const [projects, modules] = await Promise.all([
    projectIds.length > 0
      ? db.select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode }).from(project).where(inArray(project.id, projectIds))
      : Promise.resolve([]),
    moduleIds.length > 0
      ? db.select({ id: moduleTable.id, moduleName: moduleTable.moduleName }).from(moduleTable).where(inArray(moduleTable.id, moduleIds))
      : Promise.resolve([]),
  ])
  const projectMap = new Map(projects.map((p) => [p.id, p]))
  const moduleMap = new Map(modules.map((m) => [m.id, m]))

  return ticketsData.map((t) => {
    const client = userMap.get(t.clientId)
    const proj = t.projectId ? projectMap.get(t.projectId) : undefined
    const mod = t.moduleId ? moduleMap.get(t.moduleId) : undefined
    return {
      ...t,
      status: t.status as TicketStatus,
      priority: t.priority as TicketPriority,
      category: t.category as TicketCategory,
      clientName: client?.name, clientEmail: client?.email,
      projectName: proj?.projectName, projectCode: proj?.projectCode,
      moduleName: mod?.moduleName,
    }
  })
})

export const getRecentUnassignedTickets = wrapServerAction('getRecentUnassignedTickets', async function getRecentUnassignedTickets(limit: number = 10) {
  const currentUser = await getUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }
  const ticketsData = await db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      status: ticket.status, priority: ticket.priority, category: ticket.category,
      clientId: ticket.clientId, projectId: ticket.projectId, createdAt: ticket.createdAt,
    })
    .from(ticket)
    .where(and(isNull(ticket.assignedToId), ne(ticket.status, 'closed')))
    .orderBy(desc(ticket.createdAt))
    .limit(limit)

  if (ticketsData.length === 0) return []
  const userIds = [...new Set(ticketsData.map((t) => t.clientId))]
  const usersData = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds))
  const userMap = new Map(usersData.map((u) => [u.id, u]))

  return ticketsData.map((t) => ({
    ...t,
    status: t.status as TicketStatus,
    priority: t.priority as TicketPriority,
    category: t.category as TicketCategory,
    clientName: userMap.get(t.clientId)?.name,
  }))
})

// ── Current User (re-exported) ─────────────────────────────────────────────

export const getCurrentUser = wrapServerAction('getCurrentUser', async function getCurrentUser_action() {
  return getUser()
})

// ── Ticket History (paginated) ─────────────────────────────────────────────

/**
 * Verify the current user may read a ticket's data (same rules as getTicketById).
 */
async function assertCanViewTicket(currentUserId: string, role: string, userType: string | null, ticketId: number): Promise<void> {
  const [t] = await db
    .select({ clientId: ticket.clientId, assignedToId: ticket.assignedToId })
    .from(ticket)
    .where(eq(ticket.id, ticketId))
    .limit(1)
  if (!t) throw new Error('Ticket not found')
  if (role === 'client') {
    const orgIds = await getClientOrgUserIds(currentUserId, userType)
    const allowed = orgIds ? orgIds.includes(t.clientId) : t.clientId === currentUserId
    if (!allowed) throw new Error('Access denied')
  } else if (role === 'developer' && t.assignedToId !== currentUserId) {
    throw new Error('Access denied')
  }
}

export const getTicketHistory = wrapServerAction('getTicketHistory', async function getTicketHistory(ticketId: number, limit: number = 20, offset: number = 0) {
  const currentUser = await getUser()
  const role = currentUser.role
  await assertCanViewTicket(currentUser.id, role, (currentUser as any).userType ?? null, ticketId)

  const conditions = [eq(ticketHistory.ticketId, ticketId)]
  const isClient = role === 'client'
  if (isClient) {
    conditions.push(inArray(ticketHistory.action, [...CLIENT_VISIBLE_HISTORY_ACTIONS]))
  }

  const history = await db
    .select({
      id: ticketHistory.id, ticketId: ticketHistory.ticketId, userId: ticketHistory.userId,
      action: ticketHistory.action, oldValue: ticketHistory.oldValue,
      newValue: ticketHistory.newValue, createdAt: ticketHistory.createdAt,
      userName: user.name,
    })
    .from(ticketHistory)
    .leftJoin(user, eq(ticketHistory.userId, user.id))
    .where(and(...conditions))
    .orderBy(desc(ticketHistory.createdAt))
    .limit(limit)
    .offset(offset)

  return history.map((h) => {
    if (!isClient) return { ...h, userName: h.userName || 'Unknown' }
    // Client-safe: never expose internal employee names. Only the client's own
    // account keeps a display name; internal actors render as plain events.
    const isSelf = h.userId === currentUser.id
    return { ...h, userName: isSelf ? (h.userName || 'You') : '' }
  })
})

export const getTicketHistoryCount = wrapServerAction('getTicketHistoryCount', async function getTicketHistoryCount(ticketId: number) {
  const currentUser = await getUser()
  const role = currentUser.role
  await assertCanViewTicket(currentUser.id, role, (currentUser as any).userType ?? null, ticketId)

  const conditions = [eq(ticketHistory.ticketId, ticketId)]
  if (role === 'client') {
    conditions.push(inArray(ticketHistory.action, [...CLIENT_VISIBLE_HISTORY_ACTIONS]))
  }

  const [result] = await db
    .select({ count: count() })
    .from(ticketHistory)
    .where(and(...conditions))
  return Number(result?.count) || 0
})

// ── Backward-compat getTickets alias ───────────────────────────────────────

export const getTickets = wrapServerAction('getTickets', async function getTickets(oldFilters?: {
  status?: string
  priority?: string
  assignedToId?: string
  clientId?: string
  limit?: number
  offset?: number
}) {
  const result = await getTicketsList({
    status: oldFilters?.status,
    priority: oldFilters?.priority,
    assignedToId: oldFilters?.assignedToId,
    clientId: oldFilters?.clientId,
    limit: oldFilters?.limit ?? 50,
    page: oldFilters?.offset ? Math.floor(oldFilters.offset / (oldFilters.limit ?? 50)) + 1 : 1,
  })
  return result.tickets as any
})
