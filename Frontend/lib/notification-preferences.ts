// ============================================================================
// Notification Preferences — Frontend mirror (Requirement #14)
// ============================================================================
// The per-user, per-channel, per-event notification preferences are stored in
// the SHARED database's `notification_preferences` table (backend migration
// 0015) and are authoritative. The backend (Express) enforces Email and Teams
// prefs server-side on its bridge routes; the frontend is the layer that
// actually CREATES in-app notifications, so it must enforce the In-App
// channel itself before inserting a row.
//
// This module mirrors the canonical event catalog from the backend
// (src/lib/notification-preferences.ts) so any eventType spelling used by
// frontend server actions resolves to the same preference key the backend
// enforces. Keep the alias map in sync with the backend copy.
//
// An ABSENT preference row means "use the default" (In-App enabled), so the
// loader below only returns events the user has EXPLICITLY disabled.
// ============================================================================

import { pool } from '@/lib/db'

/** Canonical preference keys (mirrors backend src/lib/notification-preferences.ts). */
export const NOTIFICATION_EVENT_CANONICAL: Record<string, string> = {
  // Ticket workflow
  ticket_created: 'ticket_created',
  ticket_assigned: 'ticket_assigned',
  ticket_reassigned: 'ticket_assigned',
  manager_review: 'manager_review',
  client_review: 'client_review',
  ticket_resolved: 'client_review',
  awaiting_client_review: 'client_review',
  rework: 'rework',
  request_for_revision: 'request_for_revision',
  revision_requested: 'request_for_revision',
  ticket_revision_requested: 'request_for_revision',
  ticket_closed: 'ticket_closed',
  ticket_reopened: 'ticket_reopened',
  // Estimates & hours
  estimate_requested: 'estimate_requested',
  estimate_approved: 'estimate_approved',
  estimate_auto_approved: 'estimate_approved',
  estimate_updated: 'estimate_updated',
  estimate_modified: 'estimate_updated',
  estimate_reminder: 'estimate_reminder',
  estimate_clarification_requested: 'estimate_clarification_requested',
  estimate_rejected: 'estimate_rejected',
  additional_hours_requested: 'additional_hours_requested',
  additional_hours: 'additional_hours_requested',
  additional_hours_approved: 'additional_hours_approved',
  additional_hours_auto_approved: 'additional_hours_approved',
  additional_hours_rejected: 'additional_hours_rejected',
  // Work activity
  developer_started_work: 'developer_started_work',
  developer_completed_work: 'developer_completed_work',
  revision_approved: 'revision_approved',
  revision_rejected: 'revision_rejected',
  // Support wallet
  wallet_low: 'wallet_low',
  wallet_empty: 'wallet_empty',
  support_hours_added: 'support_hours_added',
  support_hours_assigned: 'support_hours_added',
  // Account & product
  customer_created: 'customer_created',
  account_activated: 'account_activated',
  welcome: 'welcome',
  new_project: 'new_project',
  password_reset: 'password_reset',
  password_reset_requested: 'password_reset',
  login_credentials: 'login_credentials',
  support_renewal_reminder: 'support_renewal_reminder',
}

export type NotificationChannel = 'in_app' | 'email' | 'teams'

/** Resolve any eventType spelling to its canonical preference key. */
export function canonicalNotificationEvent(eventType: string | null | undefined): string | null {
  if (!eventType) return null
  return NOTIFICATION_EVENT_CANONICAL[eventType] ?? null
}

/**
 * Load the set of explicitly DISABLED in-app events per user.
 * userId → Set<canonicalEvent>. Fail-open: any DB hiccup (e.g. the
 * notification_preferences table does not exist yet because migration 0015
 * has not been applied) returns an empty index, i.e. current behavior —
 * nothing is suppressed.
 */
export async function loadDisabledInAppEvents(
  userIds: string[],
): Promise<Map<string, Set<string>>> {
  const index = new Map<string, Set<string>>()
  const unique = [...new Set(userIds)].filter(Boolean)
  if (unique.length === 0) return index

  try {
    const result = await pool.query<{ userId: string; eventType: string; enabled: boolean }>(
      `SELECT "userId", "eventType", "enabled"
         FROM notification_preferences
        WHERE "userId" = ANY($1::text[]) AND "channel" = 'in_app'`,
      [unique],
    )
    for (const row of result.rows) {
      if (row.enabled) continue
      const canonical = canonicalNotificationEvent(row.eventType)
      if (!canonical) continue
      let set = index.get(row.userId)
      if (!set) {
        set = new Set<string>()
        index.set(row.userId, set)
      }
      set.add(canonical)
    }
    return index
  } catch (err) {
    // Fail open — preference lookup must never break business notifications.
    console.error(
      '[NotificationPreferences] In-app preference lookup failed (proceeding with defaults):',
      err instanceof Error ? err.message : String(err),
    )
    return index
  }
}
