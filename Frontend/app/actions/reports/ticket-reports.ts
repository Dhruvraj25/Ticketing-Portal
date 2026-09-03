'use server'

import { db } from '@/lib/db'
import { ticket } from '@/lib/db/schema'
import { and, eq, desc, gte, lte, sql, isNotNull, count } from 'drizzle-orm'
import { TicketStatus, TICKET_STATUS_CONFIG } from '@/lib/types'
import type { ReportFilters, ReportResult } from './types'
import { getDateRange } from './types'
import type { CurrentUser } from './queries'

// ─── Report: Ticket Summary ──────────────────────────────────────────────
export async function getTicketSummaryReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions = [gte(ticket.createdAt, since), lte(ticket.createdAt, until)]

  if (currentUser.role === 'client') conditions.push(eq(ticket.clientId, currentUser.id))
  if (currentUser.role === 'developer') conditions.push(eq(ticket.assignedToId, currentUser.id))
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))
  if (filters.moduleId) conditions.push(eq(ticket.moduleId, filters.moduleId))
  if (filters.developerId) conditions.push(eq(ticket.assignedToId, filters.developerId))
  if (filters.clientId) conditions.push(eq(ticket.clientId, filters.clientId))
  if (filters.status) conditions.push(eq(ticket.status, filters.status))
  if (filters.priority) conditions.push(eq(ticket.priority, filters.priority))

  // OPTIMIZATION: Use SQL FILTER aggregates for status counts (safe on status column),
  // but compute onTime/lateCount in JS (safer than SQL CAST on date-formatted columns).
  // Before: Loaded ALL rows (1000+) into JS → 5 passes of .filter() + .reduce()
  // After:  1 FILTER aggregate query for status counts + limited SELECT for table rows
  const [aggregateResult] = await db
    .select({
      totalCount: count().mapWith(Number),
      openCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} IN ('new', 'manager_review', 'assigned'))::int`.mapWith(Number),
      inProgressCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} IN ('in_progress', 'estimate_pending', 'estimate_approved'))::int`.mapWith(Number),
      resolvedCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} IN ('resolved', 'client_review'))::int`.mapWith(Number),
      closedCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'closed')::int`.mapWith(Number),
    })
    .from(ticket)
    .where(and(...conditions))

  // Fetch only necessary columns for table display — no full description
  // onTimeCount and lateCount are computed in JS to avoid type casting risks
  const rows = await db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      status: ticket.status, priority: ticket.priority,
      estimatedHours: ticket.estimatedHours, consumedHours: ticket.consumedHours,
      closedAt: ticket.closedAt,
      estimatedCompletionDate: ticket.estimatedCompletionDate,
      createdAt: ticket.createdAt,
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(desc(ticket.createdAt))

  const { totalCount, openCount, inProgressCount, resolvedCount, closedCount } = aggregateResult

  // onTimeCount/lateCount: computed in JS to avoid SQL CAST risks on date-typed columns
  const closedWithEstimate = rows.filter(t => t.status === TicketStatus.CLOSED && t.closedAt && t.estimatedCompletionDate)
  const onTimeCount = closedWithEstimate.filter(t => new Date(t.closedAt!) <= new Date(t.estimatedCompletionDate!)).length
  const lateCount = closedWithEstimate.length - onTimeCount

  return {
    meta: {
      totalRecords: totalCount,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: {
        'Total Tickets': totalCount,
        'Open': openCount,
        'Work in Progress': inProgressCount,
        'Awaiting Review': resolvedCount,
        'Completed': closedCount,
        'Completed On Time': onTimeCount,
        'Completed Late': lateCount,
      },
    },
    columns: [
      { key: 'ticketNumber', label: 'Ticket', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'status', label: 'Status', type: 'badge' },
      { key: 'priority', label: 'Priority', type: 'badge' },
      { key: 'estimatedHours', label: 'Est. Hours', type: 'number' },
      { key: 'actualHours', label: 'Actual Hours', type: 'number' },
      { key: 'completionStatus', label: 'Timing', type: 'badge' },
      { key: 'createdAt', label: 'Created', type: 'date' },
      { key: 'completedAt', label: 'Completed', type: 'date' },
    ],
    data: rows.map(r => {
      let completionStatus = ''
      if (r.status === TicketStatus.CLOSED && r.closedAt) {
        if (r.estimatedCompletionDate) {
          completionStatus = new Date(r.closedAt) <= new Date(r.estimatedCompletionDate) ? 'ON TIME' : 'LATE'
        }
      }
      return {
        ticketNumber: r.ticketNumber,
        title: r.title,
        status: r.status,
        priority: r.priority,
        estimatedHours: r.estimatedHours || 0,
        actualHours: r.consumedHours || 0,
        completionStatus,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.closedAt?.toISOString() || '',
      }
    }),
    charts: [
      {
        type: 'pie' as const,
        title: 'Tickets by Status',
        data: [
          { name: 'Open', value: openCount },
          { name: 'Work in Progress', value: inProgressCount },
          { name: 'Awaiting Review', value: resolvedCount },
          { name: 'Completed', value: closedCount },
        ],
      },
    ],
  }
}

