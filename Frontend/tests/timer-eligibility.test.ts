// Time Tracking → Timer: only tickets the logged-in developer can start/resume.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  canTrackTime, COMPLETED_TICKET_TIMER_MESSAGE, TIMER_WORKABLE_STATUSES, timerStateFor,
  timerStatusBlockMessage, timerTicketOptions, type TimerEntry,
} from '../lib/timer-rules.ts'
import { TICKET_STATUS_CONFIG } from '../lib/types.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const ACTIONS = read('app/actions/tickets/timelogs.ts')
const PAGE = read('app/dashboard/time-tracking/page.tsx')
const CLIENT = read('app/dashboard/time-tracking/time-tracking-client.tsx')
const TICKET_ACTIONS = read('components/dashboard/ticket-status-actions.tsx')

const ME = 'dev-a', OTHER = 'dev-b'
const t = (id: number, status: string, assignedToId: string | null = ME) => ({ id, ticketNumber: `TKT-${id}`, title: `Ticket ${id}`, status, assignedToId })
const closedEntry = (id: number): TimerEntry => ({ id, endTime: '2026-09-01T10:00:00Z', description: 'Fixed report' })
const pausedEntry = (id: number): TimerEntry => ({ id, endTime: '2026-09-01T10:00:00Z', description: 'Fixing [Paused at 25m]' })
const runningEntry = (id: number): TimerEntry => ({ id, endTime: null, description: 'Working' })

test('workable statuses match the ticket page timer controls (Assigned / Rework start, In Progress pause/resume)', () => {
  assert.deepEqual([...TIMER_WORKABLE_STATUSES].sort(), ['assigned', 'in_progress', 'rework'])
  assert.match(TICKET_ACTIONS, /const canStartWork = status === TicketStatus\.ASSIGNED \|\| status === TicketStatus\.REWORK/)
  // In-progress (working) is the shared lib/ticket-work-flow.ts rule the page uses.
  assert.match(TICKET_ACTIONS, /\{canCompleteWork\(status\) && \(/)
  for (const s of Object.keys(TICKET_STATUS_CONFIG)) {
    assert.equal(canTrackTime(s), ['assigned', 'in_progress', 'rework'].includes(s), s)
  }
})

test('cases 1–9: eligibility combines assignment + status + timer history', () => {
  const tickets = [
    t(1, 'assigned'),                 // 1. newly assigned, never started
    t(2, 'in_progress'),              // 2. paused
    t(3, 'in_progress'),              // 3. worked before, stopped
    t(4, 'rework'),                   //    sent back for rework
    t(5, 'assigned', OTHER),          // 4. another developer's ticket
    t(6, 'closed'),                   // 5/6. completed
    t(7, 'client_review'),            // 7. awaiting client review
    t(8, 'resolved'),                 // 8. manager review
    t(9, 'estimate_approved', null),  // 9. unassigned
    t(10, 'request_for_revision'),    //    revision awaiting the manager's decision
    t(11, 'manager_review'),
  ]
  const latest = new Map<number, TimerEntry>([[2, pausedEntry(20)], [3, closedEntry(30)], [6, pausedEntry(60)]])
  const options = timerTicketOptions(ME, tickets, latest)
  assert.deepEqual(options.map((o) => [o.id, o.state, o.resumeLogId]), [
    [1, 'new', null],
    [2, 'paused', 20],
    [3, 'previously_worked', null],
    [4, 'new', null],
  ])
  // Developer B sees only their own ticket.
  assert.deepEqual(timerTicketOptions(OTHER, tickets, latest).map((o) => o.id), [5])
})

test('case 10: a ticket with a running timer is not offered again (one active timer)', () => {
  const options = timerTicketOptions(ME, [t(1, 'in_progress'), t(2, 'assigned')], new Map([[1, runningEntry(9)]]))
  assert.deepEqual(options.map((o) => o.id), [2])
  assert.equal(timerStateFor(runningEntry(1)), 'running')
})

test('case 11: no eligible tickets → empty list and the empty-state message', () => {
  assert.deepEqual(timerTicketOptions(ME, [t(1, 'closed'), t(2, 'resolved')], new Map()), [])
  assert.match(CLIENT, /No tickets are currently available for time tracking\./)
})

test('server: the list is built on the server — assignee + workable status filtered in the database', () => {
  const fn = ACTIONS.slice(ACTIONS.indexOf('export const getTimerTickets'))
  assert.match(fn, /if \(currentUser\.role !== 'developer'\) return \[\]/)
  assert.match(fn, /\.where\(and\(eq\(ticket\.assignedToId, currentUser\.id\), inArray\(ticket\.status, \[\.\.\.TIMER_WORKABLE_STATUSES\]\)\)\)/)
  assert.match(fn, /\.where\(and\(eq\(timeLog\.userId, currentUser\.id\), inArray\(timeLog\.ticketId,/, 'only this developer\'s own entries')
  assert.match(fn, /return timerTicketOptions\(currentUser\.id, tickets, latest\)/)
  assert.match(PAGE, /getTimerTickets\(\),/)
  assert.match(PAGE, /timerTickets=\{timerTickets\}/)
})

test('server: startTimer and resumeTimer enforce assignment + status (API calls included), before any write', () => {
  const start = ACTIONS.slice(ACTIONS.indexOf('export const startTimer'), ACTIONS.indexOf('export const stopTimer'))
  const assignIdx = start.indexOf('if (estimateRow.assignedToId !== currentUser.id) throw new Error(NOT_ASSIGNED_TIMER_MESSAGE)')
  const statusIdx = start.indexOf('if (statusBlock) throw new Error(statusBlock)')
  assert.ok(assignIdx > 0 && statusIdx > assignIdx && statusIdx < start.indexOf('db.insert(timeLog)'))

  const resume = ACTIONS.slice(ACTIONS.indexOf('export const resumeTimer'))
  assert.match(resume, /if \(!log \|\| log\.ticketId !== ticketId\) throw new Error\('Time log not found'\)/)
  assert.match(resume, /if \(ticketRow\.assignedToId !== currentUser\.id\) throw new Error\(NOT_ASSIGNED_TIMER_MESSAGE\)/)
  assert.match(resume, /if \(running\) throw new Error\('You already have an active timer'\)/)
  assert.ok(resume.indexOf("if (running) throw") < resume.indexOf('db.insert(timeLog)'), 'never a second active timer')

  assert.equal(timerStatusBlockMessage('closed'), COMPLETED_TICKET_TIMER_MESSAGE)
  assert.equal(timerStatusBlockMessage('resolved'), 'This ticket is not open for work right now (status: Manager Review).')
  assert.equal(timerStatusBlockMessage('in_progress'), null)
})

test('UI: paused → Resume Timer via the existing resumeTimer; otherwise Start Timer via startTimer', () => {
  assert.match(CLIENT, /const isResume = selectedOption\?\.state === 'paused' && selectedOption\.resumeLogId !== null/)
  assert.match(CLIENT, /if \(isResume\) await resumeTimer\(selectedOption\.resumeLogId!, selectedOption\.id, description \|\| undefined\)\s*\n\s*else await startTimer\(selectedOption\.id, description \|\| undefined\)/)
  assert.match(CLIENT, /\{isResume \? 'Resume Timer' : 'Start Timer'\}/)
  assert.match(CLIENT, /disabled=\{loading !== null \|\| !selectedOption\}/)
  assert.match(CLIENT, /\{TIMER_STATE_LABEL\[t\.state\]\}/)
})
