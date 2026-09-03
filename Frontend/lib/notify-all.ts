// ============================================================================
// Notification Dispatcher — THE single entry point for all business-event
// notifications in SupportHub.
//
// Every business event must call dispatchNotification() and nothing else.
// The dispatcher is responsible for:
//   1. Recipient resolution      — batch-loads user records (email, name, role)
//   2. Recipient deduplication   — the same user can never be notified twice
//                                  for the same event (even via multiple roles)
//   3. Channel dispatch          — In-App + Email + Microsoft Teams
//   4. Duplicate protection      — a UNIQUE dedup_key in the notification_log
//                                  table (database-level) + pre-check
//   5. Structured logging        — one log line per dispatch for full tracing
//
// Email is delivered through the backend email bridge (lib/email-backend.ts) to
// the backend email service (provider-independent: console / Resend / Microsoft 365).
// Teams is delivered through the backend Teams bridge (lib/teams-backend.ts).
// In-App is written to the notification table (app/actions/notifications.ts).
//
// Business logic must NEVER call EmailService / TeamsService / createNotification
// directly — always route through dispatchNotification().
// ============================================================================

import { db } from '@/lib/db'
import { user as userTable, notificationLog } from '@/lib/db/schema'
import { eq, and, gte } from 'drizzle-orm'
import { createNotification } from '@/app/actions/notifications'
import { sendNotification } from '@/lib/email-backend'
import { sendTeamsNotificationToUser } from '@/lib/teams-backend'
import {
  canonicalNotificationEvent,
  loadDisabledInAppEvents,
} from '@/lib/notification-preferences'

// ─── Pure types & helpers ────────────────────────────────────────────────────
// They live in ./notification-utils (a zero-import module) so the logic is
// unit-testable in isolation. Imported here for local use and re-exported so
// existing importers of lib/notify-all keep working.

import {
  ALL_CHANNELS,
  buildDedupKey,
  dedupeRecipients,
  resolveChannels,
  shouldNotifyWalletLow,
  shouldNotifyWalletEmpty,
  WALLET_LOW_THRESHOLD,
} from './notification-utils'
import type {
  NotificationChannel,
  DispatchInApp,
  DispatchEmail,
  DispatchTeams,
  DispatchRecipient,
  DispatchOptions,
  DispatchChannelResult,
  DispatchResult,
} from './notification-utils'

