/**
 * Cache utilities for project data.
 * Provides helpers for stable cache key generation and TTL constants.
 *
 * NOTE: No 'use server' directive — this file exports constants and
 * synchronous utility functions, NOT async server actions.
 */

export const PROJECT_CACHE_TTL = 60 // 60 seconds
export const PROJECT_LIST_CACHE_TTL = 30 // 30 seconds for list queries

/**
 * Generate a deterministic cache key for project list queries.
 * Includes all filter/sort/page parameters to avoid stale data collisions.
 */
export function getProjectListCacheKey(params: {
  userId: string
  role: string
  page: number
  limit: number
  search?: string
  status?: string
  clientId?: string
  managerId?: string
  sortBy?: string
  sortOrder?: string
}): string {
  const parts = [
    'projects',
    params.userId,
    params.role,
    `p${params.page}`,
    `l${params.limit}`,
  ]
  if (params.search) parts.push(`q:${params.search}`)
  if (params.status && params.status !== 'all') parts.push(`s:${params.status}`)
  if (params.clientId) parts.push(`c:${params.clientId}`)
  if (params.managerId) parts.push(`m:${params.managerId}`)
  if (params.sortBy) parts.push(`sort:${params.sortBy}`)
  if (params.sortOrder) parts.push(`order:${params.sortOrder}`)
  return parts.join('|')
}
