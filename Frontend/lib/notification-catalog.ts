// ============================================================================
// Notification Event Catalog — frontend mirror (client-wise management)
// ============================================================================
// This module mirrors the CANONICAL event catalog owned by the backend
// (Backend/src/lib/notification-preferences.ts — the source of truth used by
// the Express API GET/PUT /api/notifications/preferences and by every channel
// dispatcher). It must stay in sync with that backend copy. The backend's
// notification_preferences table is stored in the SHARED database, so the
// Next.js server actions in app/actions/client-notification-preferences.ts
// read/write the very same rows the backend enforces at dispatch time.
//
// It is intentionally dependency-free (no DB, no React) so the resolution
// logic can be tested in isolation.
//
// An ABSENT preference row means "use the default":
//   - In-App : enabled
//   - Email  : enabled
//   - Teams  : client users follow the customer-level enable_teams_notifications
//              flag (default OFF); internal staff are always enabled. Per-event
//              rows override this default.
// ============================================================================

export type NotificationChannel = 'in_app' | 'email' | 'teams'

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ['in_app', 'email', 'teams']

/** Human-readable channel labels (settings UI / API). */
export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'In-App',
  email: 'Email',
  teams: 'Teams',
}

// ─── Event Catalog ─────────────────────────────────────────────────────────
// One entry per distinct notification event a client can toggle, with the
// group label used by the settings UI. Aliases map non-canonical eventType
// spellings (email / Teams / in-app senders) to this single preference key.

export interface NotificationEventDefinition {
  eventType: string
  label: string
  /** Group used by the settings UI. */
  group: string
  aliases?: string[]
}

export const NOTIFICATION_EVENTS: NotificationEventDefinition[] = [
  // ── Ticket workflow ────────────────────────────────────────────────────
  { eventType: 'ticket_created', label: 'New ticket created', group: 'Tickets' },
  { eventType: 'ticket_assigned', label: 'Ticket assigned to me', group: 'Tickets', aliases: ['ticket_reassigned'] },
  { eventType: 'manager_review', label: 'Ticket ready for manager review', group: 'Tickets' },
  { eventType: 'client_review', label: 'Ticket awaiting my review', group: 'Tickets', aliases: ['ticket_resolved', 'awaiting_client_review'] },
  { eventType: 'rework', label: 'Rework requested', group: 'Tickets' },
  { eventType: 'request_for_revision', label: 'Revision requested', group: 'Tickets', aliases: ['revision_requested', 'ticket_revision_requested'] },
  { eventType: 'ticket_closed', label: 'Ticket closed', group: 'Tickets' },
  { eventType: 'ticket_reopened', label: 'Ticket reopened', group: 'Tickets' },
  // ── Estimates & hours (approval workflow) ──────────────────────────────
  { eventType: 'estimate_requested', label: 'Estimate awaiting approval', group: 'Approvals' },
  { eventType: 'estimate_approved', label: 'Estimate approved', group: 'Approvals' },
  { eventType: 'estimate_rejected', label: 'Estimate rejected', group: 'Approvals' },
  { eventType: 'additional_hours_requested', label: 'Additional hours requested', group: 'Approvals', aliases: ['additional_hours'] },
  { eventType: 'additional_hours_approved', label: 'Additional hours approved', group: 'Approvals' },
  { eventType: 'additional_hours_rejected', label: 'Additional hours rejected', group: 'Approvals' },
  // ── Work activity ──────────────────────────────────────────────────────
  { eventType: 'developer_started_work', label: 'Developer started work', group: 'Work activity' },
  { eventType: 'developer_completed_work', label: 'Developer completed work', group: 'Work activity' },
  { eventType: 'revision_approved', label: 'Revision approved', group: 'Work activity' },
  { eventType: 'revision_rejected', label: 'Revision rejected', group: 'Work activity' },
  // ── Support wallet ─────────────────────────────────────────────────────
  { eventType: 'wallet_low', label: 'Wallet balance low', group: 'Support wallet' },
  { eventType: 'wallet_empty', label: 'Wallet balance empty', group: 'Support wallet' },
  { eventType: 'support_hours_added', label: 'Support hours added', group: 'Support wallet', aliases: ['support_hours_assigned'] },
  // ── Account & product ──────────────────────────────────────────────────
  { eventType: 'customer_created', label: 'Customer account created', group: 'Account' },
  { eventType: 'account_activated', label: 'Account activated', group: 'Account' },
  { eventType: 'welcome', label: 'Welcome email', group: 'Account' },
  { eventType: 'new_project', label: 'New project', group: 'Account' },
  { eventType: 'password_reset', label: 'Password reset', group: 'Account', aliases: ['password_reset_requested'] },
  { eventType: 'login_credentials', label: 'Login credentials', group: 'Account' },
  { eventType: 'support_renewal_reminder', label: 'Support renewal reminder', group: 'Account' },
]

