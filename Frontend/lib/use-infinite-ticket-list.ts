'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ============================================================================
// Shared infinite-scroll state machine for ticket lists (Dashboard "Recent
// Tickets" and the main Tickets page). Both fetchers already exist —
// getRecentTicketsPage() and getTicketsList() — this hook only orchestrates
// WHEN to call them and how to accumulate/replace results; it fetches no
// data itself.
//
// Guarantees (per the infinite-scroll spec):
//  - Never more than one in-flight "load more" request at a time.
//  - A stale response from a superseded fetch (filters/search changed, or a
//    reset happened) can never overwrite newer state — every fetch carries a
//    monotonically increasing request id, and only the LATEST id's response
//    is applied.
//  - Appended pages are de-duplicated by ticket id as a safety net (the
//    backend's LIMIT/OFFSET should never overlap, but this guarantees the UI
//    can never show the same ticket twice even so).
//  - stop() permanently halts further requests once the backend reports no
//    more pages.
// ============================================================================

export interface InfiniteTicketPageResult<T> {
  tickets: T[]
  hasMore: boolean
}

interface UseInfiniteTicketListOptions<T> {
  /** Tickets already fetched server-side for page 1 (first paint, no extra request). */
  initialTickets: T[]
  /** Whether page 1 (as fetched server-side) indicated more pages exist. */
  initialHasMore: boolean
  /** Fetch a single page. Must return the FULL batch for that page (not cumulative). */
  fetchPage: (page: number) => Promise<InfiniteTicketPageResult<T>>
  /** Stable key of a ticket item (defaults to `(t as any).id`). */
  getId?: (ticket: T) => number | string
  /**
   * Bumped by the caller whenever filters/search/sort change. Any value change
   * resets the list back to `initialTickets`/`initialHasMore` (a fresh page 1)
   * instead of appending — mirrors "replace the list rather than append".
   */
  resetKey?: string | number
}

export function useInfiniteTicketList<T>({
  initialTickets,
  initialHasMore,
  fetchPage,
  getId = (t: T) => (t as any).id,
  resetKey,
}: UseInfiniteTicketListOptions<T>) {
  const [tickets, setTickets] = useState<T[]>(initialTickets)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refs (not state) for values read inside the observer callback / loadMore,
  // so a stale closure never re-triggers a request that's already in flight
  // or already knows there's nothing left to fetch.
  const pageRef = useRef(1)
  const loadingRef = useRef(false)
  const hasMoreRef = useRef(initialHasMore)
  const requestIdRef = useRef(0)
  const isFirstRun = useRef(true)

  // Filters/search changed → replace the list with the fresh server-rendered
  // page 1 rather than appending to the previous filter's results.
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    requestIdRef.current += 1 // invalidates any in-flight request from the old filter set
    pageRef.current = 1
    loadingRef.current = false
    hasMoreRef.current = initialHasMore
    setTickets(initialTickets)
    setHasMore(initialHasMore)
    setLoadingMore(false)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return
    loadingRef.current = true
    setLoadingMore(true)
    setError(null)

    const nextPage = pageRef.current + 1
    const myRequestId = requestIdRef.current

    try {
      const result = await fetchPage(nextPage)
      // A reset (filter change) happened while this request was in flight —
      // discard the response; the reset effect already replaced the state.
      if (myRequestId !== requestIdRef.current) return

      pageRef.current = nextPage
      hasMoreRef.current = result.hasMore
      setHasMore(result.hasMore)
      setTickets(prev => {
        const seen = new Set(prev.map(getId))
        const deduped = result.tickets.filter(t => !seen.has(getId(t)))
        return [...prev, ...deduped]
      })
    } catch (err) {
      if (myRequestId !== requestIdRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load more tickets')
    } finally {
      if (myRequestId === requestIdRef.current) {
        loadingRef.current = false
        setLoadingMore(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage])

  return { tickets, hasMore, loadingMore, error, loadMore }
}

/**
 * Attaches an IntersectionObserver to `sentinelRef` (a bottom marker element)
 * scoped to `rootRef` (the scrollable container), calling `onIntersect` with a
 * small rootMargin so the next batch starts loading slightly before the user
 * reaches the absolute bottom.
 */
export function useLoadMoreSentinel(
  rootRef: React.RefObject<HTMLElement | null>,
  sentinelRef: React.RefObject<HTMLElement | null>,
  onIntersect: () => void,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return
    const root = rootRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) onIntersect()
      },
      { root, rootMargin: '200px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, onIntersect])
}
