import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Phase 3 — Historical / On Behalf of Client ticket creation: integration-
// shaped regression guards.
// ============================================================================
// createTicket() (app/actions/tickets/create.ts) is a 'use server' module
// importing '@/lib/db' — not importable directly under plain node:test
// (same constraint as tests/report-access.test.ts, tests/rework-start-work.test.ts).
// These tests read the real source instead of re-implementing DB behavior,
// so they fail the moment someone edits the atomicity/permission logic
// out from under them. Pure validation/derivation logic itself is covered
// with real unit tests in tests/historical-ticket.test.ts.

const ROOT = join(import.meta.dirname, '..')
const CREATE_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'create.ts'), 'utf8')
const NEW_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'tickets', 'new', 'page.tsx'), 'utf8')
const UPDATE_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'update.ts'), 'utf8')
const TICKETS_INDEX_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'index.ts'), 'utf8')
const TICKETS_DEPRECATED_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets.ts'), 'utf8')
const DETAIL_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'tickets', '[id]', 'page.tsx'), 'utf8')

function functionBody(src: string, startMarker: string): string {
  const start = src.indexOf(startMarker)
  assert.ok(start >= 0, `could not find "${startMarker}"`)
  return src.slice(start)
}

// ─── Requirement 7 & 8: atomicity — ticket insert + wallet deduction in ONE
//     db.transaction(), so a failure anywhere rolls back everything ────────

test('createTicket: the historical branch wraps ticket insert + wallet update + wallet transaction log inside a single db.transaction()', () => {
  const txStart = CREATE_SRC.indexOf('await db.transaction(async (tx) => {')
  assert.ok(txStart >= 0, 'expected a db.transaction(...) block in create.ts')
  const txEnd = CREATE_SRC.indexOf('\n    })', txStart)
  assert.ok(txEnd > txStart)
  const txBody = CREATE_SRC.slice(txStart, txEnd)

  // All three writes must use the `tx` handle, not the bare `db` — that's
  // what makes them atomic with each other.
  assert.match(txBody, /tx\s*\n?\s*\.insert\(ticket\)/, 'ticket insert must go through tx')
  assert.match(txBody, /tx\.update\(supportWallet\)/, 'wallet balance update must go through tx')
  assert.match(txBody, /tx\.insert\(walletTransaction\)/, 'wallet transaction log must go through tx')
  assert.match(txBody, /tx\.insert\(ticketHistory\)/, 'activity log must go through tx')

  // No bare db.insert(ticket)/db.update(supportWallet) call inside that same
  // block — every write inside the transaction body must be tx-scoped.
  assert.doesNotMatch(txBody, /[^x]\.\s*db\.insert\(ticket\)/)
  assert.doesNotMatch(txBody, /[^x]\.\s*db\.update\(supportWallet\)/)
})

test('createTicket: ALL historical validation (hours, dates, wallet lookup, sufficiency) runs BEFORE the transaction starts', () => {
  const validateIdx = CREATE_SRC.indexOf("data.ticketType === 'historical'")
  const txIdx = CREATE_SRC.indexOf('await db.transaction(async (tx) => {')
  assert.ok(validateIdx >= 0 && txIdx > validateIdx, 'validation block must appear before the transaction')

  const validationBlock = CREATE_SRC.slice(validateIdx, txIdx)
  assert.match(validationBlock, /validateSupportHoursConsumed/)
  assert.match(validationBlock, /validateHistoricalDates/)
  assert.match(validationBlock, /checkWalletSufficiency/)
  // No ticket/wallet writes before the transaction — only a wallet SELECT.
  assert.doesNotMatch(validationBlock, /db\.insert\(ticket\)/)
  assert.doesNotMatch(validationBlock, /db\.update\(supportWallet\)/)
})

// ─── Requirement 6: invalid support hours / insufficient wallet reject
//     before any write happens (server-side, never trusts the client) ─────

test('createTicket: throws on the validation result before reaching the transaction (no silent pass-through)', () => {
  assert.match(CREATE_SRC, /if \(!hoursCheck\.valid\) throw new Error\(hoursCheck\.error\)/)
  assert.match(CREATE_SRC, /if \(!datesCheck\.valid\) throw new Error\(datesCheck\.error\)/)
  assert.match(CREATE_SRC, /if \(!sufficiencyCheck\.ok\) throw new Error\(sufficiencyCheck\.error\)/)
})

// ─── Requirement 9 & 10: admin/manager permission parity ───────────────────

