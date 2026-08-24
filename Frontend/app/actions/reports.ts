// @ts-nocheck
// Legacy barrel — all report server actions are now in app/actions/reports/.
// This file re-exports everything from the new structure for backward compatibility.

export {
  getReportData,
  getReportFormData,
  getCustomerReviewReport,
  getCustomerReviewDetail,
  REPORT_CACHE_TAGS,
} from './reports/index'

export type { ReportFilters, ReportMeta, ReportResult } from './reports/types'
