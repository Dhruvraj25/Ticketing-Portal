// @ts-nocheck
// Shared types and helper functions for the reports module.
// NO 'use server' — this file only exports types and pure functions.

import type { UserRole, TicketPriority } from '@/lib/types'
import { TicketStatus, TICKET_STATUS_CONFIG } from '@/lib/types'
import type { ReportType } from '@/lib/report-types'

export interface ReportFilters {
  reportType: ReportType
  dateFrom?: string
  dateTo?: string
  projectId?: number
  moduleId?: number
  developerId?: string
  clientId?: string
  status?: TicketStatus
  priority?: TicketPriority
  reviewStatus?: 'all' | 'reviewed' | 'pending'
  starRating?: 'all' | '1' | '2' | '3' | '4' | '5'
  managerId?: string
  page?: number
  pageSize?: number
}

export interface ReportMeta {
  totalRecords: number
  generatedAt: string
  appliedFilters: string[]
  summary: Record<string, string | number>
}

export interface ReportResult {
  meta: ReportMeta
  columns: { key: string; label: string; type?: string }[]
  data: Record<string, unknown>[]
  charts?: {
    type: 'line' | 'bar' | 'pie'
    title: string
    data: { name: string; value: number }[]
  }[]
  extras?: Record<string, unknown>
}

// ─── Helper: Get date range ──────────────────────────────────────────────
export function getDateRange(dateFrom?: string, dateTo?: string) {
  const since = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const until = dateTo ? new Date(dateTo + 'T23:59:59.999Z') : new Date()
  return { since, until }
}

// ─── Check role access ───────────────────────────────────────────────────
export function checkAccess(userRole: UserRole, reportType: ReportType): boolean {
  if (userRole === 'admin') return true

  const managerReports: ReportType[] = [
    'ticket_summary', 'ticket_status', 'ticket_aging', 'ticket_resolution',
    'project_summary', 'project_progress', 'module_report',
    'developer_productivity', 'developer_workload', 'worklog',
    'billable_hours', 'non_billable_hours', 'assignment', 'analytics',
    'team_performance', 'sla_compliance', 'sla_breach', 'actual_vs_estimated',
  ]
  const devReports: ReportType[] = [
    'ticket_summary', 'ticket_status', 'ticket_aging', 'ticket_resolution',
    'developer_productivity', 'developer_workload', 'worklog',
    'billable_hours', 'non_billable_hours', 'actual_vs_estimated',
  ]
  const clientReports: ReportType[] = [
    'ticket_summary', 'ticket_status', 'ticket_aging', 'ticket_resolution',
    'project_summary', 'project_progress', 'client_project',
    'support_wallet', 'wallet_transaction', 'wallet_consumption', 'wallet_history',
  ]
  const walletReports: ReportType[] = [
    'support_wallet', 'wallet_transaction', 'wallet_consumption', 'wallet_history',
  ]
  const estimateReports: ReportType[] = [
    'estimate_approval', 'estimate_additional_hours',
  ]
  const customerReviewReports: ReportType[] = [
    'customer_review',
  ]

  if (userRole === 'project_manager') return [...managerReports, ...walletReports, ...estimateReports, ...customerReviewReports].includes(reportType)
  if (userRole === 'developer') return devReports.includes(reportType)
  if (userRole === 'client') return clientReports.includes(reportType)
  return false
}