// ─── Report: Ticket Status ───────────────────────────────────────────────
export async function getTicketStatusReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions = [gte(ticket.createdAt, since), lte(ticket.createdAt, until)]

  if (currentUser.role === 'client') conditions.push(eq(ticket.clientId, currentUser.id))
  if (currentUser.role === 'developer') conditions.push(eq(ticket.assignedToId, currentUser.id))
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))
  if (filters.developerId) conditions.push(eq(ticket.assignedToId, filters.developerId))
  if (filters.clientId) conditions.push(eq(ticket.clientId, filters.clientId))

  // OPTIMIZATION: Use SQL GROUP BY instead of loading ALL rows into JS
  // and building statusCounts with a for-loop. Single GROUP BY returns
  // just the counts per status — minimal data transfer.
  const statusCounts = await db
    .select({
      status: ticket.status,
      count: count().mapWith(Number),
    })
    .from(ticket)
    .where(and(...conditions))
    .groupBy(ticket.status)
    .orderBy(desc(ticket.status))

  const statusMap: Record<string, number> = {}
  for (const r of statusCounts) {
    statusMap[r.status] = r.count
  }

  // Also get total for accuracy
  const [totalResult] = await db
    .select({ total: count().mapWith(Number) })
    .from(ticket)
    .where(and(...conditions))

  const totalRecords = totalResult?.total || 0

  return {
    meta: {
      totalRecords,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: Object.fromEntries(Object.entries(statusMap).map(([k, v]) => [TICKET_STATUS_CONFIG[k as keyof typeof TICKET_STATUS_CONFIG]?.label || k.replace(/_/g, ' '), v])),
    },
    columns: [
      { key: 'status', label: 'Status', type: 'badge' },
      { key: 'count', label: 'Count', type: 'number' },
    ],
    data: Object.entries(statusMap).map(([status, count]) => ({ status, count })),
    charts: [
      {
        type: 'bar' as const,
        title: 'Status Distribution',
        data: Object.entries(statusMap).map(([name, value]) => ({ name: TICKET_STATUS_CONFIG[name as keyof typeof TICKET_STATUS_CONFIG]?.label || name.replace(/_/g, ' '), value })),
      },
    ],
  }
}

