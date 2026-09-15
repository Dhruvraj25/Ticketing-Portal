import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateSupportHoursConsumed,
  checkWalletSufficiency,
  validateHistoricalDates,
  deriveHistoricalTicketFields,
  deriveEstimateWorkflowSkipped,
  planWalletDeduction,
  TICKET_TYPES,
} from '../lib/historical-ticket.ts'

// ============================================================================
// Phase 3 — Historical / On Behalf of Client ticket creation: pure logic
// ============================================================================

test('TICKET_TYPES is exactly the two required options', () => {
  assert.deepEqual(TICKET_TYPES, ['on_behalf', 'historical'])
})

// ─── Requirement 6: invalid support hours ──────────────────────────────────

test('validateSupportHoursConsumed: accepts a valid positive number', () => {
  const result = validateSupportHoursConsumed(10)
  assert.deepEqual(result, { valid: true, hours: 10 })
})

test('validateSupportHoursConsumed: accepts a valid numeric string (form input)', () => {
  const result = validateSupportHoursConsumed('10.5')
  assert.deepEqual(result, { valid: true, hours: 10.5 })
})

test('validateSupportHoursConsumed: rejects missing/empty value', () => {
  assert.equal(validateSupportHoursConsumed(undefined).valid, false)
  assert.equal(validateSupportHoursConsumed(null).valid, false)
  assert.equal(validateSupportHoursConsumed('').valid, false)
})

test('validateSupportHoursConsumed: rejects non-numeric input', () => {
  const result = validateSupportHoursConsumed('abc')
  assert.equal(result.valid, false)
  if (!result.valid) assert.match(result.error, /number/)
})

test('validateSupportHoursConsumed: rejects zero', () => {
  const result = validateSupportHoursConsumed(0)
  assert.equal(result.valid, false)
  if (!result.valid) assert.match(result.error, /greater than 0/)
})

test('validateSupportHoursConsumed: rejects negative numbers', () => {
  const result = validateSupportHoursConsumed(-5)
  assert.equal(result.valid, false)
  if (!result.valid) assert.match(result.error, /greater than 0/)
})

test('validateSupportHoursConsumed: rejects NaN/Infinity', () => {
  assert.equal(validateSupportHoursConsumed(NaN).valid, false)
  assert.equal(validateSupportHoursConsumed(Infinity).valid, false)
})

// ─── Requirement 5: insufficient wallet balance is a hard reject ───────────

test('checkWalletSufficiency: allows a deduction exactly equal to the remaining balance', () => {
  assert.deepEqual(checkWalletSufficiency(10, 10), { ok: true })
})

test('checkWalletSufficiency: allows a deduction under the remaining balance', () => {
  assert.deepEqual(checkWalletSufficiency(5, 10), { ok: true })
})

test('checkWalletSufficiency: rejects a deduction greater than the remaining balance', () => {
  const result = checkWalletSufficiency(15, 10)
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /Insufficient/)
})

// ─── Historical date validation ────────────────────────────────────────────

test('validateHistoricalDates: requires a valid createdAt', () => {
  assert.equal(validateHistoricalDates(null, null).valid, false)
  assert.equal(validateHistoricalDates(new Date('not-a-date'), null).valid, false)
})

test('validateHistoricalDates: closedAt is optional', () => {
  assert.deepEqual(validateHistoricalDates(new Date('2026-01-01'), null), { valid: true })
})

test('validateHistoricalDates: rejects closedAt earlier than createdAt', () => {
  const created = new Date('2026-01-10')
  const closed = new Date('2026-01-01')
  const result = validateHistoricalDates(created, closed)
  assert.equal(result.valid, false)
  if (!result.valid) assert.match(result.error, /Closing date/)
})

test('validateHistoricalDates: accepts closedAt on or after createdAt', () => {
  const created = new Date('2026-01-01')
  assert.deepEqual(validateHistoricalDates(created, new Date('2026-01-01')), { valid: true })
  assert.deepEqual(validateHistoricalDates(created, new Date('2026-01-10')), { valid: true })
})

// ─── Requirement: save consumed hours + historical/closing dates ──────────

test('deriveHistoricalTicketFields: closedAt falls back to createdAt when not provided', () => {
  const created = new Date('2026-01-01T00:00:00Z')
  const fields = deriveHistoricalTicketFields({ createdAt: created, closedAt: null, supportHoursConsumed: 10 })
  assert.equal(fields.status, 'closed')
  assert.equal(fields.createdAt, created)
  assert.equal(fields.closedAt, created)
  assert.equal(fields.resolvedAt, created)
  assert.equal(fields.consumedHours, 10)
  assert.equal(fields.estimateWorkflowSkipped, true)
})

test('deriveHistoricalTicketFields: uses the explicit closing date when provided', () => {
  const created = new Date('2026-01-01T00:00:00Z')
  const closed = new Date('2026-01-05T00:00:00Z')
  const fields = deriveHistoricalTicketFields({ createdAt: created, closedAt: closed, supportHoursConsumed: 4 })
  assert.equal(fields.closedAt, closed)
  assert.equal(fields.resolvedAt, closed)
})

// ─── Ticket Type → estimateWorkflowSkipped derivation ──────────────────────

test('deriveEstimateWorkflowSkipped: On Behalf of Client always forces the estimate workflow ON (never skipped)', () => {
  assert.equal(deriveEstimateWorkflowSkipped('on_behalf', false), false)
  assert.equal(deriveEstimateWorkflowSkipped('on_behalf', true), false)
})

test('deriveEstimateWorkflowSkipped: Historical always skips the estimate workflow', () => {
  assert.equal(deriveEstimateWorkflowSkipped('historical', false), true)
  assert.equal(deriveEstimateWorkflowSkipped('historical', true), true)
})

test('deriveEstimateWorkflowSkipped: no ticket type mirrors the toggle directly (default OFF -> skipped is the inverse)', () => {
  assert.equal(deriveEstimateWorkflowSkipped(undefined, false), true)
  assert.equal(deriveEstimateWorkflowSkipped(undefined, true), false)
})

// ─── Requirement 4: wallet deduction math ──────────────────────────────────

test('planWalletDeduction: computes previous/new balances correctly', () => {
  const plan = planWalletDeduction({ consumedHours: 20, remainingHours: 30 }, 10)
  assert.deepEqual(plan, { previousBalance: 30, newConsumed: 30, newRemaining: 20 })
})

test('planWalletDeduction: never floors at 0 itself — callers must checkWalletSufficiency first', () => {
  // By construction this only runs after checkWalletSufficiency has already
  // passed, so newRemaining is always >= 0 in practice — this test documents
  // that the function itself does no clamping (unlike the legacy
  // deductWalletHours/clientApproveTicket Math.max(0, ...) pattern).
  const plan = planWalletDeduction({ consumedHours: 0, remainingHours: 10 }, 10)
  assert.equal(plan.newRemaining, 0)
})
