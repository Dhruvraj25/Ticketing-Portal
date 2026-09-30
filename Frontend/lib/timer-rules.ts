// ============================================================================
// Time-tracking eligibility (pure — Timer server actions + UI + tests)
// ============================================================================
// A developer may track time on a ticket only when BOTH hold:
//   1. it is assigned to them (ticket.assignedToId); and
//   2. its status is one where the developer does the work — the same set the
//      ticket page's timer controls use (components/dashboard/ticket-status-
//      actions.tsx): "Start Work" on ASSIGNED / REWORK, pause/resume while
//      IN_PROGRESS.
// Everything else is excluded — Completed ('closed'), Manager Review
// ('resolved'), Awaiting Client Review, estimate states, Requested for
// Revision (awaiting the manager's decision), New Request, etc.
//
// Timer state (from the developer's own time entries on that ticket):
//   no entry                          → 'new'                (Start Timer)
//   latest entry paused ("[Paused at") → 'paused'             (Resume Timer — resumeTimer)
//   latest entry stopped              → 'previously_worked'  (Start Timer — a new session)
//   latest entry still running        → 'running'            (not offered — one active timer)
// Plain module (relative import only) so it runs under `node --test`.
// ============================================================================

import { TICKET_STATUS_CONFIG } from './types.ts'

/** Statuses in which the assigned developer works on (and times) the ticket. */
export const TIMER_WORKABLE_STATUSES = ['assigned', 'in_progress', 'rework'] as const

/** Marker pauseTimer appends to the paused entry's description. */
export const PAUSED_ENTRY_MARKER = '[Paused at'

export const COMPLETED_TICKET_TIMER_MESSAGE = 'This ticket is completed, so time can no longer be tracked on it.'
export const NOT_ASSIGNED_TIMER_MESSAGE = 'You can only track time on tickets assigned to you.'

export type TimerState = 'new' | 'paused' | 'previously_worked' | 'running'

export const TIMER_STATE_LABEL: Record<Exclude<TimerState, 'running'>, string> = {
  new: 'New assignment',
  paused: 'Paused',
  previously_worked: 'Previously worked',
}

export function canTrackTime(status: string | null | undefined): boolean {
  return !!status && (TIMER_WORKABLE_STATUSES as readonly string[]).includes(status)
}

/** Why a ticket's status blocks the timer (null when it doesn't). */
export function timerStatusBlockMessage(status: string | null | undefined): string | null {
  if (canTrackTime(status)) return null
  if (status === 'closed') return COMPLETED_TICKET_TIMER_MESSAGE
  const label = status ? TICKET_STATUS_CONFIG[status as keyof typeof TICKET_STATUS_CONFIG]?.label ?? status : 'unknown'
  return `This ticket is not open for work right now (status: ${label}).`
}

export interface TimerEntry {
  id: number
  endTime: Date | string | null
  description?: string | null
}

/** A closed entry that pauseTimer closed (resumable) — vs. one closed by Stop. */
export function isPausedEntry(entry: TimerEntry): boolean {
  return !!entry.endTime && (entry.description ?? '').includes(PAUSED_ENTRY_MARKER)
}

/** State from the developer's MOST RECENT time entry on the ticket (or none). */
export function timerStateFor(latest: TimerEntry | null | undefined): TimerState {
  if (!latest) return 'new'
  if (!latest.endTime) return 'running'
  return isPausedEntry(latest) ? 'paused' : 'previously_worked'
}

// ─── Authoritative timer session (Time Tracking page AND Ticket Detail) ─────
// Time entries have no status column. The existing actions encode the state:
//   startTimer / resumeTimer → new entry, endTime NULL            → RUNNING
//   pauseTimer               → endTime set + "[Paused at Xm]"      → PAUSED
//   stopTimer                → endTime set, no pause marker        → STOPPED
// A session is the latest entry plus the unbroken run of PAUSED entries
// before it (pause → resume → pause …). Its accumulated time is the sum of
// those paused segments (+ the running segment, counted live by the client
// from `runningSince`), so resuming never restarts the clock at 00:00:00.

export type TimerSessionState = 'running' | 'paused' | 'stopped' | 'none'

export interface TimerSessionEntry extends TimerEntry {
  ticketId: number
  startTime: Date | string
}

export interface TimerSession {
  state: TimerSessionState
  ticketId: number | null
  /** The entry Pause/Stop act on (running) or Resume/Stop act on (paused). */
  entryId: number | null
  /** Seconds already accumulated in closed (paused) segments of this session. */
  baseSeconds: number
  /** Start of the running segment (ISO) — null unless running. */
  runningSince: string | null
}

const NO_SESSION: TimerSession = { state: 'none', ticketId: null, entryId: null, baseSeconds: 0, runningSince: null }

function seconds(from: Date | string, to: Date | string): number {
  const s = Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 1000)
  return Number.isFinite(s) && s > 0 ? s : 0
}

/** Derive the session from ONE ticket's entries for ONE user, newest first. */
export function deriveTimerSession(entriesNewestFirst: TimerSessionEntry[]): TimerSession {
  const [latest] = entriesNewestFirst
  if (!latest) return NO_SESSION
  const state: TimerSessionState = !latest.endTime ? 'running' : isPausedEntry(latest) ? 'paused' : 'stopped'
  if (state === 'stopped') return { ...NO_SESSION, state, ticketId: latest.ticketId }

  let baseSeconds = 0
  for (const e of entriesNewestFirst) {
    if (e === latest && state === 'running') continue
    if (!isPausedEntry(e)) break
    baseSeconds += seconds(e.startTime, e.endTime!)
  }
  return {
    state,
    ticketId: latest.ticketId,
    entryId: latest.id,
    baseSeconds,
    runningSince: state === 'running' ? new Date(latest.startTime).toISOString() : null,
  }
}

/** The Time Tracking page's current timer (a session plus its ticket). */
export type MyTimerState = TimerSession & {
  ticketNumber: string | null
  ticketTitle: string | null
  /** Work description of the current entry (pause marker removed). */
  description: string | null
}

/** Seconds to display now (the client ticks this only for display). */
export function sessionElapsedSeconds(session: Pick<TimerSession, 'baseSeconds' | 'runningSince'>, now: number = Date.now()): number {
  return session.baseSeconds + (session.runningSince ? seconds(session.runningSince, new Date(now)) : 0)
}

export interface TimerTicketOption {
  id: number
  ticketNumber: string
  title: string
  state: Exclude<TimerState, 'running'>
  /** The paused entry to resume (state 'paused' only). */
  resumeLogId: number | null
}

/**
 * Timer dropdown options: tickets assigned to `userId` in a workable status,
 * minus any with a timer already running (one active timer at a time).
 */
export function timerTicketOptions(
  userId: string,
  tickets: { id: number; ticketNumber: string; title: string; status: string; assignedToId: string | null }[],
  latestEntryByTicket: Map<number, TimerEntry>,
): TimerTicketOption[] {
  const options: TimerTicketOption[] = []
  for (const t of tickets) {
    if (t.assignedToId !== userId || !canTrackTime(t.status)) continue
    const latest = latestEntryByTicket.get(t.id) ?? null
    const state = timerStateFor(latest)
    if (state === 'running') continue
    options.push({ id: t.id, ticketNumber: t.ticketNumber, title: t.title, state, resumeLogId: state === 'paused' ? latest!.id : null })
  }
  return options
}
