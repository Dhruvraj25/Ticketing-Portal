import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLIENT_VISIBLE_HISTORY_ACTIONS } from '../lib/ticket-history-visibility.ts'

// ============================================================================
// Phase 2 — action-code split, client-visibility additions, and append-only
// revision history. These can't be exercised without a DB, so — matching this
// repo's established convention (ticket-draft.test.ts, rework-start-work.test.ts)
// — they are source-level regression guards over the actual current files.
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const REVISIONS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'revisions.ts'), 'utf8')
const ESTIMATES_SRC = readFileSync(join(ROOT, 'app', 'actions', 'estimates.ts'), 'utf8')
const UPDATE_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'update.ts'), 'utf8')
const CREATE_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'create.ts'), 'utf8')
const REVIEWS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'reviews.ts'), 'utf8')

// ─── CLIENT_VISIBLE_HISTORY_ACTIONS additions (requirements 6, 7, 8, 9) ────

test('client-visible actions now include the new client-facing events', () => {
  for (const action of ['forwarded_to_client', 'revision_requested', 'revision_approved', 'revision_rejected']) {
    assert.ok(CLIENT_VISIBLE_HISTORY_ACTIONS.has(action), `expected '${action}' to be client-visible`)
  }
})

test('privacy regression: rework_requested (internal manager/admin Rework) is NEVER client-visible', () => {
  assert.ok(!CLIENT_VISIBLE_HISTORY_ACTIONS.has('rework_requested'))
})

// ─── Action-code split (requirement 7) ─────────────────────────────────────

test('requestRevision: the manager/admin Rework branch writes action "rework_requested", not "revision_requested"', () => {
  // Find the ticketHistory insert inside requestRevision and confirm it
  // branches the action code on requester role.
  const fnStart = REVISIONS_SRC.indexOf('export const requestRevision')
  assert.notEqual(fnStart, -1)
  const fnBlock = REVISIONS_SRC.slice(fnStart, fnStart + 8000)
  assert.match(fnBlock, /action:\s*isClientRequest\s*\?\s*'revision_requested'\s*:\s*'rework_requested'/)
})

// Phase 3: rejectEstimate no longer uses 'revision_requested' — it now has
// its own distinct 'estimate_rejected' action code (see the Phase 3 block
// below), so an estimate rejection can never be mislabeled as a revision
// request again. This replaces the old Phase 2 test that asserted the
// (now-fixed) shared-action-code behavior.
test('estimates.rejectEstimate is still client-gated, but no longer shares an action code with genuine revision requests', () => {
  const fnStart = ESTIMATES_SRC.indexOf('export const rejectEstimate')
  assert.notEqual(fnStart, -1)
  const fnBlock = ESTIMATES_SRC.slice(fnStart, fnStart + 1500)
  assert.doesNotMatch(fnBlock, /action:\s*'revision_requested'/, 'must no longer collide with the genuine revision-request action code')
  // Confirm this function really is client-gated.
  assert.match(fnBlock, /role !== 'client'/)
})

test('approveRevision / rejectRevision are unchanged action codes (revision_approved / revision_rejected)', () => {
  assert.match(REVISIONS_SRC, /action:\s*'revision_approved'/)
  assert.match(REVISIONS_SRC, /action:\s*'revision_rejected'/)
})

// ─── Append-only history (requirement 10) ──────────────────────────────────

test('ticketHistory rows are only ever inserted, never updated/overwritten, across all revision/estimate flows', () => {
  for (const [name, src] of [
    ['revisions.ts', REVISIONS_SRC],
    ['estimates.ts', ESTIMATES_SRC],
    ['tickets/update.ts', UPDATE_SRC],
    ['tickets/create.ts', CREATE_SRC],
    ['reviews.ts', REVIEWS_SRC],
  ] as const) {
    assert.doesNotMatch(src, /\.update\(ticketHistory\)/, `${name} must never UPDATE ticketHistory — only INSERT`)
  }
})

