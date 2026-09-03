'use server'

import { getCurrentUser } from '@/lib/auth-utils'
import { getPortalUrl } from '@/lib/urls'
import { db } from '@/lib/db'
import { ticketReview, ticket, user, project } from '@/lib/db/schema'
import { eq, and, count, sql, desc, asc, avg, gte, lte } from 'drizzle-orm'
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache'
import { dispatchNotification } from '@/lib/notify-all'
import { wrapServerAction } from '@/lib/performance-profiler'

// ── Cache config: 120s TTL — reviews change only on user actions, not time.
// Using unstable_cache instead of in-memory Map for cross-instance dedup.
const REVIEW_CACHE_TTL = 120
const REVIEW_CACHE_TAGS = {
  ANALYTICS: 'review-analytics',
  RESOURCE_STATS: 'review-resource-stats',
} as const

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SubmitReviewData {
  ticketId: number
  overallRating: number
  communicationRating?: number | null
  resolutionRating?: number | null
  responseTimeRating?: number | null
  technicalRating?: number | null
  reviewComment?: string | null
  suggestions?: string | null
}

export interface ReviewWithDetails {
  id: number
  ticketId: number
  clientId: string
  assignedToId: string | null
  projectId: number | null
  overallRating: number
  communicationRating: number | null
  resolutionRating: number | null
  responseTimeRating: number | null
  technicalRating: number | null
  reviewComment: string | null
  suggestions: string | null
  createdAt: Date
  updatedAt: Date
  clientName?: string
  ticketNumber?: string
  ticketTitle?: string
  assignedToName?: string
}

export interface ReviewAnalytics {
  averageRating: number
  totalReviews: number
  fiveStarPercentage: number
  ratingDistribution: { rating: number; count: number }[]
  monthlyReviewCount: number
  lowestRatedTickets: any[]
  highestRatedTickets: any[]
  averageResolutionSatisfaction: number
}

export interface ResourceReviewStats {
  averageRating: number
  totalReviews: number
  fiveStarCount: number
  monthlyRatingTrend: { month: string; average: number; count: number }[]
  recentFeedback: any[]
}

// ─── Database error logging helper ──────────────────────────────────────────

function logDbError(context: string, error: unknown) {
  console.error(`[reviews] Database error in ${context}:`)
  if (error instanceof Error) {
    console.error(`  Type: ${error.constructor?.name || 'Error'}`)
    console.error(`  Message: ${error.message}`)
    console.error(`  Stack: ${error.stack}`)
    // Log PostgreSQL-specific properties if they exist
    const pgErr = error as any
    if (pgErr.code) console.error(`  PostgreSQL code: ${pgErr.code}`)
    if (pgErr.detail) console.error(`  Detail: ${pgErr.detail}`)
    if (pgErr.hint) console.error(`  Hint: ${pgErr.hint}`)
    if (pgErr.table) console.error(`  Table: ${pgErr.table}`)
    if (pgErr.column) console.error(`  Column: ${pgErr.column}`)
    if (pgErr.constraint) console.error(`  Constraint: ${pgErr.constraint}`)
    // Also check nested cause (Drizzle wraps pg errors)
    if ((pgErr as any).cause && typeof (pgErr as any).cause === 'object') {
      const cause = (pgErr as any).cause
      console.error(`  Caused by: ${cause.message || '(no message)'}`)
      if (cause.code) console.error(`  Cause code: ${cause.code}`)
      if (cause.detail) console.error(`  Cause detail: ${cause.detail}`)
    }
  } else {
    console.error(`  Raw error:`, error)
  }
}

// ─── Submit Review ───────────────────────────────────────────────────────────

