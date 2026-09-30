// ============================================================================
// Worklogs → Activity Log: ticket-wise work events (pure — server + UI + tests)
// ============================================================================
// Built ONLY from records the app already writes to ticket history
// (tickethistory) — no separate tracking:
//   timer_started              (Start Work / startTimer)   → Started work
//   timer_paused               (pauseTimer)               → Paused work
//   timer_resumed              (resumeTimer)              → Started work again
//   timer_stopped              (stopTimer)                → Stopped work
//   status_changed → resolved  (Mark Completed / Stop & Complete) → Resolved the ticket
// Billable / Non-Billable comes from the ticket via the shared billing rule
// (lib/billing-sql.ts ticketIsBillable).
// Plain module — no '@/' imports.
// ============================================================================

/** Events loaded per batch in the Activity Log feed. */
export const WORK_ACTIVITY_BATCH = 20

export const WORK_TIMER_ACTIONS = ['timer_started', 'timer_paused', 'timer_resumed', 'timer_stopped'] as const
export const RESOLVED_STATUS = 'resolved'

export type WorkEventKind = 'started' | 'paused' | 'resumed' | 'stopped' | 'resolved'

export const WORK_EVENT_LABEL: Record<WorkEventKind, string> = {
  started: 'Started work',
  paused: 'Paused work',
  resumed: 'Started work again',
  stopped: 'Stopped work',
  resolved: 'Resolved the ticket',
}

export function workEventKind(action: string, newValue?: string | null): WorkEventKind | null {
  switch (action) {
    case 'timer_started': return 'started'
    case 'timer_paused': return 'paused'
    case 'timer_resumed': return 'resumed'
    case 'timer_stopped': return 'stopped'
    case 'status_changed': return newValue === RESOLVED_STATUS ? 'resolved' : null
    default: return null
  }
}

export interface WorkActivityEvent {
  id: number
  ticketId: number
  ticketNumber: string
  ticketTitle: string
  action: string
  newValue: string | null
  createdAt: Date | string
  userName: string
  isBillable: boolean
}

/** Detail shown under the action, when the history row carries one. */
export function workEventDetail(e: Pick<WorkActivityEvent, 'action' | 'newValue'>): string | null {
  const kind = workEventKind(e.action, e.newValue)
  if (kind === 'paused' || kind === 'stopped') {
    const m = /^(\d+) minutes?$/.exec((e.newValue ?? '').trim())
    if (m) return kind === 'paused' ? `${m[1]} min worked before pausing` : `${m[1]} min logged`
  }
  return null
}

/** Group consecutive events of the same ticket (the feed is ordered ticket by ticket). */
export function groupEventsByTicket<T extends Pick<WorkActivityEvent, 'ticketId'>>(events: T[]): { ticketId: number; events: T[] }[] {
  const groups: { ticketId: number; events: T[] }[] = []
  for (const e of events) {
    const last = groups[groups.length - 1]
    if (last && last.ticketId === e.ticketId) last.events.push(e)
    else groups.push({ ticketId: e.ticketId, events: [e] })
  }
  return groups
}
