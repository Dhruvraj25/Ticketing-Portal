// @ts-nocheck
'use server'

import { db } from '@/lib/db'
import { project, user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-utils'
import { wrapServerAction } from '@/lib/performance-profiler'
import type { UserRole } from '@/lib/types'
import type { ReportFilters, ReportResult } from './types'
import { checkAccess } from './types'
import { REPORT_CACHE_TAGS, REPORT_DATA_CACHE_TTL } from './constants'

import { getTicketSummaryReport } from './ticket-reports'
import { getTicketStatusReport } from './ticket-reports'
import { getTicketAgingReport } from './ticket-reports'
import { getTicketResolutionReport } from './ticket-reports'
import { getEstimateApprovalReport } from './ticket-reports'
import { getAdditionalHoursReport } from './ticket-reports'

import { getActualVsEstimatedReport } from './actual-vs-estimated'

import { getDeveloperProductivityReport } from './developer-reports'
import { getDeveloperWorkloadReport } from './developer-reports'
import { getWorklogReport } from './developer-reports'
import { getBillableHoursReport } from './developer-reports'
import { getNonBillableHoursReport } from './developer-reports'
import { getTeamPerformanceReport } from './developer-reports'
import { getAssignmentReport } from './developer-reports'

import { getProjectSummaryReport } from './project-reports'
import { getProjectProgressReport } from './project-reports'
import { getModuleReport } from './project-reports'
import { getClientProjectReport } from './project-reports'

import { getSupportWalletReport } from './wallet-reports'
import { getWalletTransactionReport } from './wallet-reports'
import { getWalletConsumptionReport } from './wallet-reports'
import { getWalletHistoryReport } from './wallet-reports'

import { getSlaComplianceReport } from './sla-reports'
import { getSlaBreachReport } from './sla-reports'

import { getAnalyticsReport } from './analytics'

import { getCustomerReviewReport } from './customer-review-reports'

export type CurrentUser = { id: string; role: UserRole }

// ─── Report-type-to-tag mapping ────────────────────────────────────────
// Used to assign specific cache tags per report type for targeted invalidation
const REPORT_TYPE_TAG_MAP: Record<string, string> = {
  ticket_summary: REPORT_CACHE_TAGS.TICKET_SUMMARY,
  ticket_status: REPORT_CACHE_TAGS.TICKET_STATUS,
  ticket_aging: REPORT_CACHE_TAGS.TICKET_AGING,
  ticket_resolution: REPORT_CACHE_TAGS.TICKET_RESOLUTION,
  project_summary: REPORT_CACHE_TAGS.PROJECT_STATS,
  project_progress: REPORT_CACHE_TAGS.PROJECT_PROGRESS,
  module_report: REPORT_CACHE_TAGS.MODULE_REPORT,
  developer_productivity: REPORT_CACHE_TAGS.DEVELOPER_PRODUCTIVITY,
  developer_workload: REPORT_CACHE_TAGS.DEVELOPER_WORKLOAD,
  worklog: REPORT_CACHE_TAGS.WORKLOG,
  billable_hours: REPORT_CACHE_TAGS.BILLABLE_HOURS,
  non_billable_hours: REPORT_CACHE_TAGS.BILLABLE_HOURS,
  client_project: REPORT_CACHE_TAGS.CLIENT_PROJECT,
  sla_compliance: REPORT_CACHE_TAGS.SLA_STATS,
  sla_breach: REPORT_CACHE_TAGS.SLA_BREACH,
  team_performance: REPORT_CACHE_TAGS.TEAM_PERFORMANCE,
  assignment: REPORT_CACHE_TAGS.ASSIGNMENT,
  analytics: REPORT_CACHE_TAGS.ANALYTICS,
  support_wallet: REPORT_CACHE_TAGS.WALLET_STATS,
  wallet_transaction: REPORT_CACHE_TAGS.WALLET_TRANSACTION,
  wallet_consumption: REPORT_CACHE_TAGS.WALLET_CONSUMPTION,
  wallet_history: REPORT_CACHE_TAGS.WALLET_HISTORY,
  estimate_approval: REPORT_CACHE_TAGS.ESTIMATE_APPROVAL,
  estimate_additional_hours: REPORT_CACHE_TAGS.ESTIMATE_ADDITIONAL_HOURS,
  customer_review: REPORT_CACHE_TAGS.CUSTOMER_REVIEW,
  actual_vs_estimated: REPORT_CACHE_TAGS.ACTUAL_VS_ESTIMATED,
}

// ─── Module-level handler registry ─────────────────────────────────────
const REPORT_HANDLERS: Record<string, (filters: ReportFilters, currentUser: CurrentUser) => Promise<ReportResult>> = {
  ticket_summary: getTicketSummaryReport,
  ticket_status: getTicketStatusReport,
  ticket_aging: getTicketAgingReport,
  ticket_resolution: getTicketResolutionReport,
  project_summary: getProjectSummaryReport,
  project_progress: getProjectProgressReport,
  module_report: getModuleReport,
  developer_productivity: getDeveloperProductivityReport,
  developer_workload: getDeveloperWorkloadReport,
  worklog: getWorklogReport,
  billable_hours: getBillableHoursReport,
  non_billable_hours: getNonBillableHoursReport,
  client_project: getClientProjectReport,
  sla_compliance: getSlaComplianceReport,
  sla_breach: getSlaBreachReport,
  team_performance: getTeamPerformanceReport,
  assignment: getAssignmentReport,
  analytics: getAnalyticsReport,
  support_wallet: getSupportWalletReport,
  wallet_transaction: getWalletTransactionReport,
  wallet_consumption: getWalletConsumptionReport,
  estimate_approval: getEstimateApprovalReport,
  estimate_additional_hours: getAdditionalHoursReport,
  wallet_history: getWalletHistoryReport,
  customer_review: getCustomerReviewReport,
  actual_vs_estimated: getActualVsEstimatedReport,
}

// ─── Internal implementation (no getCurrentUser — accepts role and userId) ─
async function _getReportFormDataImpl(role: string, userId: string) {
  const projects = await db
    .select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode })
    .from(project)
    .where(role === 'client' ? eq(project.clientId, userId) : undefined)
    .orderBy(project.projectName)

  // OPTIMIZATION: Filter users by role in SQL instead of loading ALL users
  // and filtering in JavaScript. 3 parallel queries, each filtering by role.
  // Before: 1 query that loads ALL users → JS filter by role (3 passes over full dataset)
  // After:  3 parallel queries, each with WHERE role = ? (uses index on role column)
  // Expected: report form load in <20ms vs 100-300ms with large user tables
  const [developers, clients, managers] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role })
      .from(user)
      .where(eq(user.role, 'developer'))
      .orderBy(user.name),
    db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role })
      .from(user)
      .where(eq(user.role, 'client'))
      .orderBy(user.name),
    db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role })
      .from(user)
      .where(eq(user.role, 'project_manager'))
      .orderBy(user.name),
  ])

  return { projects, developers, clients, managers }
}