export const submitReview = wrapServerAction('submitReview', async function submitReview(data: SubmitReviewData) {
  const currentUser = await getCurrentUser()

  if (currentUser.role !== 'client') {
    throw new Error('Only clients can submit reviews')
  }
  if (currentUser.userType !== 'approver') {
    throw new Error('Only Approver-type users can submit reviews. Contact your administrator to change your user type.')
  }

  // Validate ticket is closed and owned by client
  const [t] = await db
    .select({
      status: ticket.status,
      clientId: ticket.clientId,
      assignedToId: ticket.assignedToId,
      projectId: ticket.projectId,
      ticketNumber: ticket.ticketNumber,
    })
    .from(ticket)
    .where(eq(ticket.id, data.ticketId))
    .limit(1)

  if (!t) throw new Error('Ticket not found')
  if (t.clientId !== currentUser.id) throw new Error('You can only review your own tickets')
  if (t.status !== 'closed') throw new Error('Only closed tickets can be reviewed')

  // Check for existing review (one per ticket)
  let existing: any
  try {
    const [row] = await db
      .select({ id: ticketReview.id })
      .from(ticketReview)
      .where(eq(ticketReview.ticketId, data.ticketId))
      .limit(1)
    existing = row
  } catch (err) {
    logDbError('submitReview - check existing', err)
    throw new Error('A database error occurred while checking for existing reviews. Please try again.')
  }

  if (existing) throw new Error('A review for this ticket already exists')

  // Validate rating
  if (!data.overallRating || data.overallRating < 1 || data.overallRating > 5) {
    throw new Error('Overall rating is required and must be between 1 and 5')
  }

  const categoryRatings = [
    data.communicationRating,
    data.resolutionRating,
    data.responseTimeRating,
    data.technicalRating,
  ]
  for (const r of categoryRatings) {
    if (r !== null && r !== undefined && (r < 1 || r > 5)) {
      throw new Error('Category ratings must be between 1 and 5')
    }
  }

  let review: any
  try {
    const [row] = await db
      .insert(ticketReview)
      .values({
        ticketId: data.ticketId,
        clientId: currentUser.id,
        assignedToId: t.assignedToId,
        projectId: t.projectId,
        overallRating: data.overallRating,
        communicationRating: data.communicationRating ?? null,
        resolutionRating: data.resolutionRating ?? null,
        responseTimeRating: data.responseTimeRating ?? null,
        technicalRating: data.technicalRating ?? null,
        reviewComment: (data.reviewComment || '').trim().substring(0, 1000) || null,
        suggestions: (data.suggestions || '').trim().substring(0, 1000) || null,
      })
      .returning()
    review = row
  } catch (err) {
    logDbError('submitReview - insert', err)
    throw new Error('Failed to submit review due to a database error. Please try again.')
  }

  // Log activity in ticket history
  const { ticketHistory } = await import('@/lib/db/schema')
  await db.insert(ticketHistory).values({
    ticketId: data.ticketId,
    userId: currentUser.id,
    action: 'review_submitted',
    newValue: data.overallRating + ' stars',
  })

  // Notify the assigned resource (In-App + Teams). No email: the backend email
  // bridge has no review_submitted case — adding one here would silently drop.
  if (t.assignedToId) {
    const reviewLink = (getPortalUrl()) + '/dashboard/tickets/' + data.ticketId
    await dispatchNotification({
      eventType: 'review_submitted',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${data.ticketId}` },
      recipients: [
        {
          userId: t.assignedToId,
          inApp: {
            title: 'New Review Received',
            message: 'Client submitted a ' + data.overallRating + '-star review for Ticket #' + t.ticketNumber + '.' + (data.reviewComment ? ' "' + data.reviewComment.substring(0, 100) + '"' : ''),
            link: '/dashboard/tickets/' + data.ticketId,
            ticketId: data.ticketId,
          },
          teams: {
            payload: {
              ticketNumber: t.ticketNumber,
              overallRating: data.overallRating + '/5',
              url: reviewLink,
            },
          },
        },
      ],
    })
  }

  // Invalidate review analytics cache so dashboard shows fresh data immediately
  invalidateReviewAnalyticsCache()

  revalidatePath('/dashboard/tickets/' + data.ticketId)
  revalidatePath('/dashboard')
  return review
})

// ─── Edit Review (within 7 days) ─────────────────────────────────────────────

export const updateReview = wrapServerAction('updateReview', async function updateReview(data: SubmitReviewData) {
  const currentUser = await getCurrentUser()

  const [existing] = await db
    .select()
    .from(ticketReview)
    .where(and(eq(ticketReview.ticketId, data.ticketId), eq(ticketReview.clientId, currentUser.id)))
    .limit(1)

  if (!existing) throw new Error('Review not found')
  if (existing.clientId !== currentUser.id) throw new Error('You can only edit your own reviews')

  const daysSinceSubmission = Math.floor((Date.now() - new Date(existing.createdAt).getTime()) / (1000 * 60 * 60 * 24))
  if (daysSinceSubmission >= 7) {
    throw new Error('Reviews can only be edited within 7 days of submission')
  }

  if (!data.overallRating || data.overallRating < 1 || data.overallRating > 5) {
    throw new Error('Overall rating is required and must be between 1 and 5')
  }

  const [updated] = await db
    .update(ticketReview)
    .set({
      overallRating: data.overallRating,
      communicationRating: data.communicationRating ?? null,
      resolutionRating: data.resolutionRating ?? null,
      responseTimeRating: data.responseTimeRating ?? null,
      technicalRating: data.technicalRating ?? null,
      reviewComment: (data.reviewComment || '').trim().substring(0, 1000) || null,
      suggestions: (data.suggestions || '').trim().substring(0, 1000) || null,
      updatedAt: new Date(),
    })
    .where(eq(ticketReview.id, existing.id))
    .returning()

  const { ticketHistory } = await import('@/lib/db/schema')
  await db.insert(ticketHistory).values({
    ticketId: data.ticketId,
    userId: currentUser.id,
    action: 'review_updated',
    newValue: data.overallRating + ' stars',
  })

  // Invalidate review analytics cache so dashboard shows fresh data immediately
  invalidateReviewAnalyticsCache()

  revalidatePath('/dashboard/tickets/' + data.ticketId)
  revalidatePath('/dashboard')
  return updated
})

// ─── Get Review by Ticket ID ─────────────────────────────────────────────────

export const getReviewByTicketId = wrapServerAction('getReviewByTicketId', async function getReviewByTicketId(ticketId: number) {
  const currentUser = await getCurrentUser()

  let existing: any
  try {
    const [row] = await db
      .select()
      .from(ticketReview)
      .where(eq(ticketReview.ticketId, ticketId))
      .limit(1)
    existing = row
  } catch (err) {
    logDbError('getReviewByTicketId', err)
    return null
  }

  if (!existing) return null

  const isOwner = existing.clientId === currentUser.id
  const isAssignee = existing.assignedToId === currentUser.id
  const isManagerOrAdmin = currentUser.role === 'project_manager' || currentUser.role === 'admin'

  if (!isOwner && !isAssignee && !isManagerOrAdmin) {
    throw new Error('Access denied')
  }

  const daysSinceSubmission = Math.floor((Date.now() - new Date(existing.createdAt).getTime()) / (1000 * 60 * 60 * 24))
  const isEditable = isOwner && daysSinceSubmission < 7

  return { ...existing, isEditable }
})

// ─── Review Analytics Cache ────────────────────────────────────────────────
// Uses unstable_cache for cross-instance dedup (120s TTL).
// Invalidated via revalidateTag('review-analytics') on review mutations.

/**
 * Invalidate review analytics cache. Called after submitReview or updateReview.
 * Uses revalidateTag for cross-instance cache invalidation.
 */
export async function invalidateReviewAnalyticsCache() {
  revalidateTag(REVIEW_CACHE_TAGS.ANALYTICS, { expire: REVIEW_CACHE_TTL })
  revalidateTag(REVIEW_CACHE_TAGS.RESOURCE_STATS, { expire: REVIEW_CACHE_TTL })
}

// ─── Get Review Analytics (Manager/Admin) ────────────────────────────────────
//
// OPTIMIZATION: Reduced from 7 queries to 3 queries:
//   Before: 3 KPI queries + 1 distribution + 1 monthly count + 2 lowest/highest
//   After:  1 FILTER aggregate query (KPI + monthly count merged) + 1 distribution
//           + 1 CTE-based lowest/highest query (merged 2 into 1 with CASE/ORDER BY)
//
// Plus: 60-second in-memory caching eliminates repeated execution.
//
// Expected: ~1952ms → <200ms (filters) or <50ms (cache hit)

// ─── Query implementation (extracted for unstable_cache wrapper) ────────
async function _getReviewAnalyticsImpl(
  role: string,
  filtersSerialized: string,
): Promise<ReviewAnalytics> {
  const filters: any = filtersSerialized ? JSON.parse(filtersSerialized) : undefined

  // Build conditions
  const conditions = []
  if (filters?.projectId) conditions.push(eq(ticketReview.projectId, filters.projectId))
  if (filters?.clientId) conditions.push(eq(ticketReview.clientId, filters.clientId))
  if (filters?.resourceId) conditions.push(eq(ticketReview.assignedToId, filters.resourceId))
  if (filters?.startDate) conditions.push(gte(ticketReview.createdAt, new Date(filters.startDate)))
  if (filters?.endDate) conditions.push(lte(ticketReview.createdAt, new Date(filters.endDate)))

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined
  const thirtyDaysAgo = sql`now() - interval '30 days'`

  const [
    ratingStatsArr,
    distribution,
    lowestRatedTickets,
    highestRatedTickets,
  ] = await Promise.all([
    db
      .select({
        avgRating: avg(ticketReview.overallRating).mapWith(Number),
        total: count().mapWith(Number),
        fiveStar: sql<number>`COUNT(*) FILTER (WHERE overall_rating = 5)::int`.mapWith(Number),
        avgCommunication: avg(ticketReview.communicationRating).mapWith(Number),
        avgResolution: avg(ticketReview.resolutionRating).mapWith(Number),
        avgResponseTime: avg(ticketReview.responseTimeRating).mapWith(Number),
        avgTechnical: avg(ticketReview.technicalRating).mapWith(Number),
        monthlyReviewCount: sql<number>`COUNT(*) FILTER (WHERE created_at >= ${thirtyDaysAgo})::int`.mapWith(Number),
      })
      .from(ticketReview)
      .where(whereClause ?? sql`TRUE`),

    db
      .select({
        rating: ticketReview.overallRating,
        count: count().mapWith(Number),
      })
      .from(ticketReview)
      .where(whereClause ?? sql`TRUE`)
      .groupBy(ticketReview.overallRating)
      .orderBy(desc(ticketReview.overallRating)),

    db
      .select({
        id: ticketReview.id, ticketId: ticketReview.ticketId,
        overallRating: ticketReview.overallRating,
        reviewComment: ticketReview.reviewComment,
        createdAt: ticketReview.createdAt,
        ticketNumber: ticket.ticketNumber, ticketTitle: ticket.title,
        clientName: user.name,
      })
      .from(ticketReview)
      .leftJoin(ticket, eq(ticketReview.ticketId, ticket.id))
      .leftJoin(user, eq(ticketReview.clientId, user.id))
      .where(whereClause ?? sql`TRUE`)
      .orderBy(asc(ticketReview.overallRating), desc(ticketReview.createdAt))
      .limit(5),

    db
      .select({
        id: ticketReview.id, ticketId: ticketReview.ticketId,
        overallRating: ticketReview.overallRating,
        reviewComment: ticketReview.reviewComment,
        createdAt: ticketReview.createdAt,
        ticketNumber: ticket.ticketNumber, ticketTitle: ticket.title,
        clientName: user.name,
      })
      .from(ticketReview)
      .leftJoin(ticket, eq(ticketReview.ticketId, ticket.id))
      .leftJoin(user, eq(ticketReview.clientId, user.id))
      .where(whereClause ?? sql`TRUE`)
      .orderBy(desc(ticketReview.overallRating), desc(ticketReview.createdAt))
      .limit(5),
  ])

  const ratingStats = ratingStatsArr[0]
  const total = Number(ratingStats?.total) || 0
  const avgRating = Number(ratingStats?.avgRating) || 0
  const fiveStarCount = Number(ratingStats?.fiveStar) || 0
  const avgComm = Number(ratingStats?.avgCommunication) || 0
  const avgRes = Number(ratingStats?.avgResolution) || 0
  const avgResp = Number(ratingStats?.avgResponseTime) || 0
  const avgTech = Number(ratingStats?.avgTechnical) || 0
  const monthlyCountVal = Number(ratingStats?.monthlyReviewCount) || 0

  const dist: { rating: number; count: number }[] = []
  for (let i = 5; i >= 1; i--) {
    const found = distribution.find((d) => Number(d.rating) === i)
    dist.push({ rating: i, count: found ? Number(found.count) : 0 })
  }

  const categoryRatings = [avgComm, avgRes, avgResp, avgTech].filter((v) => v > 0)
  const avgResolutionSatisfaction = categoryRatings.length > 0
    ? categoryRatings.reduce((a, b) => a + b, 0) / categoryRatings.length
    : avgRating

  return {
    averageRating: Math.round(avgRating * 10) / 10,
    totalReviews: total,
    fiveStarPercentage: total > 0 ? Math.round((fiveStarCount / total) * 100) : 0,
    ratingDistribution: dist,
    monthlyReviewCount: monthlyCountVal,
    lowestRatedTickets: lowestRatedTickets.map((t: any) => ({
      id: t.id, ticketId: t.ticketId, overallRating: Number(t.overallRating),
      reviewComment: t.reviewComment, createdAt: t.createdAt,
      ticketNumber: t.ticketNumber, ticketTitle: t.ticketTitle,
      clientName: t.clientName,
    })),
    highestRatedTickets: highestRatedTickets.map((t: any) => ({
      id: t.id, ticketId: t.ticketId, overallRating: Number(t.overallRating),
      reviewComment: t.reviewComment, createdAt: t.createdAt,
      ticketNumber: t.ticketNumber, ticketTitle: t.ticketTitle,
      clientName: t.clientName,
    })),
    averageResolutionSatisfaction: Math.round(avgResolutionSatisfaction * 10) / 10,
  }
}

// ─── unstable_cache wrapper for getReviewAnalytics ─────────────────────
// Migrated from in-memory Map to unstable_cache for cross-instance dedup.
const getCachedReviewAnalytics = unstable_cache(
  async (cacheKey: string) => {
    const { role, filtersJson } = JSON.parse(cacheKey)
    return _getReviewAnalyticsImpl(role, filtersJson)
  },
  undefined,
  { revalidate: REVIEW_CACHE_TTL, tags: [REVIEW_CACHE_TAGS.ANALYTICS] },
)

export const getReviewAnalytics = wrapServerAction('getReviewAnalytics', async function getReviewAnalytics(filters?: {
  projectId?: number
  clientId?: string
  resourceId?: string
  startDate?: string
  endDate?: string
}) {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'admin' && currentUser.role !== 'project_manager') {
    throw new Error('Access denied')
  }

  const cacheKey = JSON.stringify({
    role: currentUser.role,
    filtersJson: JSON.stringify(filters || {}),
  })

  return getCachedReviewAnalytics(cacheKey)
})

// ─── Resource Review Stats: cached implementation (extracted for unstable_cache) ─
async function _getResourceReviewStatsImpl(userId: string): Promise<any> {
  const [stats] = await db
    .select({
      avgRating: avg(ticketReview.overallRating).mapWith(Number),
      total: count(),
      fiveStarCount: sql<number>`COUNT(*) FILTER (WHERE overall_rating = 5)::int`,
    })
    .from(ticketReview)
    .where(eq(ticketReview.assignedToId, userId))

  const total = Number(stats?.total) || 0
  const avgRating = Number(stats?.avgRating) || 0
  const fiveStarCount = Number(stats?.fiveStarCount) || 0

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const [monthlyRows, recentFeedback] = await Promise.all([
    db
      .select({
        month: sql<string>`to_char(created_at, 'YYYY-MM')`,
        average: avg(ticketReview.overallRating).mapWith(Number),
        count: count().mapWith(Number),
      })
      .from(ticketReview)
      .where(and(eq(ticketReview.assignedToId, userId), gte(ticketReview.createdAt, sixMonthsAgo)))
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM')`),
    db
      .select({
        id: ticketReview.id,
        overallRating: ticketReview.overallRating,
        reviewComment: ticketReview.reviewComment,
        createdAt: ticketReview.createdAt,
        ticketNumber: ticket.ticketNumber,
        ticketTitle: ticket.title,
      })
      .from(ticketReview)
      .leftJoin(ticket, eq(ticketReview.ticketId, ticket.id))
      .where(eq(ticketReview.assignedToId, userId))
      .orderBy(desc(ticketReview.createdAt))
      .limit(10),
  ])

  return {
    averageRating: Math.round(avgRating * 10) / 10,
    totalReviews: total,
    fiveStarCount,
    monthlyRatingTrend: monthlyRows.map((r) => ({
      month: r.month,
      average: Math.round(Number(r.average) * 10) / 10,
      count: Number(r.count),
    })),
    recentFeedback: recentFeedback.map((r) => ({
      ...r,
      overallRating: Number(r.overallRating),
    })),
  }
}

// ─── unstable_cache wrapper for getResourceReviewStats ──────────────────
const getCachedResourceReviewStats = unstable_cache(
  async (userId: string) => _getResourceReviewStatsImpl(userId),
  undefined,
  { revalidate: REVIEW_CACHE_TTL, tags: [REVIEW_CACHE_TAGS.RESOURCE_STATS] },
)

// ─── Get Resource Review Stats (for developer dashboard) ────────────────────
export const getResourceReviewStats = wrapServerAction('getResourceReviewStats', async function getResourceReviewStats() {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'developer') {
    throw new Error('Access denied')
  }
  return getCachedResourceReviewStats(currentUser.id)
})

