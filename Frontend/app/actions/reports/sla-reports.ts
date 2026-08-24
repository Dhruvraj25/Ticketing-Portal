// @ts-nocheck
'use server'

import { db } from '@/lib/db'
import { ticket } from '@/lib/db/schema'
import { and, eq, desc, inArray, isNotNull } from 'drizzle-orm'
import type { ReportFilters, ReportResult } from './types'
import type { CurrentUser } from './queries'

const SLA_THRESHOLD_HOURS = 48

// ─── Report: SLA Compliance ──────────────────────────────────────────────
export async function getSlaComplianceReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const conditions: any[] = [isNotNull(ticket.resolvedAt)]
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))
  if (filters.developerId) conditions.push(eq(ticket.assignedToId, filters.developerId))

  const rows = await db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      status: ticket.status, createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt,
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(desc(ticket.resolvedAt))
    .limit(200)

  const withSLA = rows.map(r => {
    const hours = r.resolvedAt ? (r.resolvedAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60) : 0
    return { ...r, resolutionHours: Math.round(hours * 10) / 10, withinSLA: hours <= SLA_THRESHOLD_HOURS }
  })

  const withinSLA = withSLA.filter(r => r.withinSLA).length
  const breached = withSLA.length - withinSLA
  const complianceRate = withSLA.length > 0 ? Math.round((withinSLA / withSLA.length) * 100) : 0

  return {
    meta: { totalRecords: withSLA.length, generatedAt: new Date().toISOString(), appliedFilters: ['SLA threshold: 48 hours'], summary: { 'Total Resolved': withSLA.length, 'Within SLA': withinSLA, 'Breached': breached, 'Compliance Rate': `${complianceRate}%` } },
    columns: [
      { key: 'ticketNumber', label: 'Ticket', type: 'text' },
      { key: 'resolutionHours', label: 'Hours to Resolve', type: 'number' },
      { key: 'withinSLA', label: 'Within SLA', type: 'badge' },
    ],
    data: withSLA.slice(0, 100).map(r => ({ ticketNumber: r.ticketNumber, resolutionHours: r.resolutionHours, withinSLA: r.withinSLA ? 'Yes' : 'No' })),
    charts: [{ type: 'pie' as const, title: 'SLA Compliance', data: [{ name: 'Within SLA', value: withinSLA }, { name: 'Breached', value: breached }] }],
  }
}

// ─── Report: SLA Breach ──────────────────────────────────────────────────
export async function getSlaBreachReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const conditions: any[] = [isNotNull(ticket.resolvedAt)]
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))

  const rows = await db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      status: ticket.status, createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt,
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(desc(ticket.resolvedAt))
    .limit(200)

  const breached = rows
    .map(r => {
      const hours = r.resolvedAt ? (r.resolvedAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60) : 0
      return { ...r, resolutionHours: Math.round(hours * 10) / 10 }
    })
    .filter(r => r.resolutionHours > SLA_THRESHOLD_HOURS)

  return {
    meta: { totalRecords: breached.length, generatedAt: new Date().toISOString(), appliedFilters: ['SLA threshold: 48 hours', 'Breached only'], summary: { 'Breached Tickets': breached.length, 'Avg Override': breached.length ? `${Math.round(breached.reduce((s, r) => s + r.resolutionHours, 0) / breached.length * 10) / 10}h` : '—' } },
    columns: [
      { key: 'ticketNumber', label: 'Ticket', type: 'text' },
      { key: 'resolutionHours', label: 'Hours', type: 'number' },
      { key: 'overSlaBy', label: 'Over by (h)', type: 'number' },
    ],
    data: breached.slice(0, 100).map(r => ({ ticketNumber: r.ticketNumber, resolutionHours: r.resolutionHours, overSlaBy: Math.round((r.resolutionHours - SLA_THRESHOLD_HOURS) * 10) / 10 })),
  }
}
