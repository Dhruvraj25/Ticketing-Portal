// ============================================================================
// Project completion (pure — Projects page + tests)
// ============================================================================
// Same rule as the Project Progress report (app/actions/reports/
// project-reports.ts): completion = closed tickets / all tickets of the
// project, rounded to a whole percent (0 when the project has no tickets).
// A project whose own status is completed/archived is shown as 100%.
// "Closed" is the only finished ticket status in the workflow (the client
// approves & completes the ticket); 'resolved' still awaits manager review.
// Plain module — no '@/' imports.
// ============================================================================

export interface ProjectProgressInput {
  status: string
  ticketCount?: number | null
  closedTicketCount?: number | null
}

const count = (n: number | null | undefined) => Math.max(0, Math.floor(Number(n) || 0))

export function projectCompletionPercent(p: ProjectProgressInput): number {
  if (p.status === 'completed' || p.status === 'archived') return 100
  const total = count(p.ticketCount)
  if (total === 0) return 0
  const closed = Math.min(count(p.closedTicketCount), total)
  return Math.round((closed / total) * 100)
}

/** Open vs completed (closed) tickets of a project, from the real counts. */
export function projectTicketSummary(p: ProjectProgressInput) {
  const total = count(p.ticketCount)
  if (total === 0) return { open: 0, resolved: 0, openPct: 0, resolvedPct: 100 }
  const resolved = Math.min(count(p.closedTicketCount), total)
  const open = total - resolved
  return { open, resolved, openPct: (open / total) * 100, resolvedPct: (resolved / total) * 100 }
}
