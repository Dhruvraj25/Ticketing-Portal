// @ts-nocheck
'use server'

import { db } from '@/lib/db'
import { timeLog, ticket, user } from '@/lib/db/schema'
import { and, eq, desc, count, inArray, gte, lte, sum, isNotNull, ne } from 'drizzle-orm'
import { TicketStatus } from '@/lib/types'
import type { ReportFilters, ReportResult } from './types'
import { getDateRange } from './types'
import type { CurrentUser } from './queries'

// ─── Report: Developer Productivity ──────────────────────────────────────
export async function getDeveloperProductivityReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)

  let developers = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.role, 'developer'))

  if (filters.developerId) developers = developers.filter(d => d.id === filters.developerId)
  if (developers.length === 0) {
    return { meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: [], summary: {} }, columns: [], data: [] }
  }

  const devIds = developers.map(d => d.id)

  // OPTIMIZATION: 3 queries run in parallel via Promise.all.
  // Each is a targeted index-only scan on (userId/assignedToId).
  // Merging them into 1 query with a RIGHT JOIN + FILTERs is risky
  // due to differing table schemas (timeLog vs ticket).
  // Keeping 3 parallel queries maximizes cache locality.
  const [timeResults, assignedResults, resolvedResults] = await Promise.all([
    db.select({ userId: timeLog.userId, total: sum(timeLog.durationMinutes) })
      .from(timeLog)
      .where(and(inArray(timeLog.userId, devIds), gte(timeLog.startTime, since), lte(timeLog.startTime, until), isNotNull(timeLog.endTime)))
      .groupBy(timeLog.userId),
    db.select({ assignedToId: ticket.assignedToId, count: count() })
      .from(ticket)
      .where(and(inArray(ticket.assignedToId, devIds), gte(ticket.createdAt, since)))
      .groupBy(ticket.assignedToId),
    db.select({ assignedToId: ticket.assignedToId, count: count() })
      .from(ticket)
      .where(and(inArray(ticket.assignedToId, devIds), eq(ticket.status, TicketStatus.CLOSED), gte(ticket.createdAt, since)))
      .groupBy(ticket.assignedToId),
  ])

  const timeMap = new Map(timeResults.map(r => [r.userId, Number(r.total) || 0]))
  const assignedMap = new Map(assignedResults.map(r => [r.assignedToId, Number(r.count) || 0]))
  const resolvedMap = new Map(resolvedResults.map(r => [r.assignedToId, Number(r.count) || 0]))

  const stats = developers.map(dev => {
    const totalMinutes = timeMap.get(dev.id) || 0
    const ticketsAssigned = assignedMap.get(dev.id) || 0
    const ticketsResolved = resolvedMap.get(dev.id) || 0
    return {
      name: dev.name,
      email: dev.email,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      ticketsAssigned,
      ticketsResolved,
      avgHoursPerTicket: ticketsAssigned > 0 ? Math.round((totalMinutes / 60) / ticketsAssigned * 10) / 10 : 0,
    }
  })

  const totalHours = stats.reduce((s, d) => s + d.totalHours, 0)
  const totalResolved = stats.reduce((s, d) => s + d.ticketsResolved, 0)

  return {
    meta: {
      totalRecords: stats.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: { 'Developers': stats.length, 'Total Hours': `${totalHours}h`, 'Total Resolved': totalResolved },
    },
    columns: [
      { key: 'name', label: 'Developer', type: 'text' },
      { key: 'totalHours', label: 'Hours Logged', type: 'number' },
      { key: 'ticketsAssigned', label: 'Assigned', type: 'number' },
      { key: 'ticketsResolved', label: 'Resolved', type: 'number' },
      { key: 'avgHoursPerTicket', label: 'Avg Hours/Ticket', type: 'number' },
    ],
    data: stats,
    charts: [
      { type: 'bar' as const, title: 'Hours per Developer', data: stats.map(d => ({ name: d.name, value: d.totalHours })) },
      { type: 'bar' as const, title: 'Tickets Resolved', data: stats.map(d => ({ name: d.name, value: d.ticketsResolved })) },
    ],
  }
}