export {
  ALL_CHANNELS,
  buildDedupKey,
  dedupeRecipients,
  resolveChannels,
  shouldNotifyWalletLow,
  shouldNotifyWalletEmpty,
  WALLET_LOW_THRESHOLD,
}
export type {
  NotificationChannel,
  DispatchInApp,
  DispatchEmail,
  DispatchTeams,
  DispatchRecipient,
  DispatchOptions,
  DispatchChannelResult,
  DispatchResult,
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

/**
 * Dispatch a business-event notification to one or more recipients across
 * In-App, Email, and Teams. Fire-and-forget friendly: never throws, never
 * blocks the caller on delivery failures.
 *
 * Dedup semantics: the dispatcher records a notification_log row per
 * (eventType, scope, recipient). If the same key already exists (and is within
 * the optional window), all channels are skipped for that recipient.
 */
export async function dispatchNotification(
  options: DispatchOptions,
): Promise<DispatchResult[]> {
  const { eventType, triggeredBy, recipients, metadata } = options
  const dedup = options.dedup === false ? null : (options.dedup ?? {})

  // 1. Recipient deduplication (Phase 9): one notification set per user.
  const uniqueRecipients = dedupeRecipients(recipients)
  if (uniqueRecipients.length === 0) return []

  // 2. Batch-resolve user records (email, name, role) in a single query.
  const userIds = uniqueRecipients.map(r => r.userId)
  let userMap = new Map<string, { id: string; email: string; name: string | null; role: string }>()
  try {
    const { inArray } = await import('drizzle-orm')
    const users = await db
      .select({ id: userTable.id, email: userTable.email, name: userTable.name, role: userTable.role })
      .from(userTable)
      .where(inArray(userTable.id, userIds))
    userMap = new Map(users.map(u => [u.id, u]))
  } catch (err) {
    console.error('[NotifyDispatcher] User resolution failed:', err instanceof Error ? err.message : err)
  }

  // Requirement #14 — per-event In-App preferences. The frontend CREATES the
  // in-app rows, so it enforces the In-App channel here; Email and Teams are
  // enforced server-side on the backend bridge routes. Recipients who
  // explicitly disabled this event on the In-App channel are skipped.
  const disabledInApp = await loadDisabledInAppEvents(userIds)
  const canonicalEvent = canonicalNotificationEvent(eventType)

  const results: DispatchResult[] = []

  for (const recipient of uniqueRecipients) {
    const channels = resolveChannels(recipient.channels)
    const user = userMap.get(recipient.userId)
    // Canonical key — always computed so the audit trail stays complete even
    // when dedup is disabled (e.g. the renewal-reminder weekly cap counts rows
    // from notification_log).
    const dedupKey = buildDedupKey(eventType, recipient.userId, dedup?.scope)

    if (!user) {
      results.push({
        userId: recipient.userId,
        dedupKey,
        skipped: true,
        skipReason: 'no_user',
        channels: { inApp: 'not_requested', email: 'not_requested', teams: 'not_requested' },
      })
      continue
    }

    // 3. Duplicate protection (Phase 6): refuse to re-dispatch.
    if (dedup) {
      const existing = await findExistingDispatch(dedupKey, dedup.windowMinutes)
      if (existing) {
        results.push({
          userId: recipient.userId,
          dedupKey,
          skipped: true,
          skipReason: 'duplicate',
          channels: { inApp: 'skipped', email: 'skipped', teams: 'skipped' },
        })
        continue
      }
      // Atomically CLAIM the key BEFORE any delivery: the DB unique index is the
      // real gate, so two concurrent dispatches of the same event can never both
      // deliver. A 'duplicate' result means another dispatch won the race.
      const claim = await insertDispatchLog({
        eventType,
        dedupKey,
        recipientUserId: recipient.userId,
        recipientEmail: user.email,
        triggeredBy,
        channels,
        metadata,
      })
      if (claim === 'duplicate') {
        results.push({
          userId: recipient.userId,
          dedupKey,
          skipped: true,
          skipReason: 'duplicate',
          channels: { inApp: 'skipped', email: 'skipped', teams: 'skipped' },
        })
        continue
      }
      // claim === 'error' (DB hiccup): fail OPEN — still deliver so business
      // notifications are never lost (availability over strict dedup).
    }

    // 4. Dispatch each requested channel (fire-and-forget).
    const channelResults: DispatchChannelResult = {
      inApp: 'not_requested',
      email: 'not_requested',
      teams: 'not_requested',
    }

    const inAppDisabled = canonicalEvent !== null
      && (disabledInApp.get(recipient.userId)?.has(canonicalEvent) ?? false)

    if (channels.includes('inApp') && recipient.inApp) {
      if (inAppDisabled) {
        channelResults.inApp = 'skipped'
      } else {
        await createNotification({
          userId: recipient.userId,
          title: recipient.inApp.title,
          message: recipient.inApp.message,
          link: recipient.inApp.link,
          ticketId: recipient.inApp.ticketId,
        }).catch((err: Error) => {
          console.error(`[NotifyDispatcher] in-app failed for ${eventType} → ${recipient.userId}:`, err.message)
        })
        channelResults.inApp = 'sent'
      }
    }

    if (channels.includes('email') && recipient.email) {
      const emailEventType = recipient.email.eventType ?? eventType
      sendNotification(emailEventType, user.email, {
        ...recipient.email.templateData,
        recipientName: user.name || undefined,
        recipientEmail: user.email,
      }).catch((err: Error) => {
        console.error(`[NotifyDispatcher] email failed for ${emailEventType} → ${recipient.userId}:`, err.message)
      })
      channelResults.email = 'sent'
    }

    if (channels.includes('teams') && recipient.teams) {
      const teamsEventType = recipient.teams.eventType ?? eventType
      sendTeamsNotificationToUser(recipient.userId, teamsEventType, recipient.teams.payload).catch((err: Error) => {
        console.error(`[NotifyDispatcher] teams failed for ${teamsEventType} → ${recipient.userId}:`, err.message)
      })
      channelResults.teams = 'sent'
    }

    // 5. Audit row for dedup-disabled dispatches (legitimate repeats). A unique
    // suffix keeps the row distinct under the dedup unique index so every repeat
    // remains countable (e.g. the renewal-reminder weekly cap).
    if (!dedup) {
      const auditKey = `${dedupKey}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
      await insertDispatchLog({
        eventType,
        dedupKey: auditKey,
        recipientUserId: recipient.userId,
        recipientEmail: user.email,
        triggeredBy,
        channels,
        metadata,
      })
    }

    // 6. Structured trace log.
    console.log(
      `[NotifyDispatcher] ${eventType} | triggeredBy=${triggeredBy} | recipient=${recipient.userId} | ` +
      `channels=${channels.join(',')} | dedupKey=${dedupKey} | inApp=${channelResults.inApp} | email=${channelResults.email} | teams=${channelResults.teams}`,
    )

    results.push({
      userId: recipient.userId,
      dedupKey,
      skipped: false,
      channels: channelResults,
    })
  }

  return results
}

// ─── Internal helpers ───────────────────────────────────────────────────────

async function findExistingDispatch(
  dedupKey: string,
  windowMinutes?: number,
): Promise<boolean> {
  try {
    const conditions = [eq(notificationLog.dedupKey, dedupKey)]
    if (windowMinutes && windowMinutes > 0) {
      const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000)
      conditions.push(gte(notificationLog.createdAt, cutoff))
    }
    const [row] = await db
      .select({ id: notificationLog.id })
      .from(notificationLog)
      .where(and(...conditions))
      .limit(1)
    return !!row
  } catch (err) {
    console.error('[NotifyDispatcher] dedup check failed (fail-open):', err instanceof Error ? err.message : err)
    return false
  }
}

async function insertDispatchLog(params: {
  eventType: string
  dedupKey: string
  recipientUserId: string
  recipientEmail: string | null
  triggeredBy: string
  channels: NotificationChannel[]
  metadata?: Record<string, unknown>
}): Promise<'inserted' | 'duplicate' | 'error'> {
  try {
    await db.insert(notificationLog).values({
      eventType: params.eventType,
      dedupKey: params.dedupKey,
      recipientUserId: params.recipientUserId,
      recipientEmail: params.recipientEmail,
      triggeredBy: params.triggeredBy,
      channels: params.channels,
      status: 'dispatched',
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    })
    return 'inserted'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Unique index violation = another dispatch won the race → key already claimed.
    if (message.includes('duplicate key') || /23505/.test(message)) {
      return 'duplicate'
    }
    console.error('[NotifyDispatcher] log insert failed:', message)
    return 'error'
  }
}

/**
 * Reset the dedup state for a given event + scope (e.g. after a wallet recharge
 * so wallet_low / wallet_empty can fire again on the next threshold crossing).
 */
export async function resetNotificationState(
  eventType: string,
  scope?: string,
): Promise<number> {
  try {
    // Trailing colon bounds the LIKE match so `wallet:1` never resets `wallet:12`.
    const prefix = `${eventType}:${scope ? scope + ':' : ''}`
    const { like } = await import('drizzle-orm')
    const [deleted] = await db
      .delete(notificationLog)
      .where(like(notificationLog.dedupKey, `${prefix}%`))
      .returning({ id: notificationLog.id })
    return deleted ? 1 : 0
  } catch (err) {
    console.error('[NotifyDispatcher] resetNotificationState failed:', err instanceof Error ? err.message : err)
    return 0
  }
}

// ─── Backward-compatible convenience helpers ────────────────────────────────
// These existed in the legacy notify-all.ts. They now delegate to the single
// dispatcher so no caller bypasses the unified path.

/**
 * @deprecated Use dispatchNotification(). Kept only for any lingering importers.
 */
export async function notifyAllToUser(params: {
  userId: string
  eventType: string
  title: string
  message: string
  link?: string
  ticketId?: number
  data?: Record<string, unknown>
}): Promise<DispatchResult[]> {
  return dispatchNotification({
    eventType: params.eventType,
    triggeredBy: 'system',
    recipients: [
      {
        userId: params.userId,
        inApp: { title: params.title, message: params.message, link: params.link, ticketId: params.ticketId },
        email: { templateData: params.data ?? {} },
        teams: { payload: params.data ?? {} },
      },
    ],
  })
}

/**
 * @deprecated Use dispatchNotification(). Kept only for any lingering importers.
 */
export async function notifyTeamsToUser(
  userId: string,
  eventType: string,
  data?: Record<string, unknown>,
): Promise<DispatchResult[]> {
  return dispatchNotification({
    eventType,
    triggeredBy: 'system',
    dedup: false,
    recipients: [
      {
        userId,
        channels: ['teams'],
        teams: { payload: data ?? {} },
      },
    ],
  })
}
