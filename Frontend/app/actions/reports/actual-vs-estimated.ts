// @ts-nocheck
'use server'

import { db } from '@/lib/db'
import { timeLog, ticket, user, project } from '@/lib/db/schema'
import { and, eq, gte, lte, isNotNull } from 'drizzle-orm'
import type { ReportFilters, ReportResult } from './types'
import { getDateRange } from './types'
import type { CurrentUser } from './queries'

/**
 * Actual Time vs Estimated Time report.
 *
 * One row per task (ticket) that carries an hour estimate. Actual hours come
 * from the completed worklogs logged against that ticket (never fabricated),
 * so the variance columns are meaningful. Filters: date range (tickets
 * created in range), project, module and developer (assigned resource).
 *
 * Access: manager/admin see every task; developers see their own assigned
 * tasks. Clients are denied at the report-level access gate (this report
 * exposes internal resource names).
 */
export async function getActualVsEstimatedReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)

  const ticketConditions: any[] = [
    isNotNull(ticket.estimatedHours),
    gte(ticket.estimatedHours, 1),
    gte(ticket.createdAt, since),
    lte(ticket.createdAt, until),
  ]
  if (currentUser.role === 'developer') ticketConditions.push(eq(ticket.assignedToId, currentUser.id))
  if (filters.developerId) ticketConditions.push(eq(ticket.assignedToId, filters.developerId))
  if (filters.projectId) ticketConditions.push(eq(ticket.projectId, filters.projectId))
  if (filters.moduleId) ticketConditions.push(eq(ticket.moduleId, filters.moduleId))

  // Tasks (tickets) with an estimate + their assigned resource / project.
  const tasks = await db
    .select({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      estimatedHours: ticket.estimatedHours,
      assignedToId: ticket.assignedToId,
      developerName: user.name,
      projectName: project.projectName,
      projectCode: project.projectCode,
    })
    .from(ticket)
    .leftJoin(user, eq(ticket.assignedToId, user.id))
    .leftJoin(project, eq(ticket.projectId, project.id))
    .where(and(...ticketConditions))
    .orderBy(ticket.ticketNumber)

  // Actual minutes logged (completed worklogs) per ticket + resource in range.
  const logConditions: any[] = [
    gte(timeLog.startTime, since),
    lte(timeLog.startTime, until),
    isNotNull(timeLog.endTime),
  ]
  if (filters.developerId) logConditions.push(eq(timeLog.userId, filters.developerId))
  if (currentUser.role === 'developer') logConditions.push(eq(timeLog.userId, currentUser.id))

  const logRows = await db
    .select({
      ticketId: timeLog.ticketId,
      userId: timeLog.userId,
      totalMinutes: timeLog.durationMinutes,
    })
    .from(timeLog)
    .where(and(...logConditions))

  const minutesByTicket = new Map<number, number>()
  for (const row of logRows) {
    const mins = (minutesByTicket.get(row.ticketId) || 0) + (row.totalMinutes || 0)
    minutesByTicket.set(row.ticketId, mins)
  }

  const round1 = (n: number) => Math.round(n * 10) / 10

  const rows = tasks
    .map((t) => {
      const estimated = Number(t.estimatedHours) || 0
      const actual = round1((minutesByTicket.get(t.id) || 0) / 60)
      const variance = round1(actual - estimated)
      const variancePct = estimated > 0 ? round1(((actual - estimated) / estimated) * 100) : null
      return {
        ticketNumber: t.ticketNumber,
        title: t.title,
        project: t.projectName || t.projectCode || '',
        developer: t.developerName || 'Unassigned',
        estimatedHours: estimated,
        actualHours: actual,
        variance,
        variancePct,
      }
    })
    .sort((a, b) => b.variance - a.variance)

  const totalEstimated = round1(rows.reduce((s, r) => s + r.estimatedHours, 0))
  const totalActual = round1(rows.reduce((s, r) => s + r.actualHours, 0))
  const totalVariance = round1(totalActual - totalEstimated)
  const overEstimate = rows.filter((r) => r.variance > 0).length
  const underEstimate = rows.filter((r) => r.variance < 0).length

  const devActual = new Map<string, number>()
  const devEstimated = new Map<string, number>()
  for (const r of rows) {
    devActual.set(r.developer, (devActual.get(r.developer) || 0) + r.actualHours)
    devEstimated.set(r.developer, (devEstimated.get(r.developer) || 0) + r.estimatedHours)
  }

  return {
    meta: {
      totalRecords: rows.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: {
        'Tasks': rows.length,
        'Estimated Hours': totalEstimated,
        'Actual Hours': totalActual,
        'Variance (h)': totalVariance,
        'Over Estimate': overEstimate,
        'Under Estimate': underEstimate,
      },
    },
    columns: [
      { key: 'ticketNumber', label: 'Task', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'project', label: 'Project', type: 'text' },
      { key: 'developer', label: 'Developer', type: 'text' },
      { key: 'estimatedHours', label: 'Estimated Hours', type: 'number' },
      { key: 'actualHours', label: 'Actual Hours', type: 'number' },
      { key: 'variance', label: 'Variance (h)', type: 'number' },
      { key: 'variancePct', label: 'Variance %', type: 'number' },
    ],
    data: rows.map((r) => ({
      ...r,
      developer: r.developer,
      variancePct: r.variancePct === null ? null : `${r.variancePct}%`,
    })),
    charts: [
      {
        type: 'bar' as const,
        title: 'Variance (h) by Resource',
        data: [...devActual.keys()].map((name) => ({
          name,
          value: round1((devActual.get(name) || 0) - (devEstimated.get(name) || 0)),
        })).filter((d) => d.value !== 0).slice(0, 12),
      },
    ],
  }
}
