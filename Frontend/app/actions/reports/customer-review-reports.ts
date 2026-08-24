'use server'

import { db } from '@/lib/db'
import { ticketReview, ticket, user, project, module as moduleTable, timeLog } from '@/lib/db/schema'
import { eq, and, or, count, sql, desc, asc, avg, gte, lte, lt, inArray } from 'drizzle-orm'
import { wrapServerAction } from '@/lib/performance-profiler'
import type { ReportFilters, ReportResult } from './types'
import type { CurrentUser } from './queries'

function buildConditions(filters: ReportFilters) {
  const ticketConditions = [eq(ticket.status, 'closed')]
  const reviewConditions: any[] = []

  if (filters.dateFrom) {
    ticketConditions.push(gte(ticket.closedAt, new Date(filters.dateFrom)))
    reviewConditions.push(gte(ticketReview.createdAt, new Date(filters.dateFrom)))
  }
  if (filters.dateTo) {
    ticketConditions.push(lte(ticket.closedAt, new Date(filters.dateTo + 'T23:59:59.999Z')))
    reviewConditions.push(lte(ticketReview.createdAt, new Date(filters.dateTo + 'T23:59:59.999Z')))
  }
  if (filters.projectId) {
    ticketConditions.push(eq(ticket.projectId, filters.projectId))
    reviewConditions.push(eq(ticketReview.projectId, filters.projectId))
  }
  if (filters.clientId) {
    ticketConditions.push(eq(ticket.clientId, filters.clientId))
    reviewConditions.push(eq(ticketReview.clientId, filters.clientId))
  }
  if (filters.developerId) {
    ticketConditions.push(eq(ticket.assignedToId, filters.developerId))
    reviewConditions.push(eq(ticketReview.assignedToId, filters.developerId))
  }
  if (filters.moduleId) {
    ticketConditions.push(eq(ticket.moduleId, filters.moduleId))
  }
  if (filters.managerId) {
    ticketConditions.push(sql`${ticket.projectId} IN (SELECT id FROM project WHERE "managerId" = ${filters.managerId})`)
  }
  if (filters.reviewStatus === 'reviewed') {
    reviewConditions.push(sql`${ticketReview.id} IS NOT NULL`)
  } else if (filters.reviewStatus === 'pending') {
    ticketConditions.push(sql`${ticketReview.id} IS NULL`)
  }
  if (filters.starRating && filters.starRating !== 'all') {
    reviewConditions.push(eq(ticketReview.overallRating, Number(filters.starRating)))
  }

  const ticketWhere = ticketConditions.length > 0 ? and(...ticketConditions) : undefined
  const reviewWhere = reviewConditions.length > 0 ? and(...reviewConditions) : undefined
  return { ticketWhere, reviewWhere, ticketConditions }
}