// ─── Report: Ticket Aging ────────────────────────────────────────────────
// (unchanged — already efficient with limited columns)
export async function getTicketAgingReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const conditions: any[] = [sql`${ticket.status} NOT IN (${TicketStatus.CLOSED})`]
  if (currentUser.role === 'client') conditions.push(eq(ticket.clientId, currentUser.id))
  if (currentUser.role === 'developer') conditions.push(eq(ticket.assignedToId, currentUser.id))
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))

  const rows = await db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      status: ticket.status, createdAt: ticket.createdAt,
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(ticket.createdAt)

  const now = Date.now()
  const aged = rows.map(r => {
    const daysOld = Math.floor((now - r.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    return { ...r, daysOld }
  }).filter(r => r.daysOld > 1)

  const agingBuckets = {
    '1-7 days': 0,
    '8-14 days': 0,
    '15-30 days': 0,
    '30+ days': 0,
  }
  for (const r of aged) {
    if (r.daysOld <= 7) agingBuckets['1-7 days']++
    else if (r.daysOld <= 14) agingBuckets['8-14 days']++
    else if (r.daysOld <= 30) agingBuckets['15-30 days']++
    else agingBuckets['30+ days']++
  }

  return {
    meta: {
      totalRecords: aged.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: ['Open/In Progress tickets only'],
      summary: agingBuckets,
    },
    columns: [
      { key: 'ticketNumber', label: 'Ticket', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'status', label: 'Status', type: 'badge' },
      { key: 'daysOld', label: 'Days Open', type: 'number' },
      { key: 'createdAt', label: 'Created', type: 'date' },
    ],
    data: aged.slice(0, 100).map(r => ({
      ticketNumber: r.ticketNumber,
      title: r.title,
      status: r.status,
      daysOld: r.daysOld,
      createdAt: r.createdAt.toISOString(),
    })),
    charts: [
      {
        type: 'bar' as const,
        title: 'Aging Distribution',
        data: Object.entries(agingBuckets).map(([name, value]) => ({ name, value })),
      },
    ],
  }
}

// ─── Report: Ticket Resolution ───────────────────────────────────────────
// (unchanged — already uses limited columns and isNotNull filter)
export async function getTicketResolutionReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const conditions: any[] = [isNotNull(ticket.resolvedAt)]
  if (currentUser.role === 'client') conditions.push(eq(ticket.clientId, currentUser.id))
  if (currentUser.role === 'developer') conditions.push(eq(ticket.assignedToId, currentUser.id))
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))
  if (filters.developerId) conditions.push(eq(ticket.assignedToId, filters.developerId))

  const rows = await db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      status: ticket.status, createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt, closedAt: ticket.closedAt,
      estimatedHours: ticket.estimatedHours,
      estimatedCompletionDate: ticket.estimatedCompletionDate,
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(desc(ticket.resolvedAt))

  const withHours = rows.map(r => {
    const hours = r.resolvedAt
      ? (r.resolvedAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60)
      : 0
    let completionStatus = ''
    if (r.status === TicketStatus.CLOSED && r.closedAt && r.estimatedCompletionDate) {
      completionStatus = new Date(r.closedAt) <= new Date(r.estimatedCompletionDate) ? 'ON TIME' : 'LATE'
    }
    return { ...r, resolutionHours: Math.round(hours * 10) / 10, completionStatus }
  })

  const avgHours = withHours.length
    ? Math.round(withHours.reduce((s, r) => s + r.resolutionHours, 0) / withHours.length * 10) / 10
    : 0

  return {
    meta: {
      totalRecords: withHours.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: ['Resolved/Closed tickets only'],
      summary: {
        'Total Resolved': withHours.length,
        'Avg Resolution': `${avgHours}h`,
        'Fastest': withHours.length ? `${Math.min(...withHours.map(r => r.resolutionHours))}h` : '\u2014',
        'Slowest': withHours.length ? `${Math.max(...withHours.map(r => r.resolutionHours))}h` : '\u2014',
      },
    },
    columns: [
      { key: 'ticketNumber', label: 'Ticket', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'resolutionHours', label: 'Hours to Resolve', type: 'number' },
      { key: 'estimatedHours', label: 'Est. Hours', type: 'number' },
      { key: 'completionStatus', label: 'Timing', type: 'badge' },
      { key: 'completedAt', label: 'Completed', type: 'date' },
      { key: 'resolvedAt', label: 'Resolved', type: 'date' },
    ],
    data: withHours.slice(0, 100).map(r => ({
      ticketNumber: r.ticketNumber,
      title: r.title,
      resolutionHours: r.resolutionHours,
      estimatedHours: r.estimatedHours || 0,
      completionStatus: r.completionStatus,
      completedAt: r.closedAt?.toISOString() || '',
      resolvedAt: r.resolvedAt?.toISOString() || '',
    })),
  }
}

