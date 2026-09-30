// ============================================================================
// Customer Feedback page → report filter parameters (pure — page + tests)
// ============================================================================
// The dropdowns use '__all__' for their "All …" option; that sentinel (and
// empty / non-numeric values) must never be sent to the server, where it
// would filter on a literal '__all__' id and return nothing.
// Plain module — no '@/' imports.
// ============================================================================

export const ALL_OPTION = '__all__'

export interface CustomerFeedbackFilterState {
  dateFrom: string
  dateTo: string
  clientId: string
  projectId: string
  moduleId: string
  developerId: string
  managerId: string
  reviewStatus: string
  starRating: string
  ticketNumber: string
}

export interface CustomerFeedbackFilters {
  reportType: 'customer_review'
  dateFrom?: string
  dateTo?: string
  clientId?: string
  projectId?: number
  moduleId?: number
  developerId?: string
  managerId?: string
  reviewStatus?: 'reviewed' | 'pending'
  starRating?: '1' | '2' | '3' | '4' | '5'
  ticketNumber?: string
  page: number
  pageSize: number
}

export const EMPTY_FEEDBACK_FILTER_STATE: CustomerFeedbackFilterState = {
  dateFrom: '', dateTo: '', clientId: '', projectId: '', moduleId: '', developerId: '',
  managerId: '', reviewStatus: 'all', starRating: 'all', ticketNumber: '',
}

/** A selected id, or '' for "All" / nothing selected. */
export function selectedValue(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  return v && v !== ALL_OPTION ? v : ''
}

function positiveInt(value: string): number | undefined {
  const n = Number(selectedValue(value))
  return Number.isInteger(n) && n > 0 ? n : undefined
}

export function buildCustomerFeedbackFilters(
  s: CustomerFeedbackFilterState,
  page = 1,
  pageSize = 25,
): CustomerFeedbackFilters {
  const f: CustomerFeedbackFilters = { reportType: 'customer_review', page, pageSize }
  if (s.dateFrom) f.dateFrom = s.dateFrom
  if (s.dateTo) f.dateTo = s.dateTo
  if (selectedValue(s.clientId)) f.clientId = selectedValue(s.clientId)
  const projectId = positiveInt(s.projectId)
  if (projectId) f.projectId = projectId
  const moduleId = positiveInt(s.moduleId)
  if (moduleId) f.moduleId = moduleId
  if (selectedValue(s.developerId)) f.developerId = selectedValue(s.developerId)
  if (selectedValue(s.managerId)) f.managerId = selectedValue(s.managerId)
  if (s.reviewStatus === 'reviewed' || s.reviewStatus === 'pending') f.reviewStatus = s.reviewStatus
  if (['1', '2', '3', '4', '5'].includes(s.starRating)) f.starRating = s.starRating as CustomerFeedbackFilters['starRating']
  if (s.ticketNumber.trim()) f.ticketNumber = s.ticketNumber.trim()
  return f
}

/** Number of filters in the panel that are actually narrowing the results. */
export function activeFeedbackFilterCount(s: CustomerFeedbackFilterState): number {
  const f = buildCustomerFeedbackFilters(s)
  return [f.dateFrom, f.dateTo, f.clientId, f.projectId, f.moduleId, f.developerId, f.managerId, f.reviewStatus, f.starRating]
    .filter((v) => v !== undefined).length
}
