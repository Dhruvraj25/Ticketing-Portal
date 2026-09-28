import type { TicketStatus } from './types'

export type ReportType =
  | 'ticket_summary'
  | 'ticket_status'
  | 'ticket_aging'
  | 'ticket_resolution'
  | 'project_summary'
  | 'project_progress'
  | 'module_report'
  | 'developer_productivity'
  | 'developer_workload'
  | 'worklog'
  | 'billable_hours'
  | 'non_billable_hours'
  | 'client_project'
  | 'sla_compliance'
  | 'sla_breach'
  | 'team_performance'
  | 'assignment'
  | 'analytics'
  | 'support_wallet'
  | 'wallet_transaction'
  | 'wallet_consumption'
  | 'estimate_approval'
  | 'estimate_additional_hours'
  | 'wallet_history'
  | 'customer_review'
  | 'actual_vs_estimated'

export const REPORT_TYPE_OPTIONS: { value: ReportType; label: string; category: string }[] = [
  // Tickets
  { value: 'ticket_summary', label: 'Ticket Summary Report', category: 'Tickets' },
  { value: 'ticket_status', label: 'Ticket Status Report', category: 'Tickets' },
  { value: 'ticket_aging', label: 'Ticket Aging Report', category: 'Tickets' },
  { value: 'ticket_resolution', label: 'Ticket Resolution Report', category: 'Tickets' },
  { value: 'actual_vs_estimated', label: 'Actual vs Estimated Time Report', category: 'Tickets' },

  // Projects
  { value: 'project_summary', label: 'Project Summary Report', category: 'Projects' },
  { value: 'project_progress', label: 'Project Progress Report', category: 'Projects' },
  { value: 'module_report', label: 'Module Report', category: 'Projects' },
  { value: 'client_project', label: 'Client Project Report', category: 'Projects' },

  // Developers
  { value: 'developer_productivity', label: 'Resources Report', category: 'Resources' },
  { value: 'developer_workload', label: 'Resource Workload Report', category: 'Resources' },
  { value: 'worklog', label: 'Worklog Report', category: 'Developers' },
  { value: 'billable_hours', label: 'Billable Hours Report', category: 'Developers' },
  { value: 'non_billable_hours', label: 'Non-Billable Hours Report', category: 'Developers' },
  { value: 'team_performance', label: 'Team Performance Report', category: 'Resources' },
  { value: 'assignment', label: 'Assignment Report', category: 'Developers' },

  // Compliance
  { value: 'sla_compliance', label: 'SLA Compliance Report', category: 'Compliance' },
  { value: 'sla_breach', label: 'SLA Breach Report', category: 'Compliance' },

  // Analytics
  { value: 'analytics', label: 'Analytics Report', category: 'Analytics' },

  // Support Wallets
  { value: 'support_wallet', label: 'Support Wallet Report', category: 'Support Wallets' },
  { value: 'wallet_transaction', label: 'Wallet Transaction Report', category: 'Support Wallets' },
  { value: 'wallet_consumption', label: 'Wallet Consumption Report', category: 'Support Wallets' },

  // Estimate Approval
  { value: 'estimate_approval', label: 'Estimate Approval Report', category: 'Estimates' },
  { value: 'estimate_additional_hours', label: 'Additional Hours Report', category: 'Estimates' },

  // Wallet History
  { value: 'wallet_history', label: 'Support Wallet History Report', category: 'Support Wallets' },

  // Customer Reviews
  { value: 'customer_review', label: 'Customer Feedback Reports', category: 'Customer Feedback' },
]

export const REPORT_TYPE_LABELS: Record<string, string> = {}
for (const opt of REPORT_TYPE_OPTIONS) {
  REPORT_TYPE_LABELS[opt.value] = opt.label
}

// ─── Client Report Type options ─────────────────────────────────────────────
// A client's Report Type dropdown offers exactly these 4 reports. Each is a
// preset of the existing Ticket Summary report (no new report handler) and
// only affects the client Reports UI — checkAccess() and every other role's
// report list are unchanged.
//   Open        = every status except Closed
//   In Process  = Work in Progress
//   Resolved    = Closed / Completed
export type ClientReportPreset = 'total' | 'open' | 'in_process' | 'resolved'

export const CLIENT_REPORT_PRESETS: {
  value: ClientReportPreset
  label: string
  status?: TicketStatus
  excludeStatus?: TicketStatus
}[] = [
  { value: 'total', label: 'Total Tickets' },
  { value: 'open', label: 'Open Tickets', excludeStatus: 'closed' },
  { value: 'in_process', label: 'In Process Tickets', status: 'in_progress' },
  { value: 'resolved', label: 'Resolved Tickets', status: 'closed' },
]

/** Which client preset a set of Ticket Summary filters corresponds to. */
export function clientPresetFromFilters(filters?: { status?: string; excludeStatus?: string } | null): ClientReportPreset {
  if (filters?.excludeStatus === 'closed') return 'open'
  if (filters?.status === 'in_progress') return 'in_process'
  if (filters?.status === 'closed') return 'resolved'
  return 'total'
}