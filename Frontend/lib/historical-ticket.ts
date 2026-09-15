// ────────────────────────────────────────────────────────────────────────────
// historical-ticket — pure, DB-free business logic for Phase 3
// (Admin/Manager "Historical" and "On Behalf of Client" ticket creation).
//
// Kept separate from app/actions/tickets/create.ts (a 'use server' module, not
// importable under plain node:test) so the validation/derivation rules can be
// unit-tested directly. createTicket() calls these functions but owns all DB
// access and the db.transaction() wrapping itself.
// ────────────────────────────────────────────────────────────────────────────

export type TicketType = 'on_behalf' | 'historical'

export const TICKET_TYPES: readonly TicketType[] = ['on_behalf', 'historical']

/** Coerces and validates the "Support Hour Consumed" field: numeric, > 0. */
export function validateSupportHoursConsumed(value: unknown): { valid: true; hours: number } | { valid: false; error: string } {
  if (value === null || value === undefined || value === '') {
    return { valid: false, error: 'Support Hour Consumed is required for a Historical ticket.' }
  }
  const hours = typeof value === 'number' ? value : Number(value)
  if (typeof value !== 'number' && typeof value !== 'string') {
    return { valid: false, error: 'Support Hour Consumed must be a number.' }
  }
  if (!Number.isFinite(hours)) {
    return { valid: false, error: 'Support Hour Consumed must be a number.' }
  }
  if (hours <= 0) {
    return { valid: false, error: 'Support Hour Consumed must be greater than 0.' }
  }
  return { valid: true, hours }
}

/**
 * Rejects a deduction that would exceed the client's available wallet
 * balance. Deliberately a HARD REJECT (no ticket created, no deduction) —
 * see the judgment-call note in the Phase 3 report: this differs from the
 * existing deductWalletHours()/clientApproveTicket() wallet-close deduction,
 * which floors remainingHours at 0 without blocking. Historical ticket
 * creation is a new, more conservative flow where "insufficient wallet" is
 * an explicit, testable rejection case (spec requirement 5).
 */
export function checkWalletSufficiency(hours: number, walletRemainingHours: number): { ok: true } | { ok: false; error: string } {
  if (hours > walletRemainingHours) {
    return {
      ok: false,
      error: `Insufficient support wallet balance: ${hours}h requested but only ${walletRemainingHours}h remaining.`,
    }
  }
  return { ok: true }
}

/** Validates a historical ticket's creation/closing dates (mirrors the removed updateTicketDates rule). */
export function validateHistoricalDates(createdAt: Date | null, closedAt: Date | null): { valid: true } | { valid: false; error: string } {
  if (!createdAt || isNaN(createdAt.getTime())) {
    return { valid: false, error: 'Historical ticket date is required and must be a valid date.' }
  }
  if (closedAt) {
    if (isNaN(closedAt.getTime())) return { valid: false, error: 'Closing date is invalid.' }
    if (closedAt.getTime() < createdAt.getTime()) {
      return { valid: false, error: 'Closing date cannot be earlier than the historical ticket date.' }
    }
  }
  return { valid: true }
}

export interface HistoricalTicketFields {
  status: 'closed'
  createdAt: Date
  closedAt: Date
  resolvedAt: Date
  consumedHours: number
  estimateWorkflowSkipped: true
}

/**
 * Derives the DB fields for a Historical ticket insert. Closing date falls
 * back to the historical date itself when not separately provided (spec: "Save
 * the ticket closing date if the historical ticket flow requires it").
 * resolvedAt mirrors closedAt so resolution-time analytics/reports stay
 * consistent for backdated data.
 */
export function deriveHistoricalTicketFields(input: { createdAt: Date; closedAt: Date | null; supportHoursConsumed: number }): HistoricalTicketFields {
  const closedAt = input.closedAt ?? input.createdAt
  return {
    status: 'closed',
    createdAt: input.createdAt,
    closedAt,
    resolvedAt: closedAt,
    consumedHours: input.supportHoursConsumed,
    estimateWorkflowSkipped: true,
  }
}

/**
 * Derives the `estimateWorkflowSkipped` column value from the Ticket Type +
 * "Estimate Approval Required" toggle. On Behalf of Client always forces
 * approval required ON (workflow NOT skipped) regardless of the toggle's
 * value, per spec ("Automatically turn Estimate Approval Required ON").
 * Historical tickets never enter the estimate workflow at all.
 */
export function deriveEstimateWorkflowSkipped(ticketType: TicketType | undefined, estimateApprovalRequired: boolean): boolean {
  if (ticketType === 'historical') return true
  if (ticketType === 'on_behalf') return false
  // No ticket type selected (normal client-initiated ticket, or staff not
  // using the Phase 3 flow) — untouched, defaults to "approval required".
  return !estimateApprovalRequired
}

export interface WalletDeductionPlan {
  newConsumed: number
  newRemaining: number
  previousBalance: number
}

/** Pure arithmetic for the wallet deduction — mirrors the pattern in clientApproveTicket. */
export function planWalletDeduction(wallet: { consumedHours: number; remainingHours: number }, hours: number): WalletDeductionPlan {
  return {
    previousBalance: wallet.remainingHours,
    newConsumed: wallet.consumedHours + hours,
    newRemaining: wallet.remainingHours - hours,
  }
}