test('createTicket: ticketType is rejected for any role other than admin/project_manager (never trusts the client)', () => {
  const body = functionBody(CREATE_SRC, 'export const createTicket')
  const guardIdx = body.indexOf('if (data.ticketType &&')
  assert.ok(guardIdx >= 0)
  const guard = body.slice(guardIdx, guardIdx + 200)
  assert.match(guard, /currentUser\.role !== 'admin'/)
  assert.match(guard, /currentUser\.role !== 'project_manager'/)
  assert.doesNotMatch(guard, /role === 'admin'\s*&&\s*!/, 'must not be an admin-only gate — project_manager must pass too')
})

test('the ticket-creation page gates the new fields on BOTH admin and project_manager (isStaff), not admin alone', () => {
  assert.match(NEW_PAGE_SRC, /const isStaff = userRole === 'admin' \|\| userRole === 'project_manager'/)
  assert.match(NEW_PAGE_SRC, /\{isStaff && \(/)
  // Regression guard: the new Ticket Type block must not be re-narrowed to admin-only.
  assert.doesNotMatch(NEW_PAGE_SRC, /\{userRole === 'admin' && \(\s*\n\s*<div[^>]*data-tour="ticket-type"/)
})

// ─── Historical tickets bypass the generic "can afford a NEW ticket" gate ──

test('createTicket: the standard checkClientCanCreateTicket balance gate is skipped for historical tickets (they have their own sufficiency check)', () => {
  const gateIdx = CREATE_SRC.indexOf('if (actualClientId !== currentUser.id && data.projectId')
  assert.ok(gateIdx >= 0, 'expected the standard staff-creates-for-client balance gate')
  const gateLine = CREATE_SRC.slice(gateIdx, CREATE_SRC.indexOf('\n', gateIdx))
  assert.match(gateLine, /data\.ticketType !== 'historical'/, 'the generic balance gate must not run for historical tickets — they are validated by checkWalletSufficiency against the exact Support Hour Consumed amount instead')
})

// ─── Requirement 1: normal / client-initiated ticket creation is untouched ─

test('createTicket: the historical/on_behalf branches are gated entirely behind data.ticketType — a request with no ticketType takes the original insert path', () => {
  const body = functionBody(CREATE_SRC, 'export const createTicket')
  assert.match(body, /if \(historicalPlan\) \{/)
  assert.match(body, /\} else \{/)
  // The else branch (normal path) still inserts with status: 'new' exactly as before.
  const elseIdx = body.indexOf('} else {')
  const elseBlock = body.slice(elseIdx, elseIdx + 600)
  assert.match(elseBlock, /status: 'new'/)
  // estimateWorkflowSkipped is only set when a ticketType was actually chosen —
  // a plain client-initiated ticket (ticketType undefined) never touches that column.
  assert.match(elseBlock, /\.\.\.\(data\.ticketType \? \{ estimateWorkflowSkipped:/)
})

// ─── No "Historical" badge/label anywhere a ticket is displayed ────────────

test('no "Historical" badge/label was added to any ticket list/card/detail display component', () => {
  const componentsToCheck = [
    ['ticket detail page', DETAIL_PAGE_SRC],
  ] as const
  for (const [name, src] of componentsToCheck) {
    assert.doesNotMatch(src, /Historical/, `${name} must not display a "Historical" badge/label`)
  }
})

test('the only "Historical" strings in the diff live on the CREATE form (a one-time input, not a persisted display) and its own tests', () => {
  assert.match(NEW_PAGE_SRC, /Historical/, 'the create form is expected to offer "Historical" as a Ticket Type option')
})

// ─── Part A: old admin ticket-dates feature fully removed, no dangling refs ─

test('updateTicketDates no longer exists anywhere in the action layer', () => {
  assert.doesNotMatch(CREATE_SRC, /updateTicketDates/)
  assert.doesNotMatch(UPDATE_SRC, /updateTicketDates/)
  assert.doesNotMatch(TICKETS_INDEX_SRC, /updateTicketDates/)
  assert.doesNotMatch(TICKETS_DEPRECATED_SRC, /updateTicketDates/)
})

test('TicketDatesEditor is no longer imported or rendered on the ticket detail page', () => {
  assert.doesNotMatch(DETAIL_PAGE_SRC, /TicketDatesEditor/)
  assert.doesNotMatch(DETAIL_PAGE_SRC, /ticket-dates-editor/)
})

test('ticket.createdAt/closedAt columns and the normal (non-editor) date display are untouched', () => {
  // The "Details" panel's Created date is still rendered — only the admin
  // retroactive-EDIT feature was removed, not the read-only date display.
  assert.match(DETAIL_PAGE_SRC, /new Date\(ticket\.createdAt\)/)
})
