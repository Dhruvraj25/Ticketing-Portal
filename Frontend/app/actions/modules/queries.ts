'use server'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { module as moduleTable, project, ticket, projectDeveloper } from '@/lib/db/schema'
import { and, eq, desc, asc, count, inArray, isNotNull, sql, like, or } from 'drizzle-orm'
import { TicketStatus } from '@/lib/types'
import type { ModuleStatus } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'
import { MODULE_CACHE_TTL, MODULE_LIST_CACHE_TTL } from './cache'

// ============================================================================
// TYPES
// ============================================================================

export interface ModuleListFilters {
  page?: number
  limit?: number
  search?: string
  projectId?: number
  status?: string
  sortBy?: 'name' | 'created' | 'tickets'
  sortOrder?: 'asc' | 'desc'
}

export interface ModuleListItem {
  id: number
  projectId: number
  moduleName: string
  description: string | null
  status: ModuleStatus
  createdAt: Date
  updatedAt: Date
  projectName?: string
  projectCode?: string
  ticketCount: number
}

export interface ModuleListResult {
  modules: ModuleListItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ModuleTicketStats {
  moduleId: number
  total: number
  open: number
  inProgress: number
  resolved: number
  closed: number
}

// ============================================================================
// PAGINATED MODULE LIST — server-side filtering, searching, sorting, pagination
// ============================================================================

/** Internal implementation: accepts role + userId instead of calling getCurrentUser() */
async function _getModulesImpl(filters: ModuleListFilters | undefined, role: string, userId: string) {
  const page = Math.max(1, filters?.page || 1)
  const limit = Math.min(100, Math.max(1, filters?.limit || 50))
  const offset = (page - 1) * limit
  const sortBy = filters?.sortBy || 'created'
  const sortOrder = filters?.sortOrder || 'desc'

  // Build WHERE conditions
  const conditions: any[] = []

  // Filter by project
  if (filters?.projectId) {
    conditions.push(eq(moduleTable.projectId, filters.projectId))
  }

  // Status filter
  if (filters?.status && filters.status !== 'all') {
    conditions.push(eq(moduleTable.status, filters.status))
  }

  // Search filter — SQL LIKE on name, description, and project name
  if (filters?.search) {
    const q = `%${filters.search.toLowerCase()}%`
    conditions.push(
      sql`(LOWER(${moduleTable.moduleName}) LIKE ${q} OR LOWER(COALESCE(${moduleTable.description}, '')) LIKE ${q})`,
    )
  }

  // Role-based access
  if (role === 'client') {
    const userProjects = db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.clientId, userId))
    conditions.push(inArray(moduleTable.projectId, userProjects))
  } else if (role === 'project_manager') {
    const userProjects = db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.managerId, userId))
    conditions.push(inArray(moduleTable.projectId, userProjects))
  } else if (role === 'developer') {
    // Run both permission queries in parallel
    const [devAssignments, ticketAssignments] = await Promise.all([
      db
        .select({ projectId: projectDeveloper.projectId })
        .from(projectDeveloper)
        .where(eq(projectDeveloper.userId, userId)),
      db
        .select({ projectId: ticket.projectId })
        .from(ticket)
        .where(and(eq(ticket.assignedToId, userId), isNotNull(ticket.projectId))),
    ])

    const combinedIds = [...new Set([
      ...devAssignments.map((r) => r.projectId),
      ...ticketAssignments.map((r) => r.projectId).filter((id): id is number => id !== null),
    ])]

    if (combinedIds.length === 0) {
      conditions.push(eq(moduleTable.projectId, -1))
    } else {
      conditions.push(inArray(moduleTable.projectId, combinedIds))
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // Determine sort column
  let orderBy: any
  switch (sortBy) {
    case 'name':
      orderBy = sortOrder === 'asc' ? asc(moduleTable.moduleName) : desc(moduleTable.moduleName)
      break
    case 'created':
    default:
      orderBy = sortOrder === 'asc' ? asc(moduleTable.createdAt) : desc(moduleTable.createdAt)
      break
  }

  // OPTIMIZATION (Bottleneck 3): Replaced separate COUNT(*) + SELECT with
  // a single query using COUNT(*) OVER() window function.
  // Before: COUNT(*) scan → data scan = 2 table scans
  // After:  Single scan with COUNT(*) OVER() provides both total count and data
  // Expected: ~50-100ms → <30ms

  // Fetch paginated modules with project info + total count via window function
  const rows = await db
    .select({
      id: moduleTable.id,
      projectId: moduleTable.projectId,
      moduleName: moduleTable.moduleName,
      description: moduleTable.description,
      status: moduleTable.status,
      createdAt: moduleTable.createdAt,
      updatedAt: moduleTable.updatedAt,
      projectName: project.projectName,
      projectCode: project.projectCode,
      totalCount: sql<number>`COUNT(*) OVER()::int`,
    })
    .from(moduleTable)
    .leftJoin(project, eq(moduleTable.projectId, project.id))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)

  const total = rows.length > 0 ? rows[0].totalCount : 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  // Batch-fetch ticket counts in a single GROUP BY query
  const moduleIds = rows.map((r) => r.id)
  const ticketCounts = moduleIds.length > 0
    ? await db
        .select({ moduleId: ticket.moduleId, count: count() })
        .from(ticket)
        .where(inArray(ticket.moduleId, moduleIds))
        .groupBy(ticket.moduleId)
    : ([] as { moduleId: number | null; count: number }[])

  const ticketCountMap = new Map(
    ticketCounts
      .filter((r) => r.moduleId !== null)
      .map((r) => [r.moduleId as number, Number(r.count) || 0]),
  )

  const modules = rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    moduleName: r.moduleName,
    description: r.description,
    status: r.status as ModuleStatus,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    projectName: r.projectName ?? undefined,
    projectCode: r.projectCode ?? undefined,
    ticketCount: ticketCountMap.get(r.id) || 0,
  }))

  return { modules, total, page, limit, totalPages }
}

