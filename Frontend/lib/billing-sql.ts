// SQL form of lib/billing.ts (isBillableTicket) — the ONE rule every
// time-based report, worklog, KPI and activity feed uses to decide billable:
//   billable ⇔ NOT estimateWorkflowSkipped
//             OR (estimateWorkflowSkipped AND no assignee AND consumedHours > 0)
//                 — a historical ticket that consumed Support Wallet hours.
// Both exported expressions below are built from billableRule(), so the rule
// is written exactly once.

import { sql, type SQL } from 'drizzle-orm'
import { ticket, timeLog } from '@/lib/db/schema'

function billableRule(cols: { skipped: SQL; assignee: SQL; consumed: SQL }): SQL<boolean> {
  return sql<boolean>`((NOT ${cols.skipped}) OR (${cols.assignee} IS NULL AND COALESCE(${cols.consumed}, 0) > 0))`
}

/**
 * Whether a TICKET is billable — for queries that select FROM / JOIN "ticket"
 * (e.g. the Worklogs → Activity Log ticket feed).
 */
export const ticketIsBillable = billableRule({
  skipped: sql`${ticket.estimateWorkflowSkipped}`,
  assignee: sql`${ticket.assignedToId}`,
  consumed: sql`${ticket.consumedHours}`,
})

/**
 * Whether a TIME ENTRY is billable — read from its ticket (primary-key
 * lookup); the entry's stored isBillable copy is used only when its ticket no
 * longer exists. Usable in any query that selects FROM time_log.
 */
export const timeLogIsBillable = sql<boolean>`COALESCE(
  (SELECT ${billableRule({
    skipped: sql.raw('bt."estimateWorkflowSkipped"'),
    assignee: sql.raw('bt."assignedToId"'),
    consumed: sql.raw('bt."consumedHours"'),
  })}
     FROM "ticket" bt WHERE bt.id = ${timeLog.ticketId}),
  ${timeLog.isBillable}
)`

/** Minutes of billable time — for SELECT lists over time_log. */
export const billableMinutesSql = sql<number>`COALESCE(SUM(${timeLog.durationMinutes}) FILTER (WHERE ${timeLogIsBillable}), 0)::int`
