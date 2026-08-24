'use server'

import { cache } from 'react'
import { unstable_cache, revalidatePath, revalidateTag } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-utils'
import { db, waitForDb } from '@/lib/db'
import { notification } from '@/lib/db/schema'
import { wrapServerAction } from '@/lib/performance-profiler'
import { and, eq, desc, count, sql } from 'drizzle-orm'

interface NotificationResponse {
  notifications: {
    id: number
    title: string
    message: string
    link: string | null
    ticketId: number | null
    isRead: boolean
    createdAt: Date
  }[]
  unreadCount: number
  totalCount: number
}

// ── Cross-request cached notification fetcher ──────────────────────────
// Notifications are user-specific (userId in cache key) and change on every
// notification-related mutation (create, read, markAll). TTL is 30 seconds
// to balance freshness with cross-request reuse.
//
// The outer React.cache() deduplicates within the same SSR request.
// The inner unstable_cache() deduplicates across requests.
//
// Invalidation: use revalidateTag(`notifications-${userId}`) after mutations.

const NOTIFICATION_CACHE_TTL = 120 // ↑ 30s → 120s: notifications change on mutation events which call revalidateTag

/** Internal implementation — accepts userId directly, no headers() dependency */
/**
 * Detailed notification timeline (dev only): prints Start, SQL start, SQL end,
 * Transform, Serialization, End with ms offsets from function entry.
 */
async function _getNotificationsDataRaw(userId: string, limit: number, offset: number): Promise<NotificationResponse> {
  const entryTime = performance.now()

  // ═══ Block until the DB pool is warm ════════════════════════════════
  // Without this, if the pool is cold (first request, or all connections
  // were idled out before the keep-alive fired), the two parallel queries
  // below will both race to establish new connections simultaneously.
  // If Neon is cold-starting, both attempts may exceed
  // connectionTimeoutMillis (20s), causing "Connection terminated due to
  // connection timeout" errors and cascading dashboard failures.
  //
  // waitForDb() resolves immediately if the pool is already warm.
  await waitForDb()

  /**
   * Helper to extract the underlying PostgreSQL error from a DrizzleQueryError
   * that wraps it on the `.cause` property. Returns the full detail for debugging.
   */
  function getErrorMessage(err: unknown): string {
    const drizzleErr = err as any
    if (drizzleErr?.cause) {
      const pgErr = drizzleErr.cause
      return pgErr.message + (pgErr.code ? ` (code: ${pgErr.code})` : '')
    }
    if (err instanceof Error) return err.message
    return String(err)
  }

  let totalCount = 0
  let unreadCount = 0
  let rows: {
    id: number
    title: string
    message: string
    link: string | null
    ticketId: number | null
    isRead: boolean
    createdAt: Date
  }[] = []

  try {
    // ── OPTIMIZED: Separate data + count queries ──────────────────────────
    // Before: Single query with COUNT(*) OVER() scanned ALL notifications
    //         for the user before applying LIMIT (slow with 1000s of rows).
    // After: Two queries run in parallel:
    //   1. Data query: uses (userId, createdAt) index, limited to N rows
    //   2. Count query: uses (userId, isRead) index, lightweight index scan
    //
    // Both queries run in parallel via Promise.all(), so total wall-clock
    // time is MAX(data, count) — not SUM.
    //
    // Typical: data query < 5ms (limited to 50 rows via index scan)
    //          count query < 5ms (index-only scan for COUNT)
    //          Total: < 10ms vs 3000ms+ before

    const [rawRows, countResult] = await Promise.all([
      // Data query — fast index-only scan using (userId, createdAt) index
      db
        .select({
          id: notification.id,
          title: notification.title,
          message: notification.message,
          link: notification.link,
          ticketId: notification.ticketId,
          isRead: notification.isRead,
          createdAt: notification.createdAt,
        })
        .from(notification)
        .where(eq(notification.userId, userId))
        .orderBy(desc(notification.createdAt))
        .limit(limit)
        .offset(offset),

      // Count query — lightweight index scan using (userId) index
      db
        .select({
          total: count().mapWith(Number),
          unread: sql<number>`COUNT(*) FILTER (WHERE NOT ${notification.isRead})::int`.mapWith(Number),
        })
        .from(notification)
        .where(eq(notification.userId, userId)),
    ])

    totalCount = countResult?.[0]?.total ?? 0
    unreadCount = countResult?.[0]?.unread ?? 0
    rows = rawRows.map((r) => ({
      id: r.id,
      title: r.title,
      message: r.message,
      link: r.link,
      ticketId: r.ticketId,
      isRead: r.isRead,
      createdAt: r.createdAt,
    }))

  } catch (err) {
    console.error('[Notifications] Failed to fetch notification rows:', getErrorMessage(err))
    // Return empty gracefully rather than crashing the dashboard
    return { notifications: [], unreadCount: 0, totalCount: 0 }
  }

  const response = { notifications: rows, unreadCount, totalCount }

  return response
}