const getCachedModules = unstable_cache(
  async (cacheKey: string) => {
    const parsed = JSON.parse(cacheKey) as { filters: ModuleListFilters | null; role: string; userId: string }
    return _getModulesImpl(parsed.filters ?? undefined, parsed.role, parsed.userId)
  },
  undefined,
  { revalidate: MODULE_LIST_CACHE_TTL, tags: ['module-list'] },
)

export const getModules = wrapServerAction('getModules', async function getModules(filters?: ModuleListFilters) {
  const { id: userId, role } = await getCurrentUser()
  const cacheKey = JSON.stringify({ filters: filters ?? null, role, userId })
  return getCachedModules(cacheKey)
})

// ============================================================================
// GET MODULE BY ID — cached with unstable_cache (60s TTL)
// ============================================================================

/** Internal implementation: fetch module by ID */
async function _getModuleByIdImpl(moduleId: number) {
  const [row] = await db
    .select({
      id: moduleTable.id,
      projectId: moduleTable.projectId,
      moduleName: moduleTable.moduleName,
      description: moduleTable.description,
      status: moduleTable.status,
      createdAt: moduleTable.createdAt,
      updatedAt: moduleTable.updatedAt,
      projectName: project.projectName,
      projectCode: project.projectCode,
      ticketCount: count(ticket.id),
    })
    .from(moduleTable)
    .leftJoin(project, eq(moduleTable.projectId, project.id))
    .leftJoin(ticket, eq(ticket.moduleId, moduleTable.id))
    .where(eq(moduleTable.id, moduleId))
    .groupBy(moduleTable.id, project.id)
    .limit(1)

  if (!row) return null

  return {
    id: row.id,
    projectId: row.projectId,
    moduleName: row.moduleName,
    description: row.description,
    status: row.status as ModuleStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    projectName: row.projectName ?? undefined,
    projectCode: row.projectCode ?? undefined,
    ticketCount: Number(row.ticketCount) || 0,
  }
}

const getCachedModuleById = unstable_cache(
  async (moduleId: number) => _getModuleByIdImpl(moduleId),
  undefined,
  { revalidate: MODULE_CACHE_TTL, tags: ['module-by-id'] },
)

export const getModuleById = wrapServerAction('getModuleById', async function getModuleById(moduleId: number) {
  const currentUser = await getCurrentUser()

  const moduleData = await getCachedModuleById(moduleId)
  if (!moduleData) throw new Error('Module not found')

  // Role-based access control — mirrors the modules-list and getProjectById
  // permissions. Admin sees everything; a Project Manager may only view
  // modules of projects they manage; Client/Developer are never authorized
  // for module data (manual URL navigation cannot bypass this).
  if (currentUser.role === 'project_manager') {
    const [p] = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, moduleData.projectId), eq(project.managerId, currentUser.id)))
      .limit(1)
    if (!p) throw new Error('Access denied')
  } else if (currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }

  return moduleData
})
// ============================================================================
// BATCH-FETCH MODULES BY PROJECT IDS — cached (60s TTL)
// ============================================================================

