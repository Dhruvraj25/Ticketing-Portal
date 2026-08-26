// ============================================================================
// Backend Teams Notification Helper
// ============================================================================

import { shouldSendTeamsForUser } from '@/lib/notification-utils'
//
// Bridges frontend Next.js server actions with the backend Teams notification
// service. Fire-and-forget — NEVER blocks the caller, NEVER throws.
//
// Usage:
//   import { sendTeamsNotification } from '@/lib/teams-backend'
//   sendTeamsNotification('ticket_created', { title: '...', message: '...' })
// ============================================================================

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'

/**
 * Fire-and-forget Teams notification via the backend Teams service.
 */
export async function sendTeamsNotification(
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { headers } = await import('next/headers')
    const cookieHeader = await headers()
    const sessionCookie = cookieHeader.get('cookie') || ''

    const response = await fetch(`${BACKEND_URL}/teams/notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({ eventType, payload }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      console.error(`[TeamsBackend] HTTP ${response.status} for ${eventType}: ${text}`)
    }
  } catch (err) {
    console.error(`[TeamsBackend] Failed to send ${eventType}:`, err instanceof Error ? err.message : err)
  }
}

/**
 * Resolve a user's info and send them a Teams notification.
 */
export async function sendTeamsNotificationToUser(
  userId: string,
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const { db } = await import('@/lib/db')
    const { user } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')

    const [found] = await db
      .select({ name: user.name, email: user.email, role: user.role, enableTeamsNotifications: user.enableTeamsNotifications })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)

    if (!found) {
      console.warn(`[TeamsBackend] User not found: ${userId}`)
      return
    }

    // Respect the customer preference — customer (client) accounts that disabled
    // Teams notifications skip the Teams channel post. In-app and email
    // notifications are unaffected (they never pass through here). Internal staff
    // (admins/managers/developers) always receive Teams posts — the customer
    // preference controls the customer's own notifications only.
    if (!shouldSendTeamsForUser(found.role, found.enableTeamsNotifications)) {
      console.log(`[TeamsBackend] Skipping Teams notification for ${userId} (customer Teams notifications disabled)`)
      return
    }

    await sendTeamsNotification(eventType, {
      ...data,
      recipientName: found.name || undefined,
      recipientEmail: found.email,
      recipientUserId: userId,
    })
  } catch (err) {
    console.error(`[TeamsBackend] Failed for ${userId}:`, err instanceof Error ? err.message : err)
  }
}
