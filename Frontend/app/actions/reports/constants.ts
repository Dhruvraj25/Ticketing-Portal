// Shared constants for the reports module.
// NO 'use server' — this file only exports plain values, not server actions.

export const REPORT_CACHE_TAGS = {
  FORM_DATA: 'report-form-data',
  TICKET_SUMMARY: 'report-ticket-summary',
  TICKET_STATUS: 'report-ticket-status',
  TICKET_AGING: 'report-ticket-aging',
  TICKET_RESOLUTION: 'report-ticket-resolution',
  DEVELOPER_PRODUCTIVITY: 'report-developer-productivity',
  DEVELOPER_WORKLOAD: 'report-developer-workload',
  DEVELOPER_STATS: 'report-developer-stats',
  WORKLOG: 'report-worklog',
  BILLABLE_HOURS: 'report-billable-hours',
  PROJECT_STATS: 'report-project-stats',
  PROJECT_PROGRESS: 'report-project-progress',
  MODULE_REPORT: 'report-module',
  CLIENT_PROJECT: 'report-client-project',
  WALLET_STATS: 'report-wallet-stats',
  WALLET_TRANSACTION: 'report-wallet-transaction',
  WALLET_CONSUMPTION: 'report-wallet-consumption',
  WALLET_HISTORY: 'report-wallet-history',
  SLA_STATS: 'report-sla-stats',
  SLA_BREACH: 'report-sla-breach',
  TEAM_PERFORMANCE: 'report-team-performance',
  ASSIGNMENT: 'report-assignment',
  ANALYTICS: 'report-analytics',
  ESTIMATE_APPROVAL: 'report-estimate-approval',
  ESTIMATE_ADDITIONAL_HOURS: 'report-estimate-additional-hours',
  CUSTOMER_REVIEW: 'report-customer-review',
  // Generic fallback
  ALL_REPORT_DATA: 'report-data',
} as const

// Cache TTL for report data: 300s = 5 minutes
// Reports reflect historical data that changes only on mutations
export const REPORT_DATA_CACHE_TTL = 300

// ── ALL report cache tags (for bulk invalidation) ───────────────────────
export const ALL_REPORT_CACHE_TAGS: readonly string[] = Object.values(REPORT_CACHE_TAGS)
