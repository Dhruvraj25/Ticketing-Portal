// ============================================================================
// Resource work flow — Start Work → timer → Complete (pure — server, UI, tests)
// ============================================================================
// Uses the existing statuses only (lib/types TicketStatus):
//   assigned / rework  → "Start Work" (not started yet)
//   in_progress        → working (timer running / paused / stopped between sessions)
//   resolved           → work completed, awaiting Manager Review
//
// REOPEN (developer / assigned manager "Reopen Request", client reopen of a
// closed ticket) sends the ticket back to the NOT-STARTED state — exactly like
// a newly assigned ticket — so it must go through Start Work → timer → Stop &
// Complete again; it can never jump straight to "Mark Completed".
// Plain module — no '@/' imports.
// ============================================================================

/** Statuses from which the resource starts work ("Start Work"). */
export const WORK_START_STATUSES = ['assigned', 'rework'] as const

/** The working status Start Work (or starting / resuming a timer) moves to. */
export const WORKING_STATUS = 'in_progress'

/** Only work in progress can be completed (→ Manager Review). */
export function canCompleteWork(status: string | null | undefined): boolean {
  return status === WORKING_STATUS
}

/** Status a reopened ticket returns to: back to its resource, not started. */
export function reopenStatusFor(assignedToId: string | null | undefined): 'assigned' | 'estimate_approved' {
  // No resource (e.g. a historical ticket) → ready for resource assignment.
  return assignedToId ? 'assigned' : 'estimate_approved'
}

/** When work starts (timer start / resume), a not-started ticket becomes in progress. */
export function statusAfterWorkStarts(status: string | null | undefined): typeof WORKING_STATUS | null {
  return (WORK_START_STATUSES as readonly string[]).includes(status ?? '') ? WORKING_STATUS : null
}

export const COMPLETE_REQUIRES_WORK_MESSAGE = 'Start work on this ticket before marking it completed.'