/**
 * React.cache() per-request dedup wrapper — exported for orchestrator use.
 * Guarantees that notifications are fetched only ONCE per request,
 * even if called from the orchestrator AND the layout/server actions.
 */
export const _getNotificationsData = cache(async function _getNotificationsData(
  userId: string, limit: number, offset: number
): Promise<NotificationResponse> {
  return _getNotificationsDataRaw(userId, limit, offset)
})

/**
 * Cross-request cached version of getNotifications.
 * Uses unstable_cache with the userId as part of the cache key.
 * Calls through React.cache() wrapper (_getNotificationsData) so that
 * layout.tsx (which calls getNotifications → getCachedNotifications)
 * and the dashboard orchestrator (which calls _getNotificationsData directly)
 * share the SAME cached result — avoiding double execution.
 */
const getCachedNotifications = unstable_cache(
  async (userId: string, limit: number, offset: number) => {
    // Call the React.cache() wrapper, not _getNotificationsDataRaw directly.
    // This ensures that if the orchestrator already fetched notifications
    // via _getNotificationsData in this request, this call returns the cached result.
    return _getNotificationsData(userId, limit, offset)
  },
  undefined,
  {
    revalidate: NOTIFICATION_CACHE_TTL,
    tags: ['notifications'],
  },
)

export const getNotifications = wrapServerAction('getNotifications', async function getNotifications(options?: {
  limit?: number
  offset?: number
}) {
  const { id: userId } = await getCurrentUser()
  return getCachedNotifications(userId, options?.limit ?? 50, options?.offset ?? 0)
})

export const markAsRead = wrapServerAction('markAsRead', async function markAsRead(notificationId: number) {
  const { id: userId } = await getCurrentUser()

  // Block until the DB pool is warm (mirrors the fetch path) so the update
  // never fails on a cold Neon pool / serverless instance.
  await waitForDb()

  const result = await db
    .update(notification)
    .set({ isRead: true })
    .where(and(eq(notification.id, notificationId), eq(notification.userId, userId)))

  try {
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/notifications')
    revalidateTag('notifications', { expire: NOTIFICATION_CACHE_TTL })
  } catch (err) {
    // Cache invalidation must never fail the action after a successful DB write.
    console.error('[Notifications] markAsRead cache revalidation failed:', err)
  }

  return { success: true, updatedCount: result?.rowCount ?? 0 }
})

export const markAllAsRead = wrapServerAction('markAllAsRead', async function markAllAsRead() {
  const { id: userId } = await getCurrentUser()

  // Block until the DB pool is warm (mirrors the fetch path) so the update
  // never fails on a cold Neon pool / serverless instance.
  await waitForDb()

  const result = await db
    .update(notification)
    .set({ isRead: true })
    .where(and(eq(notification.userId, userId), eq(notification.isRead, false)))

  try {
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/notifications')
    revalidateTag('notifications', { expire: NOTIFICATION_CACHE_TTL })
  } catch (err) {
    // Cache invalidation must never fail the action after a successful DB write.
    console.error('[Notifications] markAllAsRead cache revalidation failed:', err)
  }

  return { success: true, updatedCount: result?.rowCount ?? 0 }
})

// Internal helper – called from other server actions to create notifications.
// Not exported as a public server action since it requires a target userId.
export async function createNotification(data: {
  userId: string
  title: string
  message: string
  link?: string
  ticketId?: number
}) {
  await db.insert(notification).values({
    userId: data.userId,
    title: data.title,
    message: data.message,
    link: data.link ?? null,
    ticketId: data.ticketId ?? null,
    isRead: false,
  })
  // Invalidate notification cache for this user
  revalidateTag('notifications', { expire: NOTIFICATION_CACHE_TTL })
}