// ─── Report: Estimate Approval ────────────────────────────────────────────
// (unchanged — already has LIMIT and efficient filtering)
export async function getEstimateApprovalReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions: any[] = [sql`${ticket.estimatedHours} > 0`, gte(ticket.createdAt, since), lte(ticket.createdAt, until)]
  if (currentUser.role === 'client') conditions.push(eq(ticket.clientId, currentUser.id))
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))

  const rows = await db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      status: ticket.status,
      estimatedHours: ticket.estimatedHours, consumedHours: ticket.consumedHours,
      estimatedCompletionDate: ticket.estimatedCompletionDate,
      resolvedAt: ticket.resolvedAt,
      autoApproved: ticket.autoApproved,
      estimateApprovedAt: ticket.estimateApprovedAt,
      autoApprovedAt: ticket.autoApprovedAt,
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(desc(ticket.createdAt)).limit(200)
  const withApprovals = rows.filter(r => r.estimatedHours && r.estimatedHours > 0)

  return {
    meta: {
      totalRecords: withApprovals.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: {
        'Total Estimates': withApprovals.length,
        'Approved': withApprovals.filter(r => r.status === TicketStatus.ESTIMATE_APPROVED && !r.autoApproved).length,
        'Auto-Approved': withApprovals.filter(r => r.autoApproved).length,
        'Pending': withApprovals.filter(r => r.status === TicketStatus.ESTIMATE_PENDING).length,
        'Declined': withApprovals.filter(r => r.status === TicketStatus.REQUEST_FOR_REVISION).length,
      },
    },
    columns: [
      { key: 'ticketNumber', label: 'Ticket Number', type: 'text' },
      { key: 'estimatedHours', label: 'Estimated Hours', type: 'number' },
      { key: 'approvedDate', label: 'Approved Date', type: 'date' },
      { key: 'autoApproved', label: 'Auto-Approved', type: 'badge' },
    ],
    data: withApprovals.slice(0, 100).map(r => ({
      ticketNumber: r.ticketNumber,
      estimatedHours: r.estimatedHours || 0,
      approvedDate: (r.estimateApprovedAt || r.autoApprovedAt)?.toISOString() || '',
      autoApproved: r.autoApproved ? 'Yes' : 'No',
    })),
    charts: [
      {
        type: 'pie' as const,
        title: 'Estimate Status',
        data: [
          { name: 'Approved', value: withApprovals.filter(r => r.status === TicketStatus.ESTIMATE_APPROVED && !r.autoApproved).length },
          { name: 'Auto-Approved', value: withApprovals.filter(r => r.autoApproved).length },
          { name: 'Pending', value: withApprovals.filter(r => r.status === TicketStatus.ESTIMATE_PENDING).length },
          { name: 'Declined', value: withApprovals.filter(r => r.status === TicketStatus.REQUEST_FOR_REVISION).length },
        ],
      },
    ],
  }
}

// ─── Report: Additional Hours ─────────────────────────────────────────────
// (unchanged — already has LIMIT and efficient WHERE)
export async function getAdditionalHoursReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions: any[] = [sql`${ticket.additionalHoursRequested} > 0`, gte(ticket.createdAt, since), lte(ticket.createdAt, until)]
  if (currentUser.role === 'client') conditions.push(eq(ticket.clientId, currentUser.id))
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))

  const rows = await db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      estimatedHours: ticket.estimatedHours,
      additionalHoursRequested: ticket.additionalHoursRequested,
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(desc(ticket.createdAt)).limit(200)

  return {
    meta: {
      totalRecords: rows.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: {
        'Total Requests': rows.length,
        'Total Additional Hours': rows.reduce((s, r) => s + (r.additionalHoursRequested || 0), 0),
      },
    },
    columns: [
      { key: 'ticketNumber', label: 'Ticket Number', type: 'text' },
      { key: 'originalEstimate', label: 'Original Estimate', type: 'number' },
      { key: 'additionalHours', label: 'Additional Hours', type: 'number' },
      { key: 'totalHours', label: 'Total Hours', type: 'number' },
    ],
    data: rows.map(r => ({
      ticketNumber: r.ticketNumber,
      originalEstimate: (r.estimatedHours || 0) - (r.additionalHoursRequested || 0),
      additionalHours: r.additionalHoursRequested || 0,
      totalHours: r.estimatedHours || 0,
    })),
  }
}
