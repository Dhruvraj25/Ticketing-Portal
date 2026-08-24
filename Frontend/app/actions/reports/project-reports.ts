// @ts-nocheck
'use server'

import { db } from '@/lib/db'
import { ticket, project, user, module as moduleTable } from '@/lib/db/schema'
import { and, eq, desc, count, inArray, isNotNull } from 'drizzle-orm'
import { TicketStatus } from '@/lib/types'
import type { ReportFilters, ReportResult } from './types'
import { getDateRange } from './types'
import type { CurrentUser } from './queries'

// ─── Report: Project Summary ─────────────────────────────────────────────
export async function getProjectSummaryReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const conditions: any[] = []
  if (filters.clientId) conditions.push(eq(project.clientId, filters.clientId))
  if (currentUser.role === 'client') conditions.push(eq(project.clientId, currentUser.id))

  const projects = await db
    .select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode, status: project.status })
    .from(project)
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  const projectIds = projects.map(p => p.id)
  const ticketCounts = projectIds.length > 0
    ? await db.select({ projectId: ticket.projectId, count: count() }).from(ticket).where(inArray(ticket.projectId, projectIds)).groupBy(ticket.projectId)
    : []
  const countMap = new Map(ticketCounts.map(r => [Number(r.projectId), Number(r.count) || 0]))

  const withCounts = projects.map(p => ({
    projectName: p.projectName, projectCode: p.projectCode, status: p.status, ticketCount: countMap.get(p.id) || 0,
  }))

  return {
    meta: {
      totalRecords: withCounts.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: { 'Total Projects': withCounts.length, 'Total Tickets': withCounts.reduce((s, p) => s + p.ticketCount, 0) },
    },
    columns: [
      { key: 'projectName', label: 'Project', type: 'text' },
      { key: 'projectCode', label: 'Code', type: 'text' },
      { key: 'status', label: 'Status', type: 'badge' },
      { key: 'ticketCount', label: 'Tickets', type: 'number' },
    ],
    data: withCounts.map(p => ({ projectName: p.projectName, projectCode: p.projectCode, status: p.status, ticketCount: p.ticketCount })),
    charts: [{
      type: 'pie' as const,
      title: 'Projects by Status',
      data: (() => {
        const counts: Record<string, number> = {}
        for (const p of withCounts) { counts[p.status] = (counts[p.status] || 0) + 1 }
        return Object.entries(counts).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
      })(),
    }],
  }
}

// ─── Report: Project Progress ────────────────────────────────────────────
export async function getProjectProgressReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const conditions: any[] = [eq(project.status, 'active')]
  if (currentUser.role === 'client') conditions.push(eq(project.clientId, currentUser.id))
  if (filters.clientId) conditions.push(eq(project.clientId, filters.clientId))

  const projects = await db
    .select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode })
    .from(project)
    .where(and(...conditions))

  const projectIds = projects.map(p => p.id)
  const ticketStatuses = projectIds.length > 0
    ? await db.select({ projectId: ticket.projectId, status: ticket.status, count: count() }).from(ticket).where(inArray(ticket.projectId, projectIds)).groupBy(ticket.projectId, ticket.status)
    : []

  const progressMap = new Map<number, { total: number; closed: number }>()
  for (const row of ticketStatuses) {
    if (row.projectId === null) continue
    const pid = Number(row.projectId)
    if (!progressMap.has(pid)) progressMap.set(pid, { total: 0, closed: 0 })
    const entry = progressMap.get(pid)!
    const cnt = Number(row.count) || 0
    entry.total += cnt
    if (row.status === TicketStatus.CLOSED) entry.closed += cnt
  }

  const withProgress = projects.map(p => {
    const stats = progressMap.get(p.id) || { total: 0, closed: 0 }
    return { projectName: p.projectName, projectCode: p.projectCode, totalTickets: stats.total, closedTickets: stats.closed, progressPct: stats.total > 0 ? Math.round((stats.closed / stats.total) * 100) : 0 }
  })

  return {
    meta: { totalRecords: withProgress.length, generatedAt: new Date().toISOString(), appliedFilters: ['Active projects'], summary: { 'Active Projects': withProgress.length, 'Avg Progress': `${Math.round(withProgress.reduce((s, p) => s + p.progressPct, 0) / (withProgress.length || 1))}%` } },
    columns: [
      { key: 'projectName', label: 'Project', type: 'text' },
      { key: 'projectCode', label: 'Code', type: 'text' },
      { key: 'totalTickets', label: 'Total Tickets', type: 'number' },
      { key: 'closedTickets', label: 'Closed', type: 'number' },
      { key: 'progressPct', label: 'Progress %', type: 'number' },
    ],
    data: withProgress,
    charts: [{ type: 'bar' as const, title: 'Project Progress', data: withProgress.map(p => ({ name: p.projectCode, value: p.progressPct })) }],
  }
}

