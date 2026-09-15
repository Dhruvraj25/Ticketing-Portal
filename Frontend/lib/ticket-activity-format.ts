// Relative + explicit .ts extension (not the '@/' alias) so this module can
// be imported directly under plain `node --test` (see tests/ticket-activity-format.test.ts) —
// Node's ESM resolver doesn't understand the bundler-only '@/' path alias.
import { USER_ROLE_CONFIG, type UserRole } from './types.ts'

// ────────────────────────────────────────────────────────────────────────────
// formatActivityEntry — pure, testable formatter for one ticketHistory row.
//
// Standard pattern: "[Action/Event] by [User Name]".
// When userName is redacted for client privacy (see getTicketHistory in
// app/actions/tickets/queries.ts) but userRole is still known, the actor
// falls back to the role label ("by Support Manager / Project Manager")
// instead of omitting the actor entirely.
//
// 'estimate_approved' uses a distinct format specified separately:
// "[Name] (Role) estimate approved (Xh)".
// ────────────────────────────────────────────────────────────────────────────

export interface ActivityEntryInput {
  action: string
  userName?: string | null
  userRole?: UserRole | string | null
  newValue?: string | null
}

export interface ActivityDisplay {
  /** The full primary line, e.g. "New support request created by Hiral". */
  text: string
  color: string
}

export const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  created: { label: 'New support request created', color: 'bg-emerald-500' },
  status_changed: { label: 'Changed status', color: 'bg-blue-500' },
  priority_changed: { label: 'Updated ticket priority', color: 'bg-blue-500' },
  assigned: { label: 'Resource assigned to work on this request', color: 'bg-purple-500' },
  comment_added: { label: 'Added comment', color: 'bg-gray-50 dark:bg-slate-800/500' },
  internal_comment_added: { label: 'Added internal note', color: 'bg-amber-500' },
  timer_started: { label: 'Work has started', color: 'bg-primary' },
  timer_stopped: { label: 'Finished work', color: 'bg-primary' },
  timer_paused: { label: 'Paused timer', color: 'bg-amber-500' },
  timer_resumed: { label: 'Resumed timer', color: 'bg-primary' },
  estimate_created: { label: 'Estimate hours sent for approval', color: 'bg-emerald-500' },
  // estimate_approved has its own special-format renderer — see
  // formatActivityEntry() below. Its label here is only used as a fallback.
  estimate_approved: { label: 'Estimated work hours approved', color: 'bg-emerald-500' },
  estimate_modified: { label: 'Estimate updated', color: 'bg-amber-500' },
  estimate_rejected: { label: 'Estimate rejected', color: 'bg-orange-500' },
  clarification_requested: { label: 'Requested clarification', color: 'bg-sky-500' },
  auto_approved: { label: 'Auto-approved', color: 'bg-gray-50 dark:bg-slate-800/500' },
  estimate_sent: { label: 'Estimate sent to client', color: 'bg-sky-500' },
  assigned_directly: { label: 'Assigned directly', color: 'bg-indigo-500' },
  additional_hours_requested: { label: 'Additional support hours requested', color: 'bg-amber-500' },
  additional_hours_approved: { label: 'Additional hours approved', color: 'bg-emerald-500' },
  additional_hours_auto_approved: { label: 'Additional hours auto-approved', color: 'bg-gray-50 dark:bg-slate-800/500' },
  override_created: { label: 'Override ticket created', color: 'bg-red-500' },
  forwarded_to_client: { label: 'Customer Feedback requested', color: 'bg-sky-500' },
  reassigned: { label: 'Reassigned ticket', color: 'bg-purple-500' },
  client_approved: { label: 'Support request marked as completed', color: 'bg-emerald-500' },
  client_rejected: { label: 'Client requested changes', color: 'bg-orange-500' },
  reopened_by_client: { label: 'Reopened by client', color: 'bg-red-500' },
  // Client-initiated revision request (see revisions.ts requestRevision and
  // estimates.ts rejectEstimate). Client-visible.
  revision_requested: { label: 'Customer requested revision', color: 'bg-orange-500' },
  // Internal manager/admin "Rework" — deliberately NEVER added to
  // CLIENT_VISIBLE_HISTORY_ACTIONS. Distinct action code from
  // 'revision_requested' so it can never leak to the client.
  rework_requested: { label: 'Sent back for rework', color: 'bg-orange-500' },
  revision_approved: { label: 'Revision approved', color: 'bg-emerald-500' },
  revision_rejected: { label: 'Revision rejected', color: 'bg-red-500' },
  attachment_uploaded: { label: 'Uploaded file', color: 'bg-sky-500' },
  review_submitted: { label: 'Customer Feedback Submitted', color: 'bg-amber-500' },
  review_updated: { label: 'Customer Feedback Updated', color: 'bg-amber-400' },
}

/** Actions whose newValue is shown as a secondary detail line under the main entry. */
export const DETAIL_LINE_ACTIONS = new Set([
  'status_changed',
  'priority_changed',
  'estimate_created',
  'estimate_rejected',
  'estimate_modified',
  'auto_approved',
  'additional_hours_requested',
  'additional_hours_approved',
  'additional_hours_auto_approved',
  'clarification_requested',
  'override_created',
  'client_rejected',
  'reopened_by_client',
  'revision_requested',
  'rework_requested',
  'revision_approved',
  'revision_rejected',
])

function roleLabel(role?: UserRole | string | null): string | null {
  if (!role) return null
  const config = (USER_ROLE_CONFIG as Record<string, { label: string }>)[role]
  return config ? config.label : null
}

/** Resolves the "by [X]" actor clause: real name, else role-label fallback, else null. */
function resolveActor(entry: ActivityEntryInput): string | null {
  if (entry.userName) return entry.userName
  return roleLabel(entry.userRole)
}

/** Parses the "Xh" hours string stored in ticketHistory.newValue for estimate_approved. */
function parseHours(newValue?: string | null): string | null {
  if (!newValue) return null
  const match = newValue.match(/(\d+(?:\.\d+)?)\s*h/i)
  return match ? `${match[1]}h` : null
}

export function formatActivityEntry(entry: ActivityEntryInput): ActivityDisplay {
  const config = ACTION_LABELS[entry.action] || {
    label: entry.action.replace(/_/g, ' '),
    color: 'bg-gray-50 dark:bg-slate-800/500',
  }

  // Requirement 5 — special format, not the standard "label by actor" pattern:
  // "[Name] (Role) estimate approved (Xh)"
  if (entry.action === 'estimate_approved') {
    const actor = resolveActor(entry)
    const role = roleLabel(entry.userRole)
    const hours = parseHours(entry.newValue)
    const roleTag = role ? ` (${role})` : ''
    const hoursTag = hours ? ` (${hours})` : ''
    if (actor) return { text: `${actor}${roleTag} estimate approved${hoursTag}`, color: config.color }
    return { text: `Estimate approved${hoursTag}`, color: config.color }
  }

  const actor = resolveActor(entry)
  return {
    text: actor ? `${config.label} by ${actor}` : config.label,
    color: config.color,
  }
}
