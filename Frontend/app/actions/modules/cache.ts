/**
 * Cache utilities for module data.
 * Provides helpers for stable cache key generation and TTL constants.
 *
 * NOTE: No 'use server' directive — this file exports constants and
 * synchronous utility functions, NOT async server actions.
 */

export const MODULE_CACHE_TTL = 60 // 60 seconds
export const MODULE_LIST_CACHE_TTL = 30 // 30 seconds for list queries