/** Internal implementation: fetch modules for a set of project IDs */
async function _getModulesByProjectIdsImpl(projectIds: number[], role: string, userId: string) {
  const conditions = [inArray(moduleTable.projectId, projectIds)]

  // Role-based access
  if (role === 'client') {
    const userProjects = db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.clientId, userId))
    conditions.push(inArray(moduleTable.projectId, userProjects))
  } else if (role === 'developer') {
    const [devAssignments, ticketAssignments] = await Promise.all([
      db
        .select({ projectId: projectDeveloper.projectId })
        .from(projectDeveloper)
        .where(eq(projectDeveloper.userId, userId)),
      db
        .select({ projectId: ticket.projectId })
        .from(ticket)
        .where(and(eq(ticket.assignedToId, userId), isNotNull(ticket.projectId))),
    ])

    const combinedIds = [...new Set([
      ...devAssignments.map((r) => r.projectId),
      ...ticketAssignments.map((r) => r.projectId).filter((id): id is number => id !== null),
    ])]

    if (combinedIds.length === 0) {
      conditions.push(eq(moduleTable.projectId, -1))
    } else {
      conditions.push(inArray(moduleTable.projectId, combinedIds))
    }
  }

  const rows = await db
    .select({
      id: moduleTable.id,
      projectId: moduleTable.projectId,
      moduleName: moduleTable.moduleName,
      description: moduleTable.description,
      status: moduleTable.status,
      createdAt: moduleTable.createdAt,
      updatedAt: moduleTable.updatedAt,
      projectName: project.projectName,
      projectCode: project.projectCode,
    })
    .from(moduleTable)
    .leftJoin(project, eq(moduleTable.projectId, project.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(moduleTable.createdAt))

  // Batch-fetch ticket counts
  const moduleIds = rows.map((r) => r.id)
  const ticketCounts = moduleIds.length > 0
    ? await db
        .select({ moduleId: ticket.moduleId, count: count() })
        .from(ticket)
        .where(inArray(ticket.moduleId, moduleIds))
        .groupBy(ticket.moduleId)
    : []

  const ticketCountMap = new Map(
    ticketCounts
      .filter((r) => r.moduleId !== null)
      .map((r) => [r.moduleId as number, Number(r.count) || 0]),
  )

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    moduleName: r.moduleName,
    description: r.description,
    status: r.status as ModuleStatus,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    projectName: r.projectName ?? undefined,
    projectCode: r.projectCode ?? undefined,
    ticketCount: ticketCountMap.get(r.id) || 0,
  }))
}

const getCachedModulesByProjectIds = unstable_cache(
  async (cacheKey: string) => {
    const parsed = JSON.parse(cacheKey) as { projectIds: number[]; role: string; userId: string }
    return _getModulesByProjectIdsImpl(parsed.projectIds, parsed.role, parsed.userId)
  },
  undefined,
  { revalidate: MODULE_CACHE_TTL, tags: ['modules-by-project-ids'] },
)

export const getModulesByProjectIds = wrapServerAction('getModulesByProjectIds', async function getModulesByProjectIds(projectIds: number[]) {
  if (projectIds.length === 0) return []
  const { id: userId, role } = await getCurrentUser()
  const cacheKey = JSON.stringify({ projectIds: [...projectIds].sort((a, b) => a - b), role, userId })
  return getCachedModulesByProjectIds(cacheKey)
})

// ============================================================================
// GET MODULES BY PROJECT (cached for project detail page)
// ============================================================================

const _getModulesByProjectImpl = cache(async function getModulesByProjectImpl(projectId: number) {
  const rows = await db
    .select({
      id: moduleTable.id,
      projectId: moduleTable.projectId,
      moduleName: moduleTable.moduleName,
      description: moduleTable.description,
      status: moduleTable.status,
      createdAt: moduleTable.createdAt,
      updatedAt: moduleTable.updatedAt,
    })
    .from(moduleTable)
    .where(eq(moduleTable.projectId, projectId))
    .orderBy(desc(moduleTable.createdAt))

  const moduleIds = rows.map((r) => r.id)
  const ticketCounts = moduleIds.length > 0
    ? await db
        .select({ moduleId: ticket.moduleId, count: count() })
        .from(ticket)
        .where(inArray(ticket.moduleId, moduleIds))
        .groupBy(ticket.moduleId)
    : []

  const ticketCountMap = new Map(
    ticketCounts
      .filter((r) => r.moduleId !== null)
      .map((r) => [r.moduleId as number, Number(r.count) || 0]),
  )

  return rows.map((r) => ({
    ...r,
    status: r.status as ModuleStatus,
    ticketCount: ticketCountMap.get(r.id) || 0,
  }))
})