export const getCustomerReviewReport = wrapServerAction('getCustomerReviewReport', async function getCustomerReviewReport(
  filters: ReportFilters,
  currentUser: CurrentUser,
): Promise<ReportResult> {
  const { ticketWhere, reviewWhere } = buildConditions(filters)

  // ── OPTIMIZATION: Merge 4 KPI queries into 2 parallel queries ────────────
  // Before: 4 separate SELECT COUNT queries + 1 LEFT JOIN pagination COUNT
  // After:  2 parallel queries:
  //   1. closedTicketsArr + countResult (same WHERE, combined with LEFT JOIN)
  //   2. ratingStatsArr (reviews KPI + FILTER metrics)
  const [[closedAndPagination], [ratingStatsArr]] = await Promise.all([
    // MERGED: total closed + pagination count in a single query
    db
      .select({
        totalClosed: count(ticket.id).mapWith(Number),
        reviewedCount: count(ticketReview.id).mapWith(Number),
      })
      .from(ticket)
      .leftJoin(ticketReview, eq(ticket.id, ticketReview.ticketId))
      .where(ticketWhere ?? sql`1=1`),
    // Reviews KPI + FILTER metrics in one aggregate query
    db
      .select({
        avgRating: avg(ticketReview.overallRating).mapWith(Number),
        fiveStar: sql<number>`COUNT(*) FILTER (WHERE overall_rating = 5)::int`,
        lowRated: sql<number>`COUNT(*) FILTER (WHERE overall_rating <= 2)::int`,
      })
      .from(ticketReview)
      .where(reviewWhere ?? sql`1=1`),
  ])

  const totalClosed = Number(closedAndPagination?.totalClosed) || 0
  const reviewsSubmitted = Number(closedAndPagination?.reviewedCount) || 0
  const pendingReviews = Math.max(0, totalClosed - reviewsSubmitted)
  const totalDataCount = totalClosed
  const avgRating = Number(ratingStatsArr?.avgRating) || 0
  const fiveStarCount = Number(ratingStatsArr?.fiveStar) || 0
  const lowRatedCount = Number(ratingStatsArr?.lowRated) || 0

  // Pagination
  const page = filters.page || 1
  const pageSize = filters.pageSize || 25
  const offset = (page - 1) * pageSize

  // Main report data: closed tickets + reviews (left join)
  const rows = await db
    .select({
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketTitle: ticket.title,
      clientName: sql<string>`COALESCE((SELECT name FROM "user" WHERE id = ${ticket.clientId}), '—')`,
      projectName: sql<string>`COALESCE((SELECT "projectName" FROM project WHERE id = ${ticket.projectId}), '—')`,
      projectIdField: ticket.projectId,
      moduleName: sql<string>`COALESCE((SELECT "moduleName" FROM ${moduleTable} WHERE id = ${ticket.moduleId}), '—')`,
      assignedToName: sql<string>`COALESCE((SELECT name FROM "user" WHERE id = ${ticket.assignedToId}), '—')`,
      assignedToIdField: ticket.assignedToId,
      closedAt: ticket.closedAt,
      reviewId: ticketReview.id,
      overallRating: ticketReview.overallRating,
      reviewComment: ticketReview.reviewComment,
      reviewCreatedAt: ticketReview.createdAt,
    })
    .from(ticket)
    .leftJoin(ticketReview, eq(ticket.id, ticketReview.ticketId))
    .where(ticketWhere ?? sql`1=1`)
    .orderBy(desc(ticket.closedAt))
    .limit(pageSize)
    .offset(offset)

  // Rating Distribution chart
  const distribution = await db
    .select({ rating: ticketReview.overallRating, count: count().mapWith(Number) })
    .from(ticketReview)
    .where(reviewWhere ?? sql`1=1`)
    .groupBy(ticketReview.overallRating)
    .orderBy(desc(ticketReview.overallRating))

  const ratingDistMap: Record<number, number> = {}
  for (const d of distribution) ratingDistMap[Number(d.rating)] = Number(d.count)
  const ratingDistData = [5, 4, 3, 2, 1].map(r => ({
    name: `${r} Star${r > 1 ? 's' : ''}`,
    value: ratingDistMap[r] || 0,
  }))

  // Avg Rating by Resource chart
  const ratingByResource = await db
    .select({ assignedToId: ticketReview.assignedToId, avgRating: avg(ticketReview.overallRating).mapWith(Number), count: count().mapWith(Number) })
    .from(ticketReview)
    .where(and(reviewWhere ? reviewWhere : sql`1=1`, sql`${ticketReview.assignedToId} IS NOT NULL`))
    .groupBy(ticketReview.assignedToId)
    .orderBy(desc(avg(ticketReview.overallRating)))

  const resourceIds = ratingByResource.map(r => r.assignedToId).filter((id): id is string => id !== null && id !== undefined)
  let resourceNames: Record<string, string> = {}
  if (resourceIds.length > 0) {
    const users = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, resourceIds))
    for (const u of users) resourceNames[u.id] = u.name
  }
  const byResourceData = ratingByResource.map(r => ({
    name: (r.assignedToId ? resourceNames[r.assignedToId] : undefined) || r.assignedToId || 'Unknown',
    value: Math.round(Number(r.avgRating) * 10) / 10,
  }))

  // Avg Rating by Project chart
  const ratingByProject = await db
    .select({ projectId: ticketReview.projectId, avgRating: avg(ticketReview.overallRating).mapWith(Number), count: count().mapWith(Number) })
    .from(ticketReview)
    .where(and(reviewWhere ? reviewWhere : sql`1=1`, sql`${ticketReview.projectId} IS NOT NULL`))
    .groupBy(ticketReview.projectId)
    .orderBy(desc(avg(ticketReview.overallRating)))

  const projectIds = ratingByProject.map(r => r.projectId).filter(Boolean) as number[]
  let projectNames: Record<string, string> = {}
  if (projectIds.length > 0) {
    const projs = await db.select({ id: project.id, name: project.projectName }).from(project).where(inArray(project.id, projectIds))
    for (const p of projs) projectNames[String(p.id)] = p.name
  }
  const byProjectData = ratingByProject.map(r => ({
    name: projectNames[String(r.projectId)] || `Project #${r.projectId}`,
    value: Math.round(Number(r.avgRating) * 10) / 10,
  }))

  // Avg Rating by Module (by project as proxy) chart
  const ratingByModule = await db
    .select({ moduleId: ticketReview.projectId, avgRating: avg(ticketReview.overallRating).mapWith(Number), count: count().mapWith(Number) })
    .from(ticketReview)
    .where(and(reviewWhere ? reviewWhere : sql`1=1`, sql`${ticketReview.projectId} IS NOT NULL`))
    .groupBy(ticketReview.projectId)
    .orderBy(desc(avg(ticketReview.overallRating)))
    .limit(10)

  const byModuleData = ratingByModule.map(r => ({
    name: projectNames[String(r.moduleId)] || `Project #${r.moduleId}`,
    value: Math.round(Number(r.avgRating) * 10) / 10,
  }))

  // Monthly Satisfaction Trend chart
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11)
  twelveMonthsAgo.setDate(1)

  const monthlyData = await db
    .select({ month: sql<string>`to_char(${ticketReview.createdAt}, 'YYYY-MM')`, avgRating: avg(ticketReview.overallRating).mapWith(Number) })
    .from(ticketReview)
    .where(and(reviewWhere ? reviewWhere : sql`1=1`, gte(ticketReview.createdAt, twelveMonthsAgo)))
    .groupBy(sql`to_char(${ticketReview.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${ticketReview.createdAt}, 'YYYY-MM')`)

  const monthlyTrendData = monthlyData.map(r => ({
    name: formatMonthLabel(r.month),
    value: Math.round(Number(r.avgRating) * 10) / 10,
  }))

  // Resource Performance data
  const resourcePerformance = await db
    .select({
      assignedToId: ticketReview.assignedToId, count: count().mapWith(Number),
      avgRating: avg(ticketReview.overallRating).mapWith(Number),
      fiveStar: sql<number>`COUNT(*) FILTER (WHERE overall_rating = 5)::int`,
      fourStar: sql<number>`COUNT(*) FILTER (WHERE overall_rating = 4)::int`,
      threeStar: sql<number>`COUNT(*) FILTER (WHERE overall_rating = 3)::int`,
      twoStar: sql<number>`COUNT(*) FILTER (WHERE overall_rating = 2)::int`,
      oneStar: sql<number>`COUNT(*) FILTER (WHERE overall_rating = 1)::int`,
    })
    .from(ticketReview)
    .where(and(reviewWhere ? reviewWhere : sql`1=1`, sql`${ticketReview.assignedToId} IS NOT NULL`))
    .groupBy(ticketReview.assignedToId)
    .orderBy(desc(avg(ticketReview.overallRating)))

  // Low Rating Tickets (1-2 stars)
  const lowRatingWhere = reviewWhere
    ? and(reviewWhere, sql`${ticketReview.overallRating} <= 2`)
    : sql`${ticketReview.overallRating} <= 2`

  const lowRatedTickets = await db
    .select({
      ticketNumber: ticket.ticketNumber,
      clientName: sql<string>`COALESCE((SELECT name FROM "user" WHERE id = ${ticket.clientId}), '—')`,
      projectName: sql<string>`COALESCE((SELECT "projectName" FROM project WHERE id = ${ticket.projectId}), '—')`,
      assignedToName: sql<string>`COALESCE((SELECT name FROM "user" WHERE id = ${ticket.assignedToId}), '—')`,
      managerName: sql<string>`COALESCE((SELECT name FROM "user" WHERE id = (SELECT "managerId" FROM project WHERE id = ${ticket.projectId})), '—')`,
      overallRating: ticketReview.overallRating,
      reviewComment: ticketReview.reviewComment,
      reviewCreatedAt: ticketReview.createdAt,
    })
    .from(ticketReview)
    .leftJoin(ticket, eq(ticketReview.ticketId, ticket.id))
    .where(lowRatingWhere)
    .orderBy(desc(ticketReview.createdAt))

  // ── OPTIMIZATION: Replace NOT IN with LEFT JOIN anti-join ───────────────
  // Before: Queried ALL reviewed ticketIds, loaded them into a JS Set,
  //         then used NOT IN (500+ IDs) — huge SQL string, slow planner.
  // After:  LEFT JOIN ... WHERE review.id IS NULL — standard anti-join
  //         pattern that PostgreSQL optimizes to an anti-join plan.
  const pendingConditions: any[] = [eq(ticket.status, 'closed')]
  if (filters.dateFrom) pendingConditions.push(gte(ticket.closedAt, new Date(filters.dateFrom)))
  if (filters.dateTo) pendingConditions.push(lte(ticket.closedAt, new Date(filters.dateTo + 'T23:59:59.999Z')))
  if (filters.projectId) pendingConditions.push(eq(ticket.projectId, filters.projectId))
  if (filters.clientId) pendingConditions.push(eq(ticket.clientId, filters.clientId))
  if (filters.developerId) pendingConditions.push(eq(ticket.assignedToId, filters.developerId))

  const pendingReviewTickets = await db
    .select({
      ticketNumber: ticket.ticketNumber,
      clientName: sql<string>`COALESCE((SELECT name FROM "user" WHERE id = ${ticket.clientId}), '—')`,
      projectName: sql<string>`COALESCE((SELECT "projectName" FROM project WHERE id = ${ticket.projectId}), '—')`,
      assignedToName: sql<string>`COALESCE((SELECT name FROM "user" WHERE id = ${ticket.assignedToId}), '—')`,
      closedAt: ticket.closedAt,
    })
    .from(ticket)
    .leftJoin(ticketReview, eq(ticket.id, ticketReview.ticketId))
    .where(and(...pendingConditions, sql`${ticketReview.id} IS NULL`))
    .orderBy(desc(ticket.closedAt))
    .limit(500)

  // Build table data with raw dates for client-side calculation
  const tableData = rows.map((r) => ({
    'ticketNumber': r.ticketNumber,
    'ticketTitle': r.ticketTitle,
    'client': r.clientName,
    'project': r.projectName,
    'module': r.moduleName,
    'assignedResource': r.assignedToName,
    'manager': '—',
    'closedDate': r.closedAt ? formatDate(r.closedAt) : '—',
    '_closedAt': r.closedAt ? r.closedAt.toISOString() : '',
    'reviewSubmitted': r.reviewId ? 'Yes' : 'No',
    'rating': r.overallRating || '—',
    'customerComment': r.reviewComment || '—',
    'reviewDate': r.reviewCreatedAt ? formatDate(r.reviewCreatedAt) : '—',
    '_ticketId': r.ticketId,
  }))

  // Fill in manager names
  if (rows.length > 0) {
    const projectIdsInData = [...new Set(rows.map(r => r.projectIdField).filter(Boolean))]
    if (projectIdsInData.length > 0) {
      const projectsWithManagers = await db
        .select({ id: project.id, managerId: project.managerId })
        .from(project)
        .where(inArray(project.id, projectIdsInData as number[]))
      const managerIds = [...new Set(projectsWithManagers.map(p => p.managerId).filter(Boolean))]
      let managerNames: Record<string, string> = {}
      if (managerIds.length > 0) {
        const managers = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, managerIds as string[]))
        for (const m of managers) managerNames[m.id] = m.name
      }
      const projectManagerMap: Record<number, string> = {}
      for (const p of projectsWithManagers) projectManagerMap[p.id] = managerNames[p.managerId] || '—'
      for (let i = 0; i < tableData.length; i++) {
        const pid = rows[i].projectIdField
        if (pid) tableData[i]['manager'] = projectManagerMap[pid] || '—'
      }
    }
  }

  // Summary (KPIs)
  const summary: Record<string, string | number> = {
    'Total Closed Tickets': totalClosed,
    'Reviews Submitted': reviewsSubmitted,
    'Pending Reviews': pendingReviews,
    'Average Rating': Math.round(avgRating * 10) / 10,
    '5 Star Reviews': fiveStarCount,
    'Low Rated Reviews': lowRatedCount,
  }

  // Charts
  const charts = [
    { type: 'bar' as const, title: 'Rating Distribution', data: ratingDistData },
    { type: 'bar' as const, title: 'Average Rating by Resource', data: byResourceData.slice(0, 15) },
    { type: 'bar' as const, title: 'Average Rating by Project', data: byProjectData.slice(0, 15) },
    { type: 'bar' as const, title: 'Average Rating by Module', data: byModuleData.slice(0, 10) },
    { type: 'line' as const, title: 'Monthly Customer Satisfaction Trend', data: monthlyTrendData },
  ]

  // Applied filters
  const appliedFilters: string[] = ['customer review']
  if (filters.dateFrom) appliedFilters.push(`from ${filters.dateFrom}`)
  if (filters.dateTo) appliedFilters.push(`to ${filters.dateTo}`)
  if (filters.projectId) {
    const p = await db.select({ name: project.projectName }).from(project).where(eq(project.id, filters.projectId)).limit(1)
    if (p[0]) appliedFilters.push(`project: ${p[0].name}`)
  }
  if (filters.developerId) {
    const d = await db.select({ name: user.name }).from(user).where(eq(user.id, filters.developerId)).limit(1)
    if (d[0]) appliedFilters.push(`resource: ${d[0].name}`)
  }
  if (filters.clientId) {
    const c = await db.select({ name: user.name }).from(user).where(eq(user.id, filters.clientId)).limit(1)
    if (c[0]) appliedFilters.push(`client: ${c[0].name}`)
  }

  // Build resource performance with names
  const rpIds = resourcePerformance.map(r => r.assignedToId).filter((id): id is string => id !== null && id !== undefined)
  let rpNames: Record<string, string> = {}
  if (rpIds.length > 0) {
    const rpUsers = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, rpIds))
    for (const u of rpUsers) rpNames[u.id] = u.name
  }
  const rpData = resourcePerformance.map(r => ({
    name: (r.assignedToId ? rpNames[r.assignedToId] : undefined) || r.assignedToId || 'Unknown',
    reviewsReceived: Number(r.count),
    averageRating: Math.round(Number(r.avgRating) * 10) / 10,
    fiveStarCount: Number(r.fiveStar),
    fourStarCount: Number(r.fourStar),
    threeStarCount: Number(r.threeStar),
    twoStarCount: Number(r.twoStar),
    oneStarCount: Number(r.oneStar),
  }))

  return {
    meta: { totalRecords: tableData.length, generatedAt: new Date().toISOString(), appliedFilters, summary },
    columns: [
      { key: 'ticketNumber', label: 'Ticket #' },
      { key: 'ticketTitle', label: 'Title' },
      { key: 'client', label: 'Client' },
      { key: 'project', label: 'Project' },
      { key: 'module', label: 'Module' },
      { key: 'assignedResource', label: 'Resource' },
      { key: 'manager', label: 'Manager' },
      { key: 'closedDate', label: 'Closed Date', type: 'date' },
      { key: 'reviewSubmitted', label: 'Reviewed' },
      { key: 'rating', label: 'Rating' },
      { key: 'customerComment', label: 'Comment' },
      { key: 'reviewDate', label: 'Review Date', type: 'date' },
    ],
    data: tableData,
    charts,
    extras: {
      resourcePerformance: rpData,
      pagination: { page, pageSize, total: totalDataCount, totalPages: Math.ceil(totalDataCount / pageSize) },
    },
  }
})