// ─── Report: Module Report ───────────────────────────────────────────────
export async function getModuleReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const conditions: any[] = []
  if (filters.projectId) conditions.push(eq(moduleTable.projectId, filters.projectId))

  const modules = await db
    .select({ id: moduleTable.id, moduleName: moduleTable.moduleName, projectId: moduleTable.projectId, status: moduleTable.status })
    .from(moduleTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  const moduleIds = modules.map(m => m.id)
  const ticketData = moduleIds.length > 0
    ? await db.select({ moduleId: ticket.moduleId, status: ticket.status, count: count() }).from(ticket).where(inArray(ticket.moduleId, moduleIds)).groupBy(ticket.moduleId, ticket.status)
    : []

  const statsMap = new Map<number, { total: number; closed: number }>()
  for (const row of ticketData) {
    if (row.moduleId === null) continue
    const mid = Number(row.moduleId)
    if (!statsMap.has(mid)) statsMap.set(mid, { total: 0, closed: 0 })
    const entry = statsMap.get(mid)!
    const cnt = Number(row.count) || 0
    entry.total += cnt
    if (row.status === TicketStatus.CLOSED) entry.closed += cnt
  }

  const withStats = modules.map(m => {
    const stats = statsMap.get(m.id) || { total: 0, closed: 0 }
    return { moduleName: m.moduleName, projectId: m.projectId, status: m.status, ticketCount: stats.total, closedCount: stats.closed }
  })

  return {
    meta: { totalRecords: withStats.length, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { 'Total Modules': withStats.length, 'Total Tickets': withStats.reduce((s, m) => s + m.ticketCount, 0) } },
    columns: [
      { key: 'moduleName', label: 'Module', type: 'text' },
      { key: 'status', label: 'Status', type: 'badge' },
      { key: 'ticketCount', label: 'Tickets', type: 'number' },
      { key: 'closedCount', label: 'Closed', type: 'number' },
    ],
    data: withStats,
  }
}

// ─── Report: Client Project ──────────────────────────────────────────────
export async function getClientProjectReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  let clientIds: string[] | undefined
  if (currentUser.role === 'client') clientIds = [currentUser.id]
  else if (filters.clientId) clientIds = [filters.clientId]

  const clientsQuery = clientIds
    ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(and(eq(user.role, 'client'), inArray(user.id, clientIds)))
    : await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.role, 'client'))

  const clientIdList = clientsQuery.map(c => c.id)
  const allProjects = clientIdList.length > 0
    ? await db.select({ clientId: project.clientId, projectId: project.id, count: count() }).from(project).leftJoin(ticket, eq(ticket.projectId, project.id)).where(inArray(project.clientId, clientIdList)).groupBy(project.clientId, project.id)
    : []

  const projectCountMap = new Map<string, number>()
  const ticketCountMap = new Map<string, number>()
  for (const row of allProjects) {
    projectCountMap.set(row.clientId, (projectCountMap.get(row.clientId) || 0) + 1)
    ticketCountMap.set(row.clientId, (ticketCountMap.get(row.clientId) || 0) + Number(row.count))
  }

  const withProjects = clientsQuery.map(c => ({
    clientName: c.name, clientEmail: c.email, projectCount: projectCountMap.get(c.id) || 0, ticketCount: ticketCountMap.get(c.id) || 0,
  }))

  return {
    meta: { totalRecords: withProjects.length, generatedAt: new Date().toISOString(), appliedFilters: [], summary: { Clients: withProjects.length, 'Total Projects': withProjects.reduce((s, c) => s + c.projectCount, 0) } },
    columns: [
      { key: 'clientName', label: 'Client', type: 'text' },
      { key: 'clientEmail', label: 'Email', type: 'text' },
      { key: 'projectCount', label: 'Projects', type: 'number' },
      { key: 'ticketCount', label: 'Tickets', type: 'number' },
    ],
    data: withProjects,
    charts: [{ type: 'bar' as const, title: 'Projects per Client', data: withProjects.map(c => ({ name: c.clientName, value: c.projectCount })) }],
  }
}