// ─── Get Reviews List (paginated, for admin/manager review reports) ─────────

export const getReviewsList = wrapServerAction('getReviewsList', async function getReviewsList(options?: {
  limit?: number
  offset?: number
  projectId?: number
  clientId?: string
  resourceId?: string
  minRating?: number
  maxRating?: number
  sortBy?: 'newest' | 'oldest' | 'highest' | 'lowest'
}) {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'admin' && currentUser.role !== 'project_manager') {
    throw new Error('Access denied')
  }

  const limit = options?.limit ?? 50
  const offset = options?.offset ?? 0

  const conditions = []
  if (options?.projectId) conditions.push(eq(ticketReview.projectId, options.projectId))
  if (options?.clientId) conditions.push(eq(ticketReview.clientId, options.clientId))
  if (options?.resourceId) conditions.push(eq(ticketReview.assignedToId, options.resourceId))
  if (options?.minRating) conditions.push(gte(ticketReview.overallRating, options.minRating))
  if (options?.maxRating) conditions.push(lte(ticketReview.overallRating, options.maxRating))

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  let orderByClause
  switch (options?.sortBy) {
    case 'oldest':
      orderByClause = asc(ticketReview.createdAt)
      break
    case 'highest':
      orderByClause = desc(ticketReview.overallRating)
      break
    case 'lowest':
      orderByClause = asc(ticketReview.overallRating)
      break
    default:
      orderByClause = desc(ticketReview.createdAt)
  }

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: ticketReview.id,
        ticketId: ticketReview.ticketId,
        overallRating: ticketReview.overallRating,
        reviewComment: ticketReview.reviewComment,
        suggestions: ticketReview.suggestions,
        createdAt: ticketReview.createdAt,
        updatedAt: ticketReview.updatedAt,
        ticketNumber: ticket.ticketNumber,
        ticketTitle: ticket.title,
        clientName: user.name,
        assignedToName: sql<string>`COALESCE((SELECT name FROM "user" WHERE id = ${ticketReview.assignedToId}), 'Unassigned')`,
      })
      .from(ticketReview)
      .leftJoin(ticket, eq(ticketReview.ticketId, ticket.id))
      .leftJoin(user, eq(ticketReview.clientId, user.id))
      .where(whereClause ?? sql`1=1`)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset),

    db
      .select({ count: count().mapWith(Number) })
      .from(ticketReview)
      .where(whereClause ?? sql`1=1`),
  ])

  return {
    reviews: rows.map((r) => ({
      ...r,
      overallRating: Number(r.overallRating),
    })),
    total: Number(countResult[0]?.count) || 0,
  }
})

// ─── Get Review Exists (lightweight check for UI) ───────────────────────────

export const getReviewExists = wrapServerAction('getReviewExists', async function getReviewExists(ticketId: number) {
  try {
    const [existing] = await db
      .select({ id: ticketReview.id })
      .from(ticketReview)
      .where(eq(ticketReview.ticketId, ticketId))
      .limit(1)

    return !!existing
  } catch (err) {
    logDbError('getReviewExists', err)
    return false
  }
})
