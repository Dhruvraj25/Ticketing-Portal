// ============================================================================
// Billable vs Non-Billable — ONE rule, from the ticket's actual workflow
// ============================================================================
//   Billable     → the ticket follows the estimate / support-hour workflow.
//   Non-Billable → the estimate workflow was skipped ("Assign Directly").
//   EXCEPT historical tickets: they also skip the estimate workflow
//   (lib/historical-ticket.ts sets estimateWorkflowSkipped = true), but they
//   CONSUMED Support Wallet hours when created → Billable.
//
// A ticket is recognised as a historical wallet-consuming ticket by data the
// existing flows already write (there is no ticket-type column):
//   • estimateWorkflowSkipped = true, and
//   • no assignee — historical creation is the only path that skips the
//     estimate without assigning a resource ("Assign Directly" sets the
//     assignee and the flag in the same update), and
//   • consumedHours > 0 — written in the same transaction as the Support
//     Wallet deduction (historical creation / ticket close).
//
// The ticket is the source of truth. time_log.isBillable is a copy stamped
// from this rule when a timer starts/resumes (kept as the historical record,
// never rewritten); reports / worklogs / KPIs read the ticket through
// lib/billing-sql.ts and fall back to the copy only if the ticket is gone.
// Plain module — no '@/' imports. Backend mirror: Backend/src/lib/billing.ts.
// ============================================================================

export type BillingType = 'billable' | 'non_billable'

export const BILLING_LABEL: Record<BillingType, string> = {
  billable: 'Billable',
  non_billable: 'Non-Billable',
}

export interface BillingFacts {
  estimateWorkflowSkipped?: boolean | null
  assignedToId?: string | null
  consumedHours?: number | null
}

/** Historical ticket that consumed Support Wallet hours (see header). */
export function isHistoricalWalletTicket(t: BillingFacts): boolean {
  return t.estimateWorkflowSkipped === true && !t.assignedToId && (Number(t.consumedHours) || 0) > 0
}

/** THE billing rule. */
export function isBillableTicket(t: BillingFacts): boolean {
  return t.estimateWorkflowSkipped !== true || isHistoricalWalletTicket(t)
}

export function billingTypeOf(t: BillingFacts): BillingType {
  return isBillableTicket(t) ? 'billable' : 'non_billable'
}