const getCachedModulesByProject = unstable_cache(
  async (projectId: number) => {
    return _getModulesByProjectImpl(projectId)
  },
  undefined,
  { revalidate: MODULE_CACHE_TTL, tags: ['modules-by-project'] },
)

export const getModulesByProject = wrapServerAction('getModulesByProject', async function getModulesByProject(projectId: number) {
  const currentUser = await getCurrentUser()

  // Access check
  if (currentUser.role === 'client') {
    const [p] = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, projectId), eq(project.clientId, currentUser.id)))
      .limit(1)
    if (!p) throw new Error('Access denied')
  } else if (currentUser.role === 'developer') {
    const [devAccess] = await db
      .select({ count: count() })
      .from(projectDeveloper)
      .where(and(eq(projectDeveloper.projectId, projectId), eq(projectDeveloper.userId, currentUser.id)))
      .limit(1)

    const [ticketAccess] = await db
      .select({ count: count() })
      .from(ticket)
      .where(and(eq(ticket.projectId, projectId), eq(ticket.assignedToId, currentUser.id)))
      .limit(1)

    if (Number(devAccess?.count) === 0 && Number(ticketAccess?.count) === 0) {
      throw new Error('Access denied')
    }
  }

  // Get project info
  const [p] = await db
    .select({ projectName: project.projectName, projectCode: project.projectCode })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  const modules = await getCachedModulesByProject(projectId)

  return modules.map((m: any) => ({
    ...m,
    projectName: p?.projectName,
    projectCode: p?.projectCode,
  }))
})

// ============================================================================
// MODULE TICKET STATS — batch status aggregation across modules (cached 60s TTL)
// ============================================================================

async function _getModulesTicketStatsImpl(moduleIds: number[]): Promise<ModuleTicketStats[]> {
  if (moduleIds.length === 0) return []

  const openStatuses: string[] = ['new', 'manager_review', 'assigned']
  const inProgressStatuses: string[] = ['in_progress', 'estimate_pending', 'estimate_approved']
  const resolvedStatuses: string[] = ['resolved', 'client_review']
  const closedStatuses: string[] = ['closed']

  const rows = await db
    .select({
      moduleId: ticket.moduleId,
      status: ticket.status,
      count: count(),
    })
    .from(ticket)
    .where(inArray(ticket.moduleId, moduleIds))
    .groupBy(ticket.moduleId, ticket.status)

  // Initialize stats for all requested module IDs
  const statsMap = new Map<number, ModuleTicketStats>()
  for (const moduleId of moduleIds) {
    statsMap.set(moduleId, {
      moduleId,
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0,
    })
  }

  for (const row of rows) {
    if (row.moduleId === null) continue
    const stat = statsMap.get(row.moduleId)
    if (!stat) continue
    const cnt = Number(row.count) || 0
    stat.total += cnt

    if (openStatuses.includes(row.status)) stat.open += cnt
    else if (inProgressStatuses.includes(row.status)) stat.inProgress += cnt
    else if (resolvedStatuses.includes(row.status)) stat.resolved += cnt
    else if (closedStatuses.includes(row.status)) stat.closed += cnt
  }

  return Array.from(statsMap.values())
}

const getCachedModulesTicketStats = unstable_cache(
  async (cacheKey: string) => {
    const moduleIds = JSON.parse(cacheKey) as number[]
    return _getModulesTicketStatsImpl(moduleIds)
  },
  undefined,
  { revalidate: MODULE_CACHE_TTL, tags: ['module-ticket-stats'] },
)

export const getModulesTicketStats = wrapServerAction('getModulesTicketStats', async function getModulesTicketStats(moduleIds: number[]): Promise<ModuleTicketStats[]> {
  if (moduleIds.length === 0) return []
  const cacheKey = JSON.stringify([...moduleIds].sort((a, b) => a - b))
  return getCachedModulesTicketStats(cacheKey)
})