test('revisionHistory rows are only ever inserted per request, never updated in place (status transitions update in place by design, but no new revisionNumber ever overwrites an old one)', () => {
  assert.doesNotMatch(REVISIONS_SRC, /\.update\(revisionHistory\)\s*\n?\s*\.set\(\{\s*\n?\s*revisionNumber/, 'revisionNumber must never be mutated on an existing row')
  // Every new revision cycle goes through .insert(revisionHistory), not .update
  assert.match(REVISIONS_SRC, /\.insert\(revisionHistory\)/)
})

// ─── Requirement 4 wording — Review → Customer Feedback (log text only) ───

test('review_submitted / review_updated write sites are untouched (label text lives in ticket-activity-format.ts, not here)', () => {
  assert.match(REVIEWS_SRC, /action:\s*'review_submitted'/)
  assert.match(REVIEWS_SRC, /action:\s*'review_updated'/)
})

// ============================================================================
// Phase 3 — Fix Activity Log Event Names and Actor Names
// ============================================================================

// ─── Bug 1: rejectEstimate now writes its own distinct action code ────────

test('Case 4: rejectEstimate writes action "estimate_rejected", not "revision_requested" (no longer collides with genuine revision requests)', () => {
  const fnStart = ESTIMATES_SRC.indexOf('export const rejectEstimate')
  assert.notEqual(fnStart, -1)
  const fnBlock = ESTIMATES_SRC.slice(fnStart, fnStart + 1500)
  assert.match(fnBlock, /action:\s*'estimate_rejected'/)
  assert.doesNotMatch(fnBlock, /action:\s*'revision_requested'/)
})

test('estimate_rejected is still client-visible after the write-site change (already present in both gates — not newly added)', () => {
  assert.ok(CLIENT_VISIBLE_HISTORY_ACTIONS.has('estimate_rejected'))
  assert.ok(CLIENT_VISIBLE_HISTORY_ACTIONS.has('revision_requested'))
})

// ─── Case 6: actor cannot be spoofed from frontend input ──────────────────

test('Case 6: rejectEstimate takes no client-suppliable actor field — the ticketHistory write uses userId: currentUser.id (server session), never a request parameter', () => {
  const sigStart = ESTIMATES_SRC.indexOf('export const rejectEstimate = wrapServerAction(\'rejectEstimate\', async function rejectEstimate(')
  assert.notEqual(sigStart, -1, 'rejectEstimate signature not found')
  const sigLine = ESTIMATES_SRC.slice(sigStart, ESTIMATES_SRC.indexOf(')', sigStart) + 1)
  assert.doesNotMatch(sigLine, /actor|userName|actorName|actorId/i, 'signature must not accept a client-suppliable actor identity')
  const fnStart = ESTIMATES_SRC.indexOf('export const rejectEstimate')
  const fnBlock = ESTIMATES_SRC.slice(fnStart, fnStart + 1500)
  assert.match(fnBlock, /userId:\s*currentUser\.id/, 'ticketHistory insert must attribute the authenticated session user')
  assert.match(fnBlock, /const currentUser = await getUser\(\)/, 'currentUser must come from the server-side session, not request input')
})

test('Case 6: requestRevision takes no client-suppliable actor field — both branches attribute the ticketHistory write to currentUser.id', () => {
  const sigStart = REVISIONS_SRC.indexOf('export const requestRevision = wrapServerAction(\'requestRevision\', async function requestRevision(data: {')
  assert.notEqual(sigStart, -1, 'requestRevision signature not found')
  const sigBlock = REVISIONS_SRC.slice(sigStart, sigStart + 300)
  assert.doesNotMatch(sigBlock, /actorId|actorName|userName/i, 'data param must not accept a client-suppliable actor identity')
  const fnStart = REVISIONS_SRC.indexOf('export const requestRevision')
  const fnBlock = REVISIONS_SRC.slice(fnStart, fnStart + 5000)
  assert.match(fnBlock, /userId:\s*currentUser\.id/, 'ticketHistory insert must attribute the authenticated session user')
})

// ─── Cases 2 & 3: Rework detail-line names the real actor, not a role word ─

test('Cases 2 & 3: the Rework branch\'s detail text uses currentUser.name, never a hardcoded "manager"/"admin" word', () => {
  const fnStart = REVISIONS_SRC.indexOf('export const requestRevision')
  const fnBlock = REVISIONS_SRC.slice(fnStart, fnStart + 5000)
  const reworkLineMatch = fnBlock.match(/:\s*`Sent back for rework by \$\{[^}]+\}`/)
  assert.ok(reworkLineMatch, 'expected the Rework detail-line template string')
  assert.match(reworkLineMatch[0], /currentUser\.name/, 'must name the real actor, not a role-derived word')
  assert.doesNotMatch(reworkLineMatch[0], /'manager'|'admin'/, 'must not hardcode a generic role word in place of the actor\'s name')
})

// ─── Case 7: unrelated actions/labels are byte-for-byte unchanged ─────────

test('Case 7: every OTHER action code this file already asserted is still present and unchanged (existing entries still render correctly)', () => {
  assert.match(REVISIONS_SRC, /action:\s*'revision_approved'/)
  assert.match(REVISIONS_SRC, /action:\s*'revision_rejected'/)
  assert.match(REVISIONS_SRC, /action:\s*isClientRequest \? 'revision_requested' : 'rework_requested'/)
  assert.match(REVIEWS_SRC, /action:\s*'review_submitted'/)
  assert.match(REVIEWS_SRC, /action:\s*'review_updated'/)
})

// ============================================================================
// Client Activity Log Visibility & Message Mapping audit
// ============================================================================
// Root cause recap: two categories of bug existed alongside the (already
// correct) action-code whitelist in CLIENT_VISIBLE_HISTORY_ACTIONS:
//   1. formatActivityEntry() used bespoke, non-catalog wording for
//      estimate_approved / estimate_rejected (fixed in ticket-activity-format.ts
//      and covered by ticket-activity-format.test.ts's "Catalog" tests).
//   2. Several write-sites baked the INTERNAL approver/uploader's real name,
//      or the raw DB action code, directly into ticketHistory.newValue — a
//      detail string that renders verbatim regardless of viewer role, so it
//      bypassed the userName-blanking privacy layer in getTicketHistory()
//      entirely. Fixed at the write-sites below.
// ============================================================================

const ATTACHMENTS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'attachments.ts'), 'utf8')
const QUERIES_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'queries.ts'), 'utf8')

