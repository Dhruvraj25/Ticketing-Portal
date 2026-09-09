import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Rework → Start Work flow
// ============================================================================
// Root cause: components/dashboard/ticket-status-actions.tsx gated the
// "Start Work" button on `status === TicketStatus.ASSIGNED` only. When a
// manager sends a ticket back for Rework (status 'rework'), the assigned
// developer opens the SAME ticket but this condition is false, so no
// "Start Work" control renders — even though the backend
// (app/actions/tickets/update.ts's updateTicketStatus) never restricted
// which status a ticket can move to IN_PROGRESS from, and already correctly
// gates on role + assignment.
//
// Fix: extend the button-visibility condition to also include
// TicketStatus.REWORK, reusing the EXACT SAME onClick handler (same
// updateTicketStatus(ticketId, TicketStatus.IN_PROGRESS) + startTimer(...)
// call) — no new status, no new endpoint, no new component.
//
// These tests can't mount the React component or call the DB-backed server
// actions under plain node:test, so — matching this repo's established
// convention (ticket-draft.test.ts, admin-ticket-dates.test.ts,
// notification-utils.test.mjs) — they are source-level regression guards
// proving the actual current file content.

const ROOT = join(import.meta.dirname, '..')
const STATUS_ACTIONS_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'ticket-status-actions.tsx'), 'utf8')
const UPDATE_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'update.ts'), 'utf8')
const TIMELOGS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'timelogs.ts'), 'utf8')
const REVISIONS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'revisions.ts'), 'utf8')
const TYPES_SRC = readFileSync(join(ROOT, 'lib', 'types.ts'), 'utf8')

function extractFunction(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker)
  assert.notEqual(start, -1, `could not find "${startMarker}" in source`)
  const end = src.indexOf(endMarker, start)
  assert.notEqual(end, -1, `could not find "${endMarker}" after "${startMarker}"`)
  return src.slice(start, end)
}

// ─── A. Assigned developer sees Start Work on a Rework ticket ─────────────

test('A: canStartWork includes REWORK (in addition to the original ASSIGNED state)', () => {
  assert.match(
    STATUS_ACTIONS_SRC,
    /const canStartWork = status === TicketStatus\.ASSIGNED \|\| status === TicketStatus\.REWORK/,
  )
})

