// ============================================================================
// Modules / Service Areas list — incremental loading parameters
// (pure — page, server-rendered first batch, tests)
// ============================================================================
// The list loads MODULES_BATCH_SIZE modules per request from getModules
// (server-side search / project / status / sort + LIMIT/OFFSET), appended by
// the shared infinite-scroll hook (lib/use-infinite-ticket-list.ts).
// Plain module — no '@/' imports.
// ============================================================================

export const MODULES_BATCH_SIZE = 20

export type ModuleSortKey = 'name' | 'created' | 'tickets'

/** filterKey of the server-rendered first batch: no search, all projects/statuses, newest first. */
export const INITIAL_FILTER_KEY = '|all|all|created'

export interface ModuleBatchRequest {
  page: number
  limit: number
  search?: string
  projectId?: number
  status?: string
  sortBy: ModuleSortKey
  sortOrder: 'asc' | 'desc'
  /** KPI counts only with the first batch of a result set. */
  includeStatusCounts: boolean
}

/** getModules() filters for one batch of the current search/filter/sort. */
export function moduleBatchFilters(input: {
  search?: string
  projectId?: string
  status?: string
  sortBy: ModuleSortKey
  page: number
}): ModuleBatchRequest {
  const search = (input.search ?? '').trim()
  const projectId = input.projectId && input.projectId !== 'all' ? Number(input.projectId) : undefined
  return {
    page: Math.max(1, input.page),
    limit: MODULES_BATCH_SIZE,
    ...(search ? { search } : {}),
    ...(projectId && Number.isInteger(projectId) ? { projectId } : {}),
    ...(input.status && input.status !== 'all' ? { status: input.status } : {}),
    sortBy: input.sortBy,
    // "Name A-Z" ascending; "Newest" and "Most Tickets" descending.
    sortOrder: input.sortBy === 'name' ? 'asc' : 'desc',
    includeStatusCounts: input.page <= 1,
  }
}
