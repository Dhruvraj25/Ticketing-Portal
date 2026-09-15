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
  const fnBlock = REVISIONS_SRC.slice(fnStart, fnStart + 5000)
  assert.match(fnBlock, /action:\s*isClientRequest\s*\?\s*'revision_requested'\s*:\s*'rework_requested'/)
})

test('estimates.rejectEstimate still uses "revision_requested" (client-only caller — safe to keep)', () => {
  const fnStart = ESTIMATES_SRC.indexOf('export const rejectEstimate')
  assert.notEqual(fnStart, -1)
  const fnBlock = ESTIMATES_SRC.slice(fnStart, fnStart + 1500)
  assert.match(fnBlock, /action:\s*'revision_requested'/)
  // Confirm this function really is client-gated, so exposing the action is safe.
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
