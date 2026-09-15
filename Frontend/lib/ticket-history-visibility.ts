/**
 * Activity actions a CLIENT is allowed to see (R14).
 *
 * Everything else is internal workflow (timer events, developer assignment,
 * manager review actions, internal comments, revision approvals, admin date
 * edits, status plumbing) and is stripped server-side — never merely hidden
 * with CSS. Kept OUT of "use server" modules because Next.js forbids plain
 * (non-function) exports from server-action files; this is a shared constant
 * module instead.
 */
export const CLIENT_VISIBLE_HISTORY_ACTIONS: ReadonlySet<string> = new Set([
  'created',
  'client_approved',
  'client_rejected',
  'reopened_by_client',
  'estimate_created',
  'estimate_sent',
  'estimate_approved',
  'estimate_modified',
  'estimate_rejected',
  'clarification_requested',
  'auto_approved',
  'additional_hours_requested',
  'additional_hours_approved',
  'additional_hours_auto_approved',
  'override_created',
  'attachment_uploaded',
  'review_submitted',
  'review_updated',
  'forwarded_to_client',
  // 'revision_requested' is ONLY ever written for client-initiated revision
  // requests (see revisions.ts requestRevision + estimates.ts rejectEstimate).
  // The internal manager/admin "Rework" path writes the DISTINCT
  // 'rework_requested' action instead specifically so it can never appear
  // here — the client must never learn who sent a ticket back or why.
  'revision_requested',
  'revision_approved',
  'revision_rejected',
])