/** All canonical event keys. */
export const NOTIFICATION_EVENT_KEYS: string[] = NOTIFICATION_EVENTS.map(e => e.eventType)

const NOTIFICATION_EVENT_CANONICAL: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const def of NOTIFICATION_EVENTS) {
    map[def.eventType] = def.eventType
    for (const alias of def.aliases ?? []) map[alias] = def.eventType
  }
  return map
})()

/** Resolve any event-type spelling (canonical or alias) to its canonical key. */
export function canonicalNotificationEvent(eventType: string | null | undefined): string | null {
  if (!eventType) return null
  return NOTIFICATION_EVENT_CANONICAL[eventType] ?? null
}

/** True when the string is a known notification event (canonical or alias). */
export function isKnownNotificationEvent(eventType: string): boolean {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_EVENT_CANONICAL, eventType)
}

// ─── Defaults ──────────────────────────────────────────────────────────────
// Keep in sync with the backend's lib/notification-preferences.ts.

export interface NotificationUserDefaults {
  role: string
  enableTeamsNotifications?: boolean
}

/** Default (no explicit row) state of a channel/event for a user. */
export function defaultNotificationEnabled(
  channel: NotificationChannel,
  user: NotificationUserDefaults,
): boolean {
  if (channel === 'in_app' || channel === 'email') return true
  if (channel === 'teams') {
    // Legacy customer-level Teams switch — client users default OFF until the
    // customer enables Teams during onboarding; internal staff always receive
    // Teams unless they opt out per event.
    if (user.role === 'client') return user.enableTeamsNotifications === true
    return true
  }
  return true
}

/** A stored preference row (what the repository query returns). */
export interface NotificationPreferenceRow {
  userId: string
  channel: string
  eventType: string
  enabled: boolean
}

/** Index rows by `${channel}:${canonicalEvent}` for fast lookups. */
export function indexPreferences(
  rows: NotificationPreferenceRow[],
): Map<string, boolean> {
  const map = new Map<string, boolean>()
  for (const row of rows) {
    const key = row.channel + ':' + canonicalNotificationEvent(row.eventType)
    if (key.endsWith(':null')) continue
    map.set(key, row.enabled)
  }
  return map
}

/**
 * Effective per-channel state of one event for a user.
 * Explicit rows win; otherwise the channel default applies.
 */
export function isNotificationEnabled(
  rowsByUser: Map<string, boolean> | null | undefined,
  channel: NotificationChannel,
  eventType: string | null | undefined,
  user: NotificationUserDefaults,
): boolean {
  const canonical = canonicalNotificationEvent(eventType)
  if (!canonical) {
    // Unknown event — keep sending (never silently suppress an event the
    // preference model does not know about).
    return true
  }
  const explicit = rowsByUser?.get(channel + ':' + canonical)
  if (explicit !== undefined) return explicit
  return defaultNotificationEnabled(channel, user)
}

// ─── Settings-shape builders ───────────────────────────────────────────────

export interface NotificationUserSetting {
  eventType: string
  label: string
  group: string
  inApp: boolean
  email: boolean
  teams: boolean
}

/** Build the effective settings list for one user (mirrors backend buildUserSettings). */
export function buildUserSettings(
  user: NotificationUserDefaults,
  rowsByUser: Map<string, Map<string, boolean>>,
  userId: string,
): NotificationUserSetting[] {
  const rows = rowsByUser.get(userId)
  return NOTIFICATION_EVENTS.map(def => ({
    eventType: def.eventType,
    label: def.label,
    group: def.group,
    inApp: isNotificationEnabled(rows, 'in_app', def.eventType, user),
    email: isNotificationEnabled(rows, 'email', def.eventType, user),
    teams: isNotificationEnabled(rows, 'teams', def.eventType, user),
  }))
}