// ─── Requirement 14: old DB event names never exposed to clients ──────────

test('rejectEstimate detail text no longer leaks the raw "estimate_rejected" DB action code', () => {
  const fnStart = ESTIMATES_SRC.indexOf('export const rejectEstimate')
  const fnBlock = ESTIMATES_SRC.slice(fnStart, fnStart + 1500)
  assert.doesNotMatch(fnBlock, /newValue:\s*`estimate_rejected:/, 'must not bake the raw action code into the human-readable detail line')
  assert.match(fnBlock, /newValue:\s*`estimate rejected: \$\{reason\}`/)
})

// ─── Internal-actor-identity leak: revision approve/reject detail lines ───
// approveRevision/rejectRevision only ever act on CLIENT-initiated revisions
// (manager/admin Rework never reaches 'pending_approval' — see requestRevision
// above), so 'revision_approved'/'revision_rejected' are correctly
// client-visible events. But the INTERNAL manager/admin who approved/rejected
// must never be named in the detail text — the main line's actor already
// resolves privacy-safely (role-label fallback) via ticket-activity-format.ts.

test('approveRevision detail line no longer bakes the internal approver\'s real name', () => {
  const fnStart = REVISIONS_SRC.indexOf('export const approveRevision')
  const fnBlock = REVISIONS_SRC.slice(fnStart, fnStart + 3000)
  assert.doesNotMatch(fnBlock, /newValue:\s*`Revision #\$\{rev\.revisionNumber\} approved by \$\{currentUser\.name\}`/, 'must not name the internal approver in client-visible detail text')
  assert.match(fnBlock, /newValue:\s*`Revision #\$\{rev\.revisionNumber\} approved`/)
})

test('rejectRevision detail line no longer bakes the internal reviewer\'s real name (reason is preserved)', () => {
  const fnStart = REVISIONS_SRC.indexOf('export const rejectRevision')
  const fnBlock = REVISIONS_SRC.slice(fnStart, fnStart + 3000)
  assert.doesNotMatch(fnBlock, /newValue:\s*`Revision #\$\{rev\.revisionNumber\} rejected by \$\{currentUser\.name\}/, 'must not name the internal reviewer in client-visible detail text')
  assert.match(fnBlock, /newValue:\s*`Revision #\$\{rev\.revisionNumber\} rejected: \$\{reason\}`/)
})

// ─── Internal-actor-identity leak: attachment upload detail line ──────────
// 'attachment_uploaded' is client-visible and any role (including internal
// developer/manager/admin) can upload. The detail line used to bake the
// uploader's role AND real name unconditionally — fixed to carry only the
// filename/size; the actor is resolved privacy-safely on the main line.

test('saveAttachment detail line no longer bakes the uploader\'s name/role unconditionally', () => {
  const fnStart = ATTACHMENTS_SRC.indexOf('export const saveAttachment')
  const fnBlock = ATTACHMENTS_SRC.slice(fnStart, fnStart + 2000)
  assert.doesNotMatch(fnBlock, /newValue:\s*`\$\{roleLabel\}\s*\$\{currentUser\.name\}/, 'must not name the uploader in client-visible detail text')
})

// ─── Requirement 12: internal (admin/manager/developer) visibility is a
// role-gated branch, not a global filter — non-client roles are unaffected ─

test('getTicketHistory / getTicketHistoryCount only apply the client whitelist when role === "client" — internal roles are unrestricted', () => {
  for (const fnName of ['getTicketHistory', 'getTicketHistoryCount']) {
    const fnStart = QUERIES_SRC.indexOf(`export const ${fnName}`)
    assert.notEqual(fnStart, -1, `${fnName} not found`)
    const fnBlock = QUERIES_SRC.slice(fnStart, fnStart + 1500)
    assert.match(fnBlock, /role === 'client'/, `${fnName} must gate the CLIENT_VISIBLE_HISTORY_ACTIONS filter behind role === 'client'`)
    assert.match(fnBlock, /CLIENT_VISIBLE_HISTORY_ACTIONS/, `${fnName} must apply the client whitelist somewhere in its body`)
  }
})

// ─── Requirement 13: actor identity always traces back to the authenticated
// session, never a client-suppliable field, across every write-site touched
// by this audit ───────────────────────────────────────────────────────────

test('approveRevision / rejectRevision / saveAttachment all attribute ticketHistory writes to the authenticated session user', () => {
  for (const [name, src, fnMarker] of [
    ['approveRevision', REVISIONS_SRC, 'export const approveRevision'],
    ['rejectRevision', REVISIONS_SRC, 'export const rejectRevision'],
    ['saveAttachment', ATTACHMENTS_SRC, 'export const saveAttachment'],
  ] as const) {
    const fnStart = src.indexOf(fnMarker)
    assert.notEqual(fnStart, -1, `${name} not found`)
    const fnBlock = src.slice(fnStart, fnStart + 3000)
    assert.match(fnBlock, /userId:\s*currentUser\.id/, `${name} must attribute the ticketHistory write to currentUser.id`)
  }
})