export const getCustomerReviewDetail = wrapServerAction('getCustomerReviewDetail', async function getCustomerReviewDetail(ticketId: number) {
  // ── OPTIMIZATION: Replace 6+ sequential queries with batch parallel fetch ─
  // Before: 6+ sequential SELECTs (ticket → client → dev → project → manager
  //         → module → timeLog) — each waiting for the previous to complete.
  // After:  2-step parallel:
  //   Step 1: ticket+review JOIN fetches all IDs in one query
  //   Step 2: All user/project/module/timeLog queries run in PARALLEL
  const [detail] = await db
    .select({
      ticketNumber: ticket.ticketNumber, title: ticket.title, priority: ticket.priority, category: ticket.category,
      closedAt: ticket.closedAt, estimatedHours: ticket.estimatedHours, consumedHours: ticket.consumedHours,
      additionalHoursRequested: ticket.additionalHoursRequested,
      overallRating: ticketReview.overallRating, communicationRating: ticketReview.communicationRating,
      resolutionRating: ticketReview.resolutionRating, responseTimeRating: ticketReview.responseTimeRating,
      technicalRating: ticketReview.technicalRating, reviewComment: ticketReview.reviewComment,
      reviewCreatedAt: ticketReview.createdAt, clientId: ticket.clientId, assignedToId: ticket.assignedToId,
      projectId: ticket.projectId, moduleId: ticket.moduleId,
    })
    .from(ticket)
    .leftJoin(ticketReview, eq(ticket.id, ticketReview.ticketId))
    .where(eq(ticket.id, ticketId))
    .limit(1)

  if (!detail) throw new Error('Ticket not found')

  // Collect all IDs we need to fetch
  const userIds: string[] = [detail.clientId]
  if (detail.assignedToId) userIds.push(detail.assignedToId)
  let managerId: string | null = null

  // ── Step 2: Fetch all enrichment data in parallel ──────────────────────
  const [usersData, projectData, moduleData, timeResult] = await Promise.all([
    db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds)),
    detail.projectId
      ? db.select({ projectName: project.projectName, managerId: project.managerId }).from(project).where(eq(project.id, detail.projectId)).limit(1)
      : Promise.resolve([]),
    detail.moduleId
      ? db.select({ moduleName: moduleTable.moduleName }).from(moduleTable).where(eq(moduleTable.id, detail.moduleId)).limit(1)
      : Promise.resolve([]),
    db.select({ totalMinutes: sql<number>`COALESCE(SUM(${timeLog.durationMinutes}), 0)::int` }).from(timeLog).where(eq(timeLog.ticketId, ticketId)),
  ])

  const userMap = new Map(usersData.map(u => [u.id, u.name]))
  const clientName = userMap.get(detail.clientId) || '—'
  const assignedToName = detail.assignedToId ? userMap.get(detail.assignedToId) || '—' : '—'
  const projectName = projectData[0]?.projectName || '—'
  managerId = projectData[0]?.managerId || null
  const moduleName = moduleData[0]?.moduleName || '—'

  let managerName = '—'
  if (managerId) {
    const managerNames = managerId ? await db.select({ name: user.name }).from(user).where(eq(user.id, managerId)).limit(1) : []
    managerName = managerNames[0]?.name || '—'
  }

  const totalMinutes = Number(timeResult?.[0]?.totalMinutes) || 0
  const actualHours = Math.round((totalMinutes / 60) * 10) / 10

  return {
    ticketNumber: detail.ticketNumber, title: detail.title, priority: detail.priority, category: detail.category,
    clientName, projectName, moduleName, assignedToName, managerName,
    overallRating: detail.overallRating, communicationRating: detail.communicationRating,
    resolutionRating: detail.resolutionRating, responseTimeRating: detail.responseTimeRating,
    technicalRating: detail.technicalRating, reviewComment: detail.reviewComment || '—',
    reviewCreatedAt: detail.reviewCreatedAt, closedAt: detail.closedAt,
    estimatedHours: detail.estimatedHours || 0, actualHours,
    additionalHoursRequested: detail.additionalHoursRequested || 0,
    consumedHours: detail.consumedHours || 0,
  }
})

function formatDate(date: Date | string): string {
  try { return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return String(date) }
}

function formatMonthLabel(month: string): string {
  try {
    const [y, m] = month.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  } catch { return month }
}
