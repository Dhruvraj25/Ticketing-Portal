// ============================================================================
// Password Audit Logger
// ============================================================================
// Records password-related actions into the existing notification_log audit
// trail (the same table used by the unified Notification Dispatcher) so every
// password event is traceable without introducing a second audit system.
//
// NEVER logs passwords or reset tokens — only actors, targets, actions,
// results, and timestamps.
// ============================================================================

import { db } from '@/lib/db'
import { notificationLog } from '@/lib/db/schema'

export interface PasswordAuditParams {
  eventType: string
  actorUserId: string
  actorName?: string | null
  targetUserId: string
  targetEmail?: string | null
  action: string
  result: 'success' | 'denied' | 'failed'
  detail?: string
}

/**
 * Write one audit row. Uses a unique random dedup key per entry so every
 * action is preserved (never deduplicated away).
 */
export async function logPasswordAudit(params: PasswordAuditParams): Promise<void> {
  try {
    const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    await db.insert(notificationLog).values({
      eventType: params.eventType,
      dedupKey: `pwd:${params.eventType}:${params.targetUserId}:${unique}`,
      recipientUserId: params.targetUserId,
      recipientEmail: params.targetEmail,
      triggeredBy: params.actorUserId,
      channels: [],
      status: 'audit',
      metadata: JSON.stringify({
        action: params.action,
        result: params.result,
        detail: params.detail ?? null,
        actorName: params.actorName ?? null,
        ts: new Date().toISOString(),
      }),
    })
  } catch (err) {
    console.error('[PasswordAudit] Failed to record audit entry:', err instanceof Error ? err.message : err)
  }
}
