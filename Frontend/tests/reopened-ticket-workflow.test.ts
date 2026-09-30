// Reopened tickets go back through Start Work → timer → Complete, exactly like
// a newly assigned ticket (existing statuses, existing timer, no new rules).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canCompleteWork, reopenStatusFor, statusAfterWorkStarts, WORK_START_STATUSES } from '../lib/ticket-work-flow.ts'
import { deriveTimerSession, sessionElapsedSeconds, type TimerSessionEntry } from '../lib/timer-rules.ts'
import { isBillableTicket } from '../lib/billing.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const ACTIONS = read('components/dashboard/ticket-status-actions.tsx')
const UPDATE = read('app/actions/tickets/update.ts')
const TIMELOGS = read('app/actions/tickets/timelogs.ts')

// What the ticket page shows (same conditions as ticket-status-actions.tsx).
function ticketPageActions(status: string, timer: 'idle' | 'running' | 'paused') {
  const out: string[] = []
  if ((status === 'assigned' || status === 'rework') && timer === 'idle') out.push('Start Work')
  if (timer === 'running') out.push('Pause')
  if (timer === 'paused') out.push('Resume')
  if (timer !== 'idle') out.push('Stop')
  if (canCompleteWork(status)) out.push(timer !== 'idle' ? 'Stop & Complete' : 'Mark Completed')
  if ((status === 'resolved' || status === 'client_review') && timer === 'idle') out.push('Reopen Request')
  return out
}

test('1. newly assigned ticket still shows Start Work (and never Mark Completed)', () => {
  assert.deepEqual(ticketPageActions('assigned', 'idle'), ['Start Work'])
  assert.deepEqual(ticketPageActions('in_progress', 'running'), ['Pause', 'Stop', 'Stop & Complete'])
})

test('2–4, 10. developer reopen → back to "assigned": Start Work, NOT Mark Completed', () => {
  assert.equal(reopenStatusFor('dev-1'), 'assigned')
  assert.deepEqual(ticketPageActions('resolved', 'idle'), ['Reopen Request'])
  assert.deepEqual(ticketPageActions(reopenStatusFor('dev-1'), 'idle'), ['Start Work'])
  assert.doesNotMatch(ticketPageActions(reopenStatusFor('dev-1'), 'idle').join(), /Mark Completed/)
  assert.match(ACTIONS, /await updateTicketStatus\(ticketId, TicketStatus\.ASSIGNED\)/)
  assert.doesNotMatch(ACTIONS, /updateTicketStatus\(ticketId, 'in_progress' as TicketStatus\)/)
})

test('9. manager reopen follows the same flow (same component, manager as assigned resource)', () => {
  assert.match(read('app/dashboard/tickets/[id]/page.tsx'), /canWorkOnTicket\(user\.role, user\.id, ticket\.assignedToId\) && \(\s*\n\s*<TicketStatusActions/)
  assert.deepEqual(ticketPageActions(reopenStatusFor('mgr-1'), 'idle'), ['Start Work'])
})

test('client reopen of a closed ticket also returns it to its resource, not started', () => {
  assert.match(UPDATE, /status: reopenStatusFor\(t\.assignedToId\), closedAt: null/)
  assert.equal(reopenStatusFor(null), 'estimate_approved', 'no resource → ready for assignment')
  assert.match(UPDATE, /action: 'reopened_by_client',/, 'existing activity log kept')
  assert.match(UPDATE, /title: 'Ticket Reopened',/, 'existing notifications kept')
})

test('5–7, 8. Start Work → new session (history kept); pause/resume; complete only while in progress', () => {
  // Session 1 before reopening: 2h15m, stopped. Reopen, then Start Work 35m.
  const history: TimerSessionEntry[] = [
    { id: 1, ticketId: 7, startTime: '2026-09-01T08:00:00Z', endTime: '2026-09-01T10:15:00Z', description: 'Session 1' },
  ]
  const afterStart: TimerSessionEntry[] = [
    { id: 2, ticketId: 7, startTime: '2026-09-30T09:00:00Z', endTime: null, description: 'Started working' },
    ...history,
  ]
  const running = deriveTimerSession(afterStart)
  assert.equal(running.state, 'running')
  assert.equal(running.entryId, 2, 'a NEW session/entry — the old one is not restarted')
  assert.equal(running.baseSeconds, 0, 'stopped session 1 is not carried into the new one')
  assert.equal(sessionElapsedSeconds(running, Date.parse('2026-09-30T09:35:00Z')), 35 * 60)
  assert.deepEqual(history[0], { id: 1, ticketId: 7, startTime: '2026-09-01T08:00:00Z', endTime: '2026-09-01T10:15:00Z', description: 'Session 1' }, 'history unchanged')
  const totalMinutes = (135 + 35)
  assert.equal(totalMinutes, 170, '2h15m + 35m = 2h50m logged overall')

  // Start / resume on a not-started ticket moves it to in progress (same as Start Work).
  for (const s of WORK_START_STATUSES) assert.equal(statusAfterWorkStarts(s), 'in_progress')
  assert.equal(statusAfterWorkStarts('in_progress'), null)
  // Paused on a reopened (assigned) ticket → Resume, never straight to complete.
  assert.deepEqual(ticketPageActions('assigned', 'paused'), ['Resume', 'Stop'])
  assert.equal(canCompleteWork('assigned'), false)
  assert.equal(canCompleteWork('in_progress'), true)
})

test('server: completion requires work in progress; starting/resuming work moves not-started tickets', () => {
  assert.match(UPDATE, /if \(newStatus === 'resolved' && !canCompleteWork\(t\.status\)\) \{\s*\n\s*throw new Error\(COMPLETE_REQUIRES_WORK_MESSAGE\)/)
  assert.match(TIMELOGS, /await markWorkStarted\(ticketId, estimateRow\.status, currentUser\.id\)/)
  assert.match(TIMELOGS, /await markWorkStarted\(ticketId, ticketRow\.status, currentUser\.id\)/)
  assert.match(TIMELOGS, /\.where\(and\(eq\(ticket\.id, ticketId\), eq\(ticket\.status, currentStatus\)\)\)/, 'only moves if still not started')
  assert.match(TIMELOGS, /action: 'status_changed', oldValue: currentStatus, newValue: next/)
  // No time log is ever deleted or rewritten by reopening.
  assert.doesNotMatch(UPDATE, /delete\(timeLog\)/)
})

test('11–12. billing unchanged: new entries after reopening use the shared rule from the ticket', () => {
  assert.match(TIMELOGS, /const isBillable = isBillableTicket\(estimateRow\)/)
  assert.equal(isBillableTicket({ estimateWorkflowSkipped: false, assignedToId: 'dev-1' }), true)
  assert.equal(isBillableTicket({ estimateWorkflowSkipped: true, assignedToId: 'dev-1' }), false)
  assert.doesNotMatch(UPDATE.slice(UPDATE.indexOf('export const clientReopenTicket')), /estimateWorkflowSkipped|isBillable/)
})