// ─── Report: Developer Workload ──────────────────────────────────────────
export async function getDeveloperWorkloadReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  let developers = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.role, 'developer'))

  if (filters.developerId) developers = developers.filter(d => d.id === filters.developerId)
  if (developers.length === 0) {
    return { meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: ['Current workload'], summary: {} }, columns: [], data: [] }
  }

  const devIds = developers.map(d => d.id)
  const ticketCounts = await db
    .select({ assignedToId: ticket.assignedToId, status: ticket.status, count: count() })
    .from(ticket)
    .where(and(inArray(ticket.assignedToId, devIds), ne(ticket.status, TicketStatus.CLOSED)))
    .groupBy(ticket.assignedToId, ticket.status)

  const activeMap = new Map<string, number>()
  const openMap = new Map<string, number>()
  const inProgressMap = new Map<string, number>()

  for (const row of ticketCounts) {
    if (!row.assignedToId) continue
    const c = Number(row.count) || 0
    activeMap.set(row.assignedToId, (activeMap.get(row.assignedToId) || 0) + c)
    if (row.status === TicketStatus.NEW || row.status === TicketStatus.MANAGER_REVIEW) openMap.set(row.assignedToId, c)
    if (row.status === TicketStatus.IN_PROGRESS) inProgressMap.set(row.assignedToId, c)
  }

  const stats = developers.map(dev => ({
    name: dev.name,
    activeTickets: activeMap.get(dev.id) || 0,
    openTickets: openMap.get(dev.id) || 0,
    inProgressTickets: inProgressMap.get(dev.id) || 0,
  }))

  return {
    meta: {
      totalRecords: stats.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: ['Current workload'],
      summary: { 'Developers': stats.length, 'Active Tickets': stats.reduce((s, d) => s + d.activeTickets, 0) },
    },
    columns: [
      { key: 'name', label: 'Developer', type: 'text' },
      { key: 'activeTickets', label: 'Active Tickets', type: 'number' },
      { key: 'openTickets', label: 'Open', type: 'number' },
      { key: 'inProgressTickets', label: 'In Progress', type: 'number' },
    ],
    data: stats,
    charts: [{ type: 'bar' as const, title: 'Developer Workload', data: stats.map(d => ({ name: d.name, value: d.activeTickets })) }],
  }
}

// ─── Report: Worklog (optimized with LEFT JOINs) ─────────────────────────
export async function getWorklogReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions: any[] = [gte(timeLog.startTime, since), lte(timeLog.startTime, until), isNotNull(timeLog.endTime)]
  if (filters.developerId) conditions.push(eq(timeLog.userId, filters.developerId))

  // OPTIMIZATION: Use LEFT JOINs instead of 3 separate queries (timeLog + user + ticket).
  // Before: 1 x timeLog query + 1 x user query + 1 x ticket query = 3 queries + JS enrichment
  // After:  1 x timeLog query with JOINs = 1 query
  const logs = await db
    .select({
      id: timeLog.id, userId: timeLog.userId, ticketId: timeLog.ticketId,
      description: timeLog.description, startTime: timeLog.startTime,
      endTime: timeLog.endTime, durationMinutes: timeLog.durationMinutes,
      isBillable: timeLog.isBillable,
      userName: user.name,
      ticketNumber: ticket.ticketNumber,
    })
    .from(timeLog)
    .leftJoin(user, eq(timeLog.userId, user.id))
    .leftJoin(ticket, eq(timeLog.ticketId, ticket.id))
    .where(and(...conditions))
    .orderBy(desc(timeLog.startTime))
    .limit(500)

  const totalMinutes = logs.reduce((s, l) => s + (l.durationMinutes || 0), 0)
  const billableMinutes = logs.filter(l => l.isBillable).reduce((s, l) => s + (l.durationMinutes || 0), 0)

  return {
    meta: {
      totalRecords: logs.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: {
        'Total Entries': logs.length,
        'Total Hours': `${Math.round(totalMinutes / 60 * 10) / 10}h`,
        'Billable Hours': `${Math.round(billableMinutes / 60 * 10) / 10}h`,
        'Non-Billable': `${Math.round((totalMinutes - billableMinutes) / 60 * 10) / 10}h`,
      },
    },
    columns: [
      { key: 'userName', label: 'User', type: 'text' },
      { key: 'ticketNumber', label: 'Ticket', type: 'text' },
      { key: 'durationMinutes', label: 'Minutes', type: 'number' },
      { key: 'isBillable', label: 'Billable', type: 'badge' },
      { key: 'startTime', label: 'Date', type: 'date' },
    ],
    data: logs.map(l => ({
      userName: l.userName || 'Unknown',
      ticketNumber: l.ticketNumber || `#${l.ticketId}`,
      durationMinutes: l.durationMinutes || 0,
      isBillable: l.isBillable ? 'Yes' : 'No',
      startTime: l.startTime.toISOString(),
    })),
    charts: [{
      type: 'bar' as const,
      title: 'Daily Hours',
      data: (() => {
        const daily: Record<string, number> = {}
        for (const l of logs) {
          const d = l.startTime.toISOString().split('T')[0]
          daily[d] = (daily[d] || 0) + (l.durationMinutes || 0) / 60
        }
        return Object.entries(daily).slice(-14).map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
      })(),
    }],
  }
}