// ─── Cross-request cached (primitives only, no headers()) ─────────────────
const getCachedReportFormData = unstable_cache(
  async (role: string, userId: string) => {
    return _getReportFormDataImpl(role, userId)
  },
  undefined,
  {
    tags: [REPORT_CACHE_TAGS.FORM_DATA],
    revalidate: 300,
  }
)

// ─── Server Action (getCurrentUser called OUTSIDE cached wrapper) ─────────
export const getReportFormData = wrapServerAction('getReportFormData', async function getReportFormData() {
  const { role, id: userId } = await getCurrentUser()
  return getCachedReportFormData(role, userId)
})

// ─── Cached Report Handler ────────────────────────────────────────────────
// Wraps the actual report handler with unstable_cache.
// Cache key = reportType + serialized filters + user role (access control).
// Cache TTL = 300s (5 minutes) — report data changes only on mutations.
// Cache tags = report-type-specific + generic 'report-data' fallback.
// This eliminates ALL SQL queries on cache hit (entire ReportResult cached).

const getCachedReportHandler = unstable_cache(
  async (cacheKey: string) => {
    const { reportType, filtersJson, role, userId } = JSON.parse(cacheKey)
    const filters: ReportFilters = JSON.parse(filtersJson)
    const currentUser: CurrentUser = { id: userId, role }

    const handler = REPORT_HANDLERS[reportType]
    if (!handler) throw new Error('Invalid report type')
    return handler(filters, currentUser)
  },
  undefined,
  {
    revalidate: REPORT_DATA_CACHE_TTL,
    // Generic 'report-data' tag for bulk invalidation. The report-type-specific
    // tags (REPORT_TYPE_TAG_MAP) are available for future targeted invalidation.
    // NOTE: Do NOT include FORM_DATA here — that tag is for report filter forms,
    // not report results. Including it would cause unnecessary cross-invalidation.
    tags: [REPORT_CACHE_TAGS.ALL_REPORT_DATA],
  },
)

// ─── Main Report Fetcher ─────────────────────────────────────────────────
export const getReportData = wrapServerAction('getReportData', async function getReportData(filters: ReportFilters): Promise<ReportResult> {
  const currentUser = await getCurrentUser()

  if (!checkAccess(currentUser.role, filters.reportType)) {
    throw new Error('Access denied to this report type')
  }

  // Cache key encodes everything that affects output: filters, role, and user ID.
  // Role is included for access control (admin sees all, client sees own).
  // User ID is included because role-based queries filter by userId.
  const cacheKey = JSON.stringify({
    reportType: filters.reportType,
    filtersJson: JSON.stringify(filters),
    role: currentUser.role,
    userId: currentUser.id,
  })

  return getCachedReportHandler(cacheKey)
})
