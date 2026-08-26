// ============================================================================
// Backend Email Notification Helper
// ============================================================================
//
// Bridges frontend Next.js server actions with the backend email notification
// service. This is a fire-and-forget helper — it NEVER blocks the caller and
// NEVER throws on failure.
//
// Usage:
//   import { sendNotification } from '@/lib/email-backend'
//
//   // After DB commit (fire-and-forget):
//   sendNotification('ticket_created', 'manager@example.com', { ...data })
// ============================================================================

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'

/**
 * Fire-and-forget email notification via the backend email service.
 *
 * @param eventType - The email event type (e.g., 'ticket_created', 'customer_created')
 * @param to - Recipient email address or array of addresses
 * @param data - Template data specific to the event type
 * @param options - Optional settings (immediate, etc.)
 *
 * This function NEVER throws — all errors are caught and logged server-side.
 */
export async function sendNotification(
  eventType: string,
  to: string | string[],
  data: Record<string, unknown>,
  options?: { immediate?: boolean },
): Promise<void> {
  try {
    const { headers } = await import('next/headers')
    const cookieHeader = await headers()
    const sessionCookie = cookieHeader.get('cookie') || ''

    const response = await fetch(`${BACKEND_URL}/email/notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        
      },
      
      body: JSON.stringify({
        eventType,
        to,
        data,
        immediate: options?.immediate ?? false,
      }),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      console.error(`[EmailBackend] HTTP ${response.status} for ${eventType}: ${text}`)
    }
  } catch (err) {
    console.error(`[EmailBackend] Failed to send ${eventType}:`, err instanceof Error ? err.message : err)
  }
}

/**
 * Resolve a user\'s email by their user ID and send them a notification.
 */
export async function sendNotificationToUser(
  userId: string,
  eventType: string,
  data: Record<string, unknown>,
  options?: { immediate?: boolean },
): Promise<void> {
  try {
    const { db } = await import('@/lib/db')
    const { user } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')

    const [found] = await db
      .select({ email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)

    if (!found) {
      console.warn(`[EmailBackend] User not found for sendNotificationToUser: ${userId}`)
      return
    }

    const enrichedData = {
      ...data,
      recipientName: found.name || undefined,
      recipientEmail: found.email,
    }

    await sendNotification(eventType, found.email, enrichedData, options)
  } catch (err) {
    console.error(`[EmailBackend] sendNotificationToUser failed for ${userId}:`, err instanceof Error ? err.message : err)
  }
}

/**
 * Resolve multiple users\' emails by their IDs and send them a notification.
 */
export async function sendNotificationToUsers(
  userIds: string[],
  eventType: string,
  data: Record<string, unknown>,
  options?: { immediate?: boolean },
): Promise<void> {
  if (userIds.length === 0) return

  try {
    const { db } = await import('@/lib/db')
    const { user } = await import('@/lib/db/schema')
    const { inArray } = await import('drizzle-orm')

    const users = await db
      .select({ id: user.id, email: user.email, name: user.name })
      .from(user)
      .where(inArray(user.id, userIds))

    for (const u of users) {
      const enrichedData = {
        ...data,
        recipientName: u.name || undefined,
        recipientEmail: u.email,
      }

      await sendNotification(eventType, u.email, enrichedData, options)
    }
  } catch (err) {
    console.error(`[EmailBackend] sendNotificationToUsers failed:`, err instanceof Error ? err.message : err)
  }
}
