import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatActivityEntry, ACTION_LABELS } from '../lib/ticket-activity-format.ts'
import { CLIENT_VISIBLE_HISTORY_ACTIONS } from '../lib/ticket-history-visibility.ts'

// ============================================================================
// Client Dashboard Activity Log — standardization audit
// ============================================================================
// This repo already fixed the wording/visibility bugs targeted here in an
// earlier pass (see tests/ticket-activity-format.test.ts's "Catalog" tests
// and tests/activity-log-visibility.test.ts). This file closes the specific
// gaps against the 14 numbered test cases in that audit's brief that were
// not yet covered by name, and re-verifies (does not re-fix) the rest.
// No production code changed for this file — see the final report.
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const ESTIMATES_SRC = readFileSync(join(ROOT, 'app', 'actions', 'estimates.ts'), 'utf8')
const REVISIONS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'revisions.ts'), 'utf8')
const CREATE_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'create.ts'), 'utf8')
const QUERIES_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'queries.ts'), 'utf8')

// ─── Case 1: client-created support request ────────────────────────────────

test('Case 1: "created" is in CLIENT_VISIBLE_HISTORY_ACTIONS and formats as "New support request created by [Client]"', () => {
  assert.ok(CLIENT_VISIBLE_HISTORY_ACTIONS.has('created'))
  const out = formatActivityEntry({ action: 'created', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'New support request created by Suketu Bhatt')
})

// ─── Case 2: client approves estimate — exact write-site detail text ──────

test('Case 2: approveEstimate writes newValue exactly "${hours}h estimate approved" — the dynamic detail line under "Estimate approved By [Client]"', () => {
  const fnStart = ESTIMATES_SRC.indexOf('export const approveEstimate')
  const fnBlock = ESTIMATES_SRC.slice(fnStart, fnStart + 6000)
  assert.match(fnBlock, /action:\s*'estimate_approved'/)
  assert.match(fnBlock, /newValue:\s*`\$\{t\.estimatedHours\}h estimate approved`/)
  const out = formatActivityEntry({ action: 'estimate_approved', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'Estimate approved By Suketu Bhatt')
})

// ─── Case 3: client rejects estimate — must never read "Revision requested" ─

test('Case 3: estimate rejection never renders as "Revision requested by ..." — distinct action, distinct label, distinct wording', () => {
  const rejected = formatActivityEntry({ action: 'estimate_rejected', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(rejected.text, 'Estimate hours request rejected by Suketu Bhatt')
  assert.doesNotMatch(rejected.text, /^Revision requested/)

  const revision = formatActivityEntry({ action: 'revision_requested', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.notEqual(rejected.text, revision.text, 'an estimate rejection must never collide with a genuine revision request')
})

// ─── Case 4: manager sends estimate for approval — exact write-site text ──

test('Case 4: submitEstimate writes action "estimate_created" with newValue "${hours}h estimate submitted, deadline: ${date}"', () => {
  const fnStart = ESTIMATES_SRC.indexOf('export const submitEstimate')
  const fnBlock = ESTIMATES_SRC.slice(fnStart, fnStart + 6000)
  assert.match(fnBlock, /action:\s*'estimate_created'/)
  assert.match(fnBlock, /newValue:\s*`\$\{data\.estimatedHours\}h estimate submitted, deadline: \$\{approvalDeadline\.toISOString\(\)\.split\('T'\)\[0\]\}`/)
  const out = formatActivityEntry({ action: 'estimate_created', userName: '', userRole: 'project_manager' })
  assert.equal(out.text, 'Estimate hours sent for approval by Support Manager / Project Manager')
})

// ─── Case 5: manager updates estimate — exact write-site text ─────────────

test('Case 5: updateEstimate writes action "estimate_modified" with newValue "${hours}h estimate updated"', () => {
  const fnStart = ESTIMATES_SRC.indexOf('export const updateEstimate')
  const fnBlock = ESTIMATES_SRC.slice(fnStart, fnStart + 6000)
  assert.match(fnBlock, /action:\s*'estimate_modified'/)
  assert.match(fnBlock, /newValue:\s*`\$\{data\.estimatedHours\}h estimate updated`/)
  const out = formatActivityEntry({ action: 'estimate_modified', userName: '', userRole: 'project_manager' })
  assert.equal(out.text, 'Estimate updated by Support Manager / Project Manager')
})

// ─── Case 6: manager requests internal revision — never visible ───────────

test('Case 6: an internal manager/admin Rework request is written under "rework_requested", which is absent from CLIENT_VISIBLE_HISTORY_ACTIONS', () => {
  assert.match(REVISIONS_SRC, /action:\s*isClientRequest \? 'revision_requested' : 'rework_requested'/)
  assert.ok(!CLIENT_VISIBLE_HISTORY_ACTIONS.has('rework_requested'))
})

// ─── Case 7: admin "approves" an internal revision — structurally impossible ─
// There is no internal-revision approval event in this codebase: Rework
// (internal) is actioned immediately with no approval gate, and
// approveRevision/rejectRevision categorically refuse any row that isn't
// 'pending_approval' — a state ONLY a client-initiated request ever reaches.
// So 'revision_approved'/'revision_rejected' can never describe an internal
// revision; asserting that invariant is what keeps Case 7 true.

test('Case 7: approveRevision/rejectRevision refuse any revision that is not "pending_approval" — an internal Rework row (status "acknowledged") can never be approved/rejected, so no internal "approved" event can ever reach the client', () => {
  const approveBlock = REVISIONS_SRC.slice(REVISIONS_SRC.indexOf('export const approveRevision'), REVISIONS_SRC.indexOf('export const rejectRevision'))
  assert.match(approveBlock, /if \(rev\.status !== 'pending_approval'\) throw new Error/)

  const rejectStart = REVISIONS_SRC.indexOf('export const rejectRevision')
  const rejectBlock = REVISIONS_SRC.slice(rejectStart, rejectStart + 1500)
  assert.match(rejectBlock, /if \(rev\.status !== 'pending_approval'\) throw new Error/)

  // Only the client-initiated branch of requestRevision ever sets 'pending_approval'.
  const requestBlock = REVISIONS_SRC.slice(REVISIONS_SRC.indexOf('export const requestRevision'))
  assert.match(requestBlock, /status: currentUser\.role === 'client' \? 'pending_approval' : 'acknowledged'/)
})

// ─── Case 8: internal revision detail text — never visible ────────────────

test('Case 8: the internal Rework detail line ("Sent back for rework by X: #1: ...") is written only under the hidden "rework_requested" action — it can never surface via a client-visible action code', () => {
  const requestBlock = REVISIONS_SRC.slice(REVISIONS_SRC.indexOf('export const requestRevision'))
  const insertBlock = requestBlock.slice(requestBlock.indexOf('await tx.insert(ticketHistory)'), requestBlock.indexOf('await tx.insert(ticketHistory)') + 400)
  assert.match(insertBlock, /action:\s*isClientRequest \? 'revision_requested' : 'rework_requested'/)
  // The detail newValue (containing "#{revisionNumber}: {notes}") is written
  // to the SAME row as the action above — when isClientRequest is false,
  // that row's action is 'rework_requested', already proven excluded from
  // CLIENT_VISIBLE_HISTORY_ACTIONS (Case 6) and from getTicketHistory's
  // client query (Case 9 below). It is never split into two separate rows.
  assert.match(insertBlock, /newValue:\s*`\$\{actionLabel\}: #\$\{newRevisionNumber\}: \$\{data\.revisionNotes/)
})

// ─── Case 9: client activity API never returns internal revision events ───

test('Case 9: getTicketHistory / getTicketHistoryCount apply inArray(ticketHistory.action, CLIENT_VISIBLE_HISTORY_ACTIONS) for role==="client" — rework_requested rows are excluded at the SQL level, not merely hidden in the UI', () => {
  for (const fnName of ['getTicketHistory', 'getTicketHistoryCount']) {
    const fnStart = QUERIES_SRC.indexOf(`export const ${fnName}`)
    assert.notEqual(fnStart, -1, `${fnName} not found`)
    const fnBlock = QUERIES_SRC.slice(fnStart, fnStart + 1500)
    assert.match(fnBlock, /role === 'client'/)
    assert.match(fnBlock, /inArray\(ticketHistory\.action, \[\.\.\.CLIENT_VISIBLE_HISTORY_ACTIONS\]\)/)
  }
  assert.ok(!CLIENT_VISIBLE_HISTORY_ACTIONS.has('rework_requested'), 'rework_requested must be absent from the set the SQL filter uses')
})

// ─── Case 11: explicitly client-facing Admin activity remains visible ─────

test('Case 11: "Customer Feedback requested by Admin" (forwarded_to_client) is client-visible and role-label-safe for an Admin actor', () => {
  assert.ok(CLIENT_VISIBLE_HISTORY_ACTIONS.has('forwarded_to_client'))
  const out = formatActivityEntry({ action: 'forwarded_to_client', userName: '', userRole: 'admin' })
  assert.equal(out.text, 'Customer feedback requested by Admin')
})

// ─── Case 12: activity ordering/timestamps are untouched ──────────────────

test('Case 12: getTicketHistory orders by ticketHistory.createdAt descending — unchanged by this audit (no reordering, no timestamp field touched)', () => {
  const fnStart = QUERIES_SRC.indexOf('export const getTicketHistory')
  const fnBlock = QUERIES_SRC.slice(fnStart, fnStart + 1500)
  assert.match(fnBlock, /\.orderBy\(desc\(ticketHistory\.createdAt\)\)/)
})

// ─── Case 13: no duplicate activity entries ────────────────────────────────

test('Case 13: each client-visible write-site inserts exactly ONE ticketHistory row per action — no duplicate insert was introduced', () => {
  const sites: Array<[string, string, string]> = [
    ['approveEstimate', ESTIMATES_SRC, 'export const approveEstimate'],
    ['rejectEstimate', ESTIMATES_SRC, 'export const rejectEstimate'],
    ['submitEstimate', ESTIMATES_SRC, 'export const submitEstimate'],
    ['updateEstimate', ESTIMATES_SRC, 'export const updateEstimate'],
    ['approveRevision', REVISIONS_SRC, 'export const approveRevision'],
    ['rejectRevision', REVISIONS_SRC, 'export const rejectRevision'],
  ]
  for (const [name, src, marker] of sites) {
    const start = src.indexOf(marker)
    assert.notEqual(start, -1, `${name} not found`)
    // Bound the search to this function only (next "export const" or EOF).
    const nextExport = src.indexOf('\nexport const', start + marker.length)
    const fnBlock = src.slice(start, nextExport === -1 ? undefined : nextExport)
    const inserts = fnBlock.match(/\.insert\(ticketHistory\)/g) || []
    assert.equal(inserts.length, 1, `${name} must insert exactly one ticketHistory row, found ${inserts.length}`)
  }
})

// ─── Case 14: no raw internal event/action names ever reach the client ────

test('Case 14: every CLIENT_VISIBLE_HISTORY_ACTIONS entry has a human-readable ACTION_LABELS mapping — none render as a raw snake_case action string', () => {
  for (const action of CLIENT_VISIBLE_HISTORY_ACTIONS) {
    const config = ACTION_LABELS[action]
    assert.ok(config, `client-visible action "${action}" has no ACTION_LABELS entry — it would render as a raw event name`)
    assert.doesNotMatch(config.label, /_/, `ACTION_LABELS["${action}"].label ("${config.label}") must not contain an underscore (raw event name leak)`)
  }
})

test('Case 14: rejectEstimate never writes the raw DB action code into the client-visible detail text', () => {
  const fnStart = ESTIMATES_SRC.indexOf('export const rejectEstimate')
  const fnBlock = ESTIMATES_SRC.slice(fnStart, fnStart + 1500)
  assert.doesNotMatch(fnBlock, /newValue:\s*`estimate_rejected:/)
  assert.match(fnBlock, /newValue:\s*`estimate rejected: \$\{reason\}`/)
})

// ─── Full example scenario from the audit brief, end to end ───────────────

test('full scenario: the exact "old → new" mapping from the audit brief formats correctly for every listed event', () => {
  const cases: Array<[Parameters<typeof formatActivityEntry>[0], string]> = [
    [{ action: 'review_submitted', userName: 'Suketu Bhatt', userRole: 'client' }, 'Customer feedback submitted by Suketu Bhatt'],
    [{ action: 'client_approved', userName: 'Suketu Bhatt', userRole: 'client' }, 'Support request marked as completed by Suketu Bhatt'],
    [{ action: 'forwarded_to_client', userName: '', userRole: 'admin' }, 'Customer feedback requested by Admin'],
    [{ action: 'estimate_approved', userName: 'Suketu Bhatt', userRole: 'client' }, 'Estimate approved By Suketu Bhatt'],
    [{ action: 'estimate_modified', userName: '', userRole: 'project_manager' }, 'Estimate updated by Support Manager / Project Manager'],
    [{ action: 'estimate_rejected', userName: 'Suketu Bhatt', userRole: 'client' }, 'Estimate hours request rejected by Suketu Bhatt'],
    [{ action: 'estimate_created', userName: '', userRole: 'project_manager' }, 'Estimate hours sent for approval by Support Manager / Project Manager'],
    [{ action: 'created', userName: 'Suketu Bhatt', userRole: 'client' }, 'New support request created by Suketu Bhatt'],
  ]
  for (const [input, expected] of cases) {
    assert.equal(formatActivityEntry(input).text, expected)
  }
})
