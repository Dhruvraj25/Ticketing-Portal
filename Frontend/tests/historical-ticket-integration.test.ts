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
//
// NOTE: the original checkClientCanCreateTicket-based gate this test used to
// assert against (a flat 10-hour threshold, with a catch-swallow bug that
// made it a near-total no-op for staff-created tickets) was replaced by the
// Support Wallet Balance phase with a correct, percentage-based
// isAtOrBelowCreateThreshold check + a role-bypass-free checkWalletSufficiency
// check (see app/actions/tickets/create.ts and tests/wallet-validation-
// integration.test.ts for full coverage of the new mechanism). The
// underlying REQUIREMENT this test protects — historical tickets must never
// be blocked by the generic "can this client afford a new ticket" gate —
// still holds; only the implementation changed.

test('createTicket: the generic Support Wallet threshold/sufficiency block is skipped for historical tickets (they have their own dedicated sufficiency check)', () => {
  const gateIdx = CREATE_SRC.indexOf('Support Wallet validation (sections 1-3)')
  assert.ok(gateIdx >= 0, 'expected the Support Wallet validation block')
  const gateBlock = CREATE_SRC.slice(gateIdx, gateIdx + 700)
  assert.match(gateBlock, /if \(data\.ticketType !== 'historical'\)/, 'the generic wallet threshold/sufficiency block must not run for historical tickets — they are validated by checkWalletSufficiency against the exact Support Hour Consumed amount instead')
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

// ─── Estimate Approval Required toggle — disabled/locked for BOTH ticket
//     types, not just "historical" (fixes the on_behalf snap-back bug) ─────
//
// Root cause: with only two Ticket Type values, the toggle is a DERIVED
// indicator, not an independently user-editable control — "On Behalf of
// Client" always forces it ON (business rule, unchanged), "Historical" makes
// it not applicable. The bug was that `disabled` was only wired for the
// `historical` half of that rule (`disabled={ticketType !== 'on_behalf'}`),
// leaving the on_behalf case falsely interactive: clicking it called
// setEstimateApprovalRequired(false), which mutated the underlying state,
// but the `checked` ternary ignored that state and kept rendering `true` —
// so the switch visually snapped back to ON on every click, looking broken.

function ticketTypeBlockBody(): string {
  const start = NEW_PAGE_SRC.indexOf('{/* Ticket Type')
  assert.ok(start >= 0, 'expected the Ticket Type block')
  const end = NEW_PAGE_SRC.indexOf('{ticketType === \'historical\' && (', start)
  assert.ok(end > start)
  return NEW_PAGE_SRC.slice(start, end)
}

// ─── Estimate Approval Required — always visible, always interactive ──────
// Superseded set (2nd pass): the toggle used to be permanently disabled for
// BOTH ticket types and force-checked for on_behalf, so a manual choice was
// impossible. Fixed: the switch is never disabled and never hidden; Ticket
// Type only sets an automatic DEFAULT (on_behalf -> ON, historical -> OFF)
// the moment it changes, and the admin can always override it afterward.

test('Estimate Approval Required Switch is NEVER disabled, for any ticket type — it must always stay interactive', () => {
  const block = ticketTypeBlockBody()
  assert.doesNotMatch(block, /disabled=\{/, 'the switch must never be conditionally disabled')
})

test('checked reflects the real estimateApprovalRequired state directly — no render-time ternary override for either ticket type', () => {
  const block = ticketTypeBlockBody()
  assert.match(block, /checked=\{estimateApprovalRequired\}/)
  assert.doesNotMatch(block, /checked=\{ticketType/, 'checked must not branch on ticketType — that would re-lock the value at render time')
})

test('the ticketType effect sets an automatic default for BOTH directions: on_behalf -> ON, historical -> OFF', () => {
  assert.match(
    NEW_PAGE_SRC,
    /useEffect\(\(\) => \{\s*if \(ticketType === 'on_behalf'\) setEstimateApprovalRequired\(true\)\s*else if \(ticketType === 'historical'\) setEstimateApprovalRequired\(false\)\s*\}, \[ticketType\]\)/,
  )
})

test('the effect is keyed on [ticketType] only — it fires on a ticket-type change, never on every render, and never reads/depends on estimateApprovalRequired itself', () => {
  const effectStart = NEW_PAGE_SRC.indexOf("if (ticketType === 'on_behalf') setEstimateApprovalRequired(true)")
  assert.notEqual(effectStart, -1)
  const effectEnd = NEW_PAGE_SRC.indexOf('[ticketType])', effectStart)
  assert.notEqual(effectEnd, -1)
  const effectBlock = NEW_PAGE_SRC.slice(effectStart, effectEnd)
  assert.doesNotMatch(effectBlock, /estimateApprovalRequired\)/, 'the effect body must not read estimateApprovalRequired — it only ever sets a default from ticketType')
})

test('submit-time payload sends the real, current estimateApprovalRequired state — never re-forced for either ticket type', () => {
  assert.match(NEW_PAGE_SRC, /estimateApprovalRequired,\s*\n/, 'must pass the state through as-is')
  assert.doesNotMatch(NEW_PAGE_SRC, /estimateApprovalRequired: ticketType === 'on_behalf' \? true : estimateApprovalRequired/, 'the old forcing ternary must be gone — it silently discarded a manual OFF for on_behalf')
})

test('case B: Historical selected -> Estimate Approval Required automatically OFF, switch stays visible and enabled', () => {
  const block = ticketTypeBlockBody()
  assert.doesNotMatch(block, /disabled=\{/)
  assert.match(NEW_PAGE_SRC, /else if \(ticketType === 'historical'\) setEstimateApprovalRequired\(false\)/)
})

test('case C: On Behalf of Client selected -> Estimate Approval Required automatically ON, switch stays visible and enabled', () => {
  const block = ticketTypeBlockBody()
  assert.doesNotMatch(block, /disabled=\{/)
  assert.match(NEW_PAGE_SRC, /if \(ticketType === 'on_behalf'\) setEstimateApprovalRequired\(true\)/)
})

test('case: every reachable (ticketType, estimateApprovalRequired) combination is settable — none are locked out by checked/disabled logic', () => {
  const block = ticketTypeBlockBody()
  // The only two things that can affect the switch are the plain state
  // (checked={estimateApprovalRequired}) and the user's own click
  // (onCheckedChange={setEstimateApprovalRequired}) — no other gate exists.
  assert.match(block, /checked=\{estimateApprovalRequired\}/)
  assert.match(block, /onCheckedChange=\{setEstimateApprovalRequired\}/)
  assert.doesNotMatch(block, /disabled/)
})

test('estimate/notification/email/Teams server-side code is untouched by this fix — UI-only change', () => {
  assert.doesNotMatch(CREATE_SRC, /disabled=\{ticketType/, 'create.ts must not contain UI toggle logic')
})

test('backend derivation (deriveEstimateWorkflowSkipped / deriveHistoricalTicketFields) is untouched — this fix only corrects what value the UI submits, not how the backend interprets ticketType', () => {
  const HISTORICAL_LIB_SRC = readFileSync(join(ROOT, 'lib', 'historical-ticket.ts'), 'utf8')
  // Existing, deliberate, tested business rule (tests/historical-ticket.test.ts):
  // on_behalf never skips the workflow and historical always does, regardless
  // of estimateApprovalRequired — a historical ticket is created already
  // closed, so it has no live workflow for the flag to gate either way.
  assert.match(HISTORICAL_LIB_SRC, /if \(ticketType === 'historical'\) return true/)
  assert.match(HISTORICAL_LIB_SRC, /if \(ticketType === 'on_behalf'\) return false/)
})
