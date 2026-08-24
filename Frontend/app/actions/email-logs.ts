'use server'

import { db } from '@/lib/db'
import { emailLog } from '@/lib/db/schema'
import { desc, eq, and, sql } from 'drizzle-orm'
import { wrapServerAction } from '@/lib/performance-profiler'

// ─── Get Email Logs (paginated) ───────────────────────────────────────────
// Returns email log entries for the email logs page (future-ready).
// Supports filtering by status, event type, and pagination.

export const getEmailLogs = wrapServerAction('getEmailLogs', async function getEmailLogs(options?: {
  status?: string
  eventType?: string
  limit?: number
  offset?: number
}) {
  const limit = options?.limit ?? 50
  const offset = options?.offset ?? 0

  const conditions = []
  if (options?.status) {
    conditions.push(eq(emailLog.status, options.status))
  }
  if (options?.eventType) {
    conditions.push(eq(emailLog.eventType, options.eventType))
  }

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(emailLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(emailLog.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(emailLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ])

  return {
    logs: rows,
    total: Number(countResult[0]?.total) || 0,
    limit,
    offset,
  }
})

// ─── Get email stats (for dashboard widget) ───────────────────────────────
export const getEmailStats = wrapServerAction('getEmailStats', async function getEmailStats() {
  const [result] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      pending: sql<number>`COUNT(*) FILTER (WHERE ${emailLog.status} = 'pending')::int`,
      sent: sql<number>`COUNT(*) FILTER (WHERE ${emailLog.status} = 'sent')::int`,
      failed: sql<number>`COUNT(*) FILTER (WHERE ${emailLog.status} = 'failed')::int`,
      sentToday: sql<number>`COUNT(*) FILTER (WHERE ${emailLog.status} = 'sent' AND ${emailLog.createdAt} >= NOW() - INTERVAL '24 hours')::int`,
    })
    .from(emailLog)

  return {
    total: Number(result?.total) || 0,
    pending: Number(result?.pending) || 0,
    sent: Number(result?.sent) || 0,
    failed: Number(result?.failed) || 0,
    sentToday: Number(result?.sentToday) || 0,
  }
})