// ─── Report: Billable Hours ──────────────────────────────────────────────
export async function getBillableHoursReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions: any[] = [eq(timeLog.isBillable, true), gte(timeLog.startTime, since), lte(timeLog.startTime, until), isNotNull(timeLog.endTime)]
  if (filters.developerId) conditions.push(eq(timeLog.userId, filters.developerId))

  const logs = await db
    .select({
      id: timeLog.id,
      startTime: timeLog.startTime,
      durationMinutes: timeLog.durationMinutes,
    })
    .from(timeLog)
    .where(and(...conditions))
    .orderBy(desc(timeLog.startTime))
    .limit(500)
  const totalMinutes = logs.reduce((s, l) => s + (l.durationMinutes || 0), 0)

  return {
    meta: { totalRecords: logs.length, generatedAt: new Date().toISOString(), appliedFilters: ['Billable only'], summary: { 'Total Entries': logs.length, 'Billable Hours': `${Math.round(totalMinutes / 60 * 10) / 10}h` } },
    columns: [{ key: 'durationMinutes', label: 'Minutes', type: 'number' }, { key: 'startTime', label: 'Date', type: 'date' }],
    data: logs.map(l => ({ durationMinutes: l.durationMinutes || 0, startTime: l.startTime.toISOString() })),
  }
}

// ─── Report: Non-Billable Hours ──────────────────────────────────────────
export async function getNonBillableHoursReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions: any[] = [eq(timeLog.isBillable, false), gte(timeLog.startTime, since), lte(timeLog.startTime, until), isNotNull(timeLog.endTime)]
  if (filters.developerId) conditions.push(eq(timeLog.userId, filters.developerId))

  const logs = await db
    .select({
      id: timeLog.id,
      startTime: timeLog.startTime,
      durationMinutes: timeLog.durationMinutes,
    })
    .from(timeLog)
    .where(and(...conditions))
    .orderBy(desc(timeLog.startTime))
    .limit(500)
  const totalMinutes = logs.reduce((s, l) => s + (l.durationMinutes || 0), 0)

  return {
    meta: { totalRecords: logs.length, generatedAt: new Date().toISOString(), appliedFilters: ['Non-billable only'], summary: { 'Total Entries': logs.length, 'Non-Billable Hours': `${Math.round(totalMinutes / 60 * 10) / 10}h` } },
    columns: [{ key: 'durationMinutes', label: 'Minutes', type: 'number' }, { key: 'startTime', label: 'Date', type: 'date' }],
    data: logs.map(l => ({ durationMinutes: l.durationMinutes || 0, startTime: l.startTime.toISOString() })),
  }
}

