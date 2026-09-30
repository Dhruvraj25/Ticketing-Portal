// ============================================================================
// Ticket-state KPIs — ONE definition for every role (pure — UI + tests)
// ============================================================================
// Categories: "Total Tickets" + one card per ticket status, built from the
// single status definition (TICKET_STATUS_CONFIG: its keys, lifecycle order
// and labels). The same categories, colors and icons are used on every
// dashboard and on the Tickets page; only the COUNTS differ, and those come
// from the server-side, role-scoped per-status query
// (ticketStatsScope in app/actions/tickets/queries.ts — the same scope as the
// Tickets list). A status card with 0 tickets is not shown.
// Plain module (relative import only) so it runs under `node --test`.
// ============================================================================

import { TICKET_STATUS_CONFIG, type TicketStatus } from './types.ts'

/** Subset of components/dashboard/stat-card.tsx KpiColorTheme used here. */
export type StatusKpiColor =
  | 'blue' | 'sky' | 'indigo' | 'amber' | 'green' | 'purple'
  | 'violet' | 'orange' | 'cyan' | 'emerald' | 'red' | 'rose'

export interface StatusKpiStyle {
  color: StatusKpiColor
  /** StatCard iconName (a key of its ICON_LOOKUP). */
  icon: string
}

export const TOTAL_TICKETS_KPI: StatusKpiStyle & { label: string } = {
  label: 'Total Tickets', color: 'blue', icon: 'Ticket',
}

/** Fixed style per status — every status has its own color, on every dashboard. */
export const STATUS_KPI_STYLE: Record<TicketStatus, StatusKpiStyle> = {
  new:                  { color: 'sky',     icon: 'AlertCircle' },
  manager_review:       { color: 'indigo',  icon: 'Search' },
  estimate_pending:     { color: 'amber',   icon: 'Clock' },
  estimate_approved:    { color: 'green',   icon: 'ListChecks' },
  assigned:             { color: 'purple',  icon: 'UserCog' },
  in_progress:          { color: 'violet',  icon: 'Code2' },
  resolved:             { color: 'orange',  icon: 'ClipboardList' }, // label "Manager Review"
  client_review:        { color: 'cyan',    icon: 'Users' },         // "Awaiting Client Review"
  closed:               { color: 'emerald', icon: 'CheckCircle2' },  // "Completed"
  rework:               { color: 'red',     icon: 'RefreshCw' },
  request_for_revision: { color: 'rose',    icon: 'AlertTriangle' },
}

export interface StatusKpi extends StatusKpiStyle {
  status: TicketStatus
  label: string
  count: number
}

/** One KPI per status that has tickets, in lifecycle order (zero-count statuses omitted). */
export function statusKpis(statusCounts: Record<string, number> | null | undefined): StatusKpi[] {
  return (Object.keys(TICKET_STATUS_CONFIG) as TicketStatus[])
    .map((status) => ({
      status,
      label: TICKET_STATUS_CONFIG[status].label,
      count: Number(statusCounts?.[status]) || 0,
      ...STATUS_KPI_STYLE[status],
    }))
    .filter((k) => k.count > 0)
}