test('A: the Start Work button render condition uses canStartWork', () => {
  assert.match(STATUS_ACTIONS_SRC, /\{canStartWork && timerState === 'idle' && \(/)
  // The old ASSIGNED-only gate must be fully replaced, not left dangling.
  assert.doesNotMatch(STATUS_ACTIONS_SRC, /const isAssigned = status === TicketStatus\.ASSIGNED\b(?!\s*\|\|)/)
})

// ─── B & C. Start Work from Rework reuses the existing handler and the ────
// existing canonical IN_PROGRESS status (no new status introduced) ────────

test('B: exactly one start_work handler exists — the Rework path reuses it, not a duplicate', () => {
  const occurrences = STATUS_ACTIONS_SRC.match(/handleAction\('start_work'/g) ?? []
  assert.equal(occurrences.length, 1, 'Start Work must have a single, shared handler for every eligible status')
})

test('B & C: Start Work transitions via the existing updateTicketStatus + startTimer calls, into the existing IN_PROGRESS status', () => {
  const handlerStart = STATUS_ACTIONS_SRC.indexOf("handleAction('start_work'")
  const handlerBlock = STATUS_ACTIONS_SRC.slice(handlerStart, handlerStart + 400)
  assert.match(handlerBlock, /await updateTicketStatus\(ticketId, TicketStatus\.IN_PROGRESS\)/)
  assert.match(handlerBlock, /await startTimer\(ticketId, 'Started working'\)/)
})

test('C: no new ticket status was introduced — TicketStatus enum is unchanged (still exactly 11 canonical values)', () => {
  const enumBlock = extractFunction(TYPES_SRC, 'export const TicketStatus = {', '} as const')
  const keys = [...enumBlock.matchAll(/^\s*([A-Z_]+):\s*'([a-z_]+)',?$/gm)].map(m => m[2])
  assert.deepEqual(
    keys,
    ['new', 'manager_review', 'estimate_pending', 'estimate_approved', 'assigned', 'in_progress', 'resolved', 'client_review', 'closed', 'rework', 'request_for_revision'],
  )
})

// ─── D. Existing worklogs/history/ticket data remain intact ───────────────

test('D: updateTicketStatus never touches timeLog rows, ticketHistory deletions, revisionCount, or creation/assignment fields', () => {
  const fn = extractFunction(UPDATE_SRC, 'export const updateTicketStatus = wrapServerAction', '\n// ── Assignment')
  assert.doesNotMatch(fn, /\btimeLog\b/, 'must never touch the timeLog table — existing worklogs are preserved')
  assert.doesNotMatch(fn, /\.delete\(/, 'must never delete any row — history is preserved')
  // revisionCount may be READ (it's used read-only to build the cycle-aware
  // manager_review dedup key below) but must never be WRITTEN/reset here.
  assert.doesNotMatch(fn, /revisionCount\s*[:=]\s*(?!\|\|)/, 'must never write/reset the revision/rework cycle counter')
  assert.doesNotMatch(fn, /updateData\.revisionCount/)
  assert.doesNotMatch(fn, /createdAt/, 'must never touch the ticket creation date')
  assert.doesNotMatch(fn, /assignedToId:/, 'must never change the ticket assignment')
  assert.doesNotMatch(fn, /projectId:|moduleId:|clientId:/, 'must never change project/module/client linkage')
  // The only fields ever written are status/updatedAt plus the two existing
  // conditional timestamps (resolvedAt on resolve, closedAt on close).
  assert.match(fn, /const updateData: Record<string, unknown> = \{ status: newStatus, updatedAt: new Date\(\) \}/)
  // It only ever APPENDS a new ticketHistory row — never clears existing ones.
  assert.match(fn, /await db\.insert\(ticketHistory\)\.values\(\{/)
})

test('D: startTimer preserves prior worklogs — it only ever inserts a new timeLog row, never updates/deletes existing ones', () => {
  const fn = extractFunction(TIMELOGS_SRC, 'export const startTimer = wrapServerAction', 'export const stopTimer')
  assert.match(fn, /await db\.insert\(timeLog\)\.values\(\{/)
  assert.doesNotMatch(fn, /db\.update\(timeLog\)/, 'startTimer must not modify a prior timeLog row')
  assert.doesNotMatch(fn, /db\.delete\(timeLog\)/)
})

// ─── E & F. Backend authorization — not just frontend button visibility ───

test('E: updateTicketStatus rejects any role other than developer/project_manager/admin', () => {
  const fn = extractFunction(UPDATE_SRC, 'export const updateTicketStatus = wrapServerAction', '\n// ── Assignment')
  assert.match(
    fn,
    /if \(currentUser\.role !== 'developer' && currentUser\.role !== 'project_manager' && currentUser\.role !== 'admin'\) \{\s*\n\s*throw new Error\('Only developers and managers can update ticket status'\)/,
  )
})

test('F: updateTicketStatus rejects a developer who is not the assigned developer on this ticket', () => {
  const fn = extractFunction(UPDATE_SRC, 'export const updateTicketStatus = wrapServerAction', '\n// ── Assignment')
  assert.match(
    fn,
    /if \(currentUser\.role === 'developer' && t\.assignedToId !== currentUser\.id\) \{\s*\n\s*throw new Error\('You can only update status of tickets assigned to you'\)/,
  )
  // This guard runs for EVERY newStatus value (including IN_PROGRESS from
  // REWORK) — it is not conditioned on the target or source status.
  const guardIdx = fn.indexOf("currentUser.role === 'developer' && t.assignedToId")
  const beforeGuard = fn.slice(0, guardIdx)
  assert.doesNotMatch(beforeGuard, /newStatus ===/, 'the assignment guard must run unconditionally, before any status-specific branching')
})

// ─── G & H. Work can be completed and resubmitted for Manager Review ──────

test('G: "Mark Completed" becomes available once IN_PROGRESS, regardless of whether that state was reached from ASSIGNED or REWORK', () => {
  // isInProgress is purely state-based — it does not distinguish how the
  // ticket arrived at IN_PROGRESS, so the Rework path is never a special case.
  assert.match(STATUS_ACTIONS_SRC, /const isInProgress = status === TicketStatus\.IN_PROGRESS/)
  assert.match(STATUS_ACTIONS_SRC, /\{\(isInProgress \|\| timerState !== 'idle'\) && \(/)
})

test('H: completing work (RESOLVED) still dispatches manager_review, cycle-scoped so a second Rework cycle notifies again', () => {
  const fn = extractFunction(UPDATE_SRC, 'export const updateTicketStatus = wrapServerAction', '\n// ── Assignment')
  assert.match(fn, /if \(newStatus === 'resolved' && t\.clientId\) \{/)
  assert.match(fn, /eventType: 'manager_review'/)
  assert.match(fn, /scope: `ticket:\$\{ticketId\}:cycle:\$\{t\.revisionCount \|\| 0\}`/)
})

// ─── I. The Rework loop is repeatable, not a one-time allowance ───────────

test('I: Start Work visibility for Rework is purely state-based — no cycle-count/one-time limiter attached', () => {
  const lineStart = STATUS_ACTIONS_SRC.indexOf('const canStartWork =')
  const line = STATUS_ACTIONS_SRC.slice(lineStart, STATUS_ACTIONS_SRC.indexOf('\n', lineStart))
  assert.doesNotMatch(line, /revisionCount|cycle|once|first/i, 'must not gate Start Work on how many times Rework has happened')
})

test('I: manager Rework increments revisionCount unconditionally on every cycle — never capped', () => {
  assert.match(REVISIONS_SRC, /const newRevisionNumber = \(t\.revisionCount \|\| 0\) \+ 1/)
  assert.match(REVISIONS_SRC, /ticketUpdate\.status = 'rework'/)
  // No MAX_REVISIONS / cap check anywhere near the rework assignment.
  assert.doesNotMatch(REVISIONS_SRC, /revisionCount\s*[<>]=?\s*\d+.*throw/i)
})

// ─── J. No duplicate notification from the Start Work transition ─────────

test('J: updateTicketStatus dispatches a notification ONLY for the resolved transition — never for in_progress', () => {
  const fn = extractFunction(UPDATE_SRC, 'export const updateTicketStatus = wrapServerAction', '\n// ── Assignment')
  const dispatchCalls = fn.match(/dispatchNotification\(/g) ?? []
  assert.equal(dispatchCalls.length, 1, 'updateTicketStatus must have exactly one dispatch site')
  assert.match(fn, /if \(newStatus === 'resolved' && t\.clientId\) \{[\s\S]*dispatchNotification\(/)
})

test('J: Start Work\'s only notification source is startTimer\'s single developer_started_work dispatch (Manager only, per the canonical spec)', () => {
  const fn = extractFunction(TIMELOGS_SRC, 'export const startTimer = wrapServerAction', 'export const stopTimer')
  const dispatchCalls = fn.match(/dispatchNotification\(/g) ?? []
  assert.equal(dispatchCalls.length, 1, 'startTimer must dispatch exactly once per call, regardless of the ticket\'s prior status')
  assert.match(fn, /eventType: 'developer_started_work'/)
  // Canonical recipient policy (preserved from the prior audit fix): Manager
  // only — the client recipient block must not have been reintroduced.
  assert.ok(!fn.includes('ticketRow.clientId'), 'the client must still not be a recipient of developer_started_work')
})
