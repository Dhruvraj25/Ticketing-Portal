// Worklogs → Activity Log: ticket-wise work events from the EXISTING ticket
// history, with resource, action, time and billable status.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  groupEventsByTicket, WORK_ACTIVITY_BATCH, WORK_EVENT_LABEL, WORK_TIMER_ACTIONS, workEventDetail, workEventKind,
} from '../lib/work-activity.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const HISTORY = read('app/actions/tickets/history.ts')
const TIMELOGS = read('app/actions/tickets/timelogs.ts')
const UPDATE = read('app/actions/tickets/update.ts')
const FEED = read('components/dashboard/ticket-work-activity.tsx')
const PANEL = read('components/dashboard/activity-log-panel.tsx')
const PAGE = read('app/dashboard/worklogs/page.tsx')

test('events come from the history actions the app already writes (no new tracking)', () => {
  // Writers — unchanged existing records.
  assert.match(TIMELOGS, /action: 'timer_started'/)
  assert.match(TIMELOGS, /action: 'timer_paused'/)
  assert.match(TIMELOGS, /action: 'timer_resumed'/)
  assert.match(TIMELOGS, /action: 'timer_stopped'/)
  assert.match(UPDATE, /action: 'status_changed',\s*\n\s*oldValue: t\.status, newValue: newStatus,/)
  assert.deepEqual([...WORK_TIMER_ACTIONS], ['timer_started', 'timer_paused', 'timer_resumed', 'timer_stopped'])
})

test('labels: started / paused / started again / stopped / resolved', () => {
  assert.equal(WORK_EVENT_LABEL[workEventKind('timer_started')!], 'Started work')
  assert.equal(WORK_EVENT_LABEL[workEventKind('timer_paused')!], 'Paused work')
  assert.equal(WORK_EVENT_LABEL[workEventKind('timer_resumed')!], 'Started work again')
  assert.equal(WORK_EVENT_LABEL[workEventKind('timer_stopped')!], 'Stopped work')
  assert.equal(WORK_EVENT_LABEL[workEventKind('status_changed', 'resolved')!], 'Resolved the ticket')
  assert.equal(workEventKind('status_changed', 'closed'), null, 'only the developer resolve step')
  assert.equal(workEventKind('comment_added'), null)
})

test('detail from the recorded minutes (live values like "1 minutes")', () => {
  assert.equal(workEventDetail({ action: 'timer_paused', newValue: '1 minutes' }), '1 min worked before pausing')
  assert.equal(workEventDetail({ action: 'timer_stopped', newValue: '12 minutes' }), '12 min logged')
  assert.equal(workEventDetail({ action: 'timer_started', newValue: 'Started working' }), null)
})

test('grouped ticket by ticket (feed order: ticket with latest activity first)', () => {
  const groups = groupEventsByTicket([{ ticketId: 1998 }, { ticketId: 1998 }, { ticketId: 1994 }, { ticketId: 1998 }])
  assert.deepEqual(groups.map((g) => [g.ticketId, g.events.length]), [[1998, 2], [1994, 1], [1998, 1]])
})

test('server: admin/PM only, work events only, ticket-wise order, billable via the shared rule, batched', () => {
  const fn = HISTORY.slice(HISTORY.indexOf('export const getTicketWorkActivity'))
  assert.match(fn, /if \(currentUser\.role !== 'project_manager' && currentUser\.role !== 'admin'\) throw new Error\('Access denied'\)/)
  assert.match(fn, /inArray\(ticketHistory\.action, \[\.\.\.WORK_TIMER_ACTIONS\]\),\s*\n\s*and\(eq\(ticketHistory\.action, 'status_changed'\), eq\(ticketHistory\.newValue, RESOLVED_STATUS\)\)/)
  assert.match(fn, /MAX\(\$\{ticketHistory\.createdAt\}\) OVER \(PARTITION BY \$\{ticketHistory\.ticketId\}\) DESC/)
  assert.match(fn, /isBillable: ticketIsBillable,/)
  assert.match(fn, /\.limit\(safeLimit \+ 1\)/)
  assert.equal(WORK_ACTIVITY_BATCH, 20)
})

test('UI: Activity Log shows ticket activity (default) and keeps the time-entry list', () => {
  assert.match(PANEL, /const \[view, setView\] = useState<'tickets' \| 'entries'>\('tickets'\)/)
  assert.match(PANEL, /<TicketWorkActivity initialEvents=\{initialTicketActivity\.events\} initialHasMore=\{initialTicketActivity\.hasMore\} \/>/)
  assert.match(PANEL, /\}, \[hasMoreState, loadMore, view\]\)/, 'time-entry scroll re-attaches when that view opens')
  assert.match(PAGE, /getTicketWorkActivity\(WORK_ACTIVITY_BATCH, 0\),/)
  assert.match(PAGE, /import \{ WORK_ACTIVITY_BATCH \} from '@\/lib\/work-activity'/, 'constant from a plain module, not a client component')
  // Row content: ticket, resource, action, date/time, billable.
  assert.match(FEED, /\{head\.ticketNumber\}/)
  assert.match(FEED, /<span className="font-medium">\{e\.userName\}<\/span>/)
  assert.match(FEED, /\{WORK_EVENT_LABEL\[kind\]\}/)
  assert.match(FEED, /fmtTz\(e\.createdAt, 'MMM d, HH:mm', timezone\)/)
  assert.match(FEED, /<BillingBadge billable=\{e\.isBillable\} \/>/)
  assert.match(FEED, /useInfiniteTicketList<WorkActivityEvent>\(\{/)
})
