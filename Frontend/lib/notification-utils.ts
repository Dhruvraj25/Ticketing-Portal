// ============================================================================
// Notification Dispatcher — Pure Helpers & Types
// ============================================================================
//
// Zero-dependency module (no imports) so the recipient-resolution, dedup-key,
// channel, and wallet threshold-crossing logic can be unit-tested in isolation
// (see tests/notification-utils.test.mjs) and reused by lib/notify-all.ts.
//
// Everything here is "erasable" TypeScript — safe for Node's native type
// stripping (node --test tests/).
// ============================================================================

export type NotificationChannel = 'inApp' | 'email' | 'teams'

export interface DispatchInApp {
  title: string
  message: string
  link?: string
  ticketId?: number
}

export interface DispatchEmail {
  /** Backend bridge event type — defaults to the dispatch eventType. */
  eventType?: string
  subject?: string
  templateData: Record<string, unknown>
}

export interface DispatchTeams {
  /** Teams service event type — defaults to the dispatch eventType. */
  eventType?: string
  payload: Record<string, unknown>
}

export interface DispatchRecipient {
  userId: string
  /** Channels to deliver. Defaults to all three. */
  channels?: NotificationChannel[]
  inApp?: DispatchInApp
  email?: DispatchEmail
  teams?: DispatchTeams
}

export interface DispatchOptions {
  /** Canonical business event name (e.g. 'ticket_created'). */
  eventType: string
  /** User ID of the actor, or 'system' for scheduled/system events. */
  triggeredBy: string
  recipients: DispatchRecipient[]
  /**
   * Duplicate protection. Default: enabled.
   *  - scope: extra discriminator (e.g. ticket/wallet id) so distinct entities
   *    can each notify once.
   *  - windowMinutes: if set, only suppress re-dispatch within that window
   *    (for events that legitimately repeat, e.g. reminders). If omitted,
   *    dispatch is suppressed forever for the same (event, scope, recipient).
   * Pass `false` to disable dedup entirely.
   */
  dedup?: { scope?: string; windowMinutes?: number } | false
  /** Arbitrary metadata stored on the notification_log row for tracing. */
  metadata?: Record<string, unknown>
}

export interface DispatchChannelResult {
  inApp: 'sent' | 'skipped' | 'not_requested'
  email: 'sent' | 'skipped' | 'not_requested'
  teams: 'sent' | 'skipped' | 'not_requested'
}

export interface DispatchResult {
  userId: string
  dedupKey: string
  skipped: boolean
  skipReason?: 'duplicate' | 'no_channels' | 'no_user'
  channels: DispatchChannelResult
}

export const ALL_CHANNELS: NotificationChannel[] = ['inApp', 'email', 'teams']

// ─── Dedup key (Phase 6) ────────────────────────────────────────────────────

export function buildDedupKey(
  eventType: string,
  userId: string,
  scope?: string,
): string {
  return `${eventType}:${scope ?? 'default'}:${userId}`
}

// ─── Recipient deduplication (Phase 9) ─────────────────────────────────────

/**
 * Collapse multiple role resolutions of the SAME user into ONE recipient entry.
 * Channels requested by either occurrence are merged; per-channel data from the
 * first occurrence wins when both supply data for the same channel.
 */
export function dedupeRecipients(
  recipients: DispatchRecipient[],
): DispatchRecipient[] {
  const byUser = new Map<string, DispatchRecipient>()
  for (const r of recipients) {
    const existing = byUser.get(r.userId)
    if (!existing) {
      byUser.set(r.userId, r)
      continue
    }
    // Merge channels requested by either occurrence, keeping per-channel data.
    const channels = Array.from(
      new Set([
        ...(existing.channels ?? ALL_CHANNELS),
        ...(r.channels ?? ALL_CHANNELS),
      ]),
    )
    byUser.set(r.userId, {
      userId: r.userId,
      channels,
      inApp: r.inApp ?? existing.inApp,
      email: r.email ?? existing.email,
      teams: r.teams ?? existing.teams,
    })
  }
  return Array.from(byUser.values())
}

// ─── Channel resolution ────────────────────────────────────────────────────

export function resolveChannels(
  requested?: NotificationChannel[],
): NotificationChannel[] {
  const channels = requested && requested.length > 0 ? requested : ALL_CHANNELS
  return Array.from(new Set(channels))
}

// ─── Client Teams toggle (Phase 3) ─────────────────────────────────────────
// Customer (client) accounts are gated by their Teams notification preference.
// Internal staff (admin / project_manager / developer) are NEVER gated — they
// always receive Teams posts. The same rule is enforced defensively on the
// backend route (7/src/routes/teams-notification.ts).

export function shouldSendTeamsForUser(
  role: string | null | undefined,
  enableTeamsNotifications: boolean | null | undefined,
): boolean {
  if (role === 'client') return !!enableTeamsNotifications
  return true
}

// ─── Wallet threshold-crossing logic (Phase 8) ──────────────────────────────
// Alerts fire ONLY when the balance crosses a threshold, never on every ticket
// close. Dedup scope `wallet:<id>` + resetNotificationState() on recharge make
// the "notify once per crossing" behavior durable.

export const WALLET_LOW_THRESHOLD = 20

export function shouldNotifyWalletLow(
  previousRemaining: number,
  newRemaining: number,
  threshold: number = WALLET_LOW_THRESHOLD,
): boolean {
  return previousRemaining > threshold && newRemaining <= threshold
}

export function shouldNotifyWalletEmpty(
  previousRemaining: number,
  newRemaining: number,
): boolean {
  return previousRemaining > 0 && newRemaining <= 0
}