// ─── Report: Team Performance ────────────────────────────────────────────
export async function getTeamPerformanceReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)

  const allUsers = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(inArray(user.role, ['developer', 'project_manager']))

  if (allUsers.length === 0) {
    return { meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: ['All active members'], summary: {} }, columns: [], data: [] }
  }

  const userIds = allUsers.map(u => u.id)
  const [timeResults, resolvedResults] = await Promise.all([
    db.select({ userId: timeLog.userId, total: sum(timeLog.durationMinutes) })
      .from(timeLog)
      .where(and(inArray(timeLog.userId, userIds), gte(timeLog.startTime, since), lte(timeLog.startTime, until), isNotNull(timeLog.endTime)))
      .groupBy(timeLog.userId),
    db.select({ assignedToId: ticket.assignedToId, count: count() })
      .from(ticket)
      .where(and(inArray(ticket.assignedToId, userIds), eq(ticket.status, TicketStatus.CLOSED), gte(ticket.createdAt, since)))
      .groupBy(ticket.assignedToId),
  ])

  const timeMap = new Map(timeResults.map(r => [r.userId, Number(r.total) || 0]))
  const resolvedMap = new Map(resolvedResults.map(r => [r.assignedToId, Number(r.count) || 0]))

  const stats = allUsers.map(u => ({
    name: u.name,
    role: u.role,
    totalHours: Math.round(((timeMap.get(u.id) || 0) / 60) * 10) / 10,
    ticketsResolved: resolvedMap.get(u.id) || 0,
  }))

  return {
    meta: {
      totalRecords: stats.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: ['All active members'],
      summary: { 'Team Members': stats.length, 'Total Hours': `${stats.reduce((s, u) => s + u.totalHours, 0)}h`, 'Total Resolved': stats.reduce((s, u) => s + u.ticketsResolved, 0) },
    },
    columns: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'role', label: 'Role', type: 'badge' },
      { key: 'totalHours', label: 'Hours', type: 'number' },
      { key: 'ticketsResolved', label: 'Resolved', type: 'number' },
    ],
    data: stats.sort((a, b) => b.totalHours - a.totalHours),
    charts: [{ type: 'bar' as const, title: 'Team Hours', data: stats.map(u => ({ name: u.name, value: u.totalHours })) }],
  }
}

// ─── Report: Assignment ──────────────────────────────────────────────────
export async function getAssignmentReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const conditions: any[] = [isNotNull(ticket.assignedToId)]
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))
  if (filters.developerId) conditions.push(eq(ticket.assignedToId, filters.developerId))

  // OPTIMIZATION: Use LEFT JOIN instead of separate developer lookup + inArray.
  // Before: 1 x ticket query + 1 x developer fetch (with userIds from tickets) = 2 queries
  // After:  1 x ticket query with LEFT JOIN user = 1 query (+ JS set for deduped names)
  const rows = await db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      status: ticket.status, assignedToId: ticket.assignedToId,
      assignedAt: ticket.assignedAt,
      assignedToName: user.name,
    })
    .from(ticket)
    .leftJoin(user, eq(ticket.assignedToId, user.id))
    .where(and(...conditions))
    .orderBy(desc(ticket.assignedAt))

  const developerIds = [...new Set(rows.filter(r => r.assignedToId).map(r => r.assignedToId as string))]

  return {
    meta: { totalRecords: rows.length, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { 'Total Assigned': rows.length, 'Developers': developerIds.length } },
    columns: [
      { key: 'ticketNumber', label: 'Ticket', type: 'text' },
      { key: 'assignedToName', label: 'Assigned To', type: 'text' },
      { key: 'status', label: 'Status', type: 'badge' },
      { key: 'assignedAt', label: 'Assigned', type: 'date' },
    ],
    data: rows.slice(0, 100).map(r => ({
      ticketNumber: r.ticketNumber,
      assignedToName: r.assignedToName || 'Unknown',
      status: r.status,
      assignedAt: r.assignedAt?.toISOString() || '',
    })),
  }
}
