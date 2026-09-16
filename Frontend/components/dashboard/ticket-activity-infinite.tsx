'use client'

import { useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { TicketActivityTimeline } from '@/components/dashboard/ticket-activity'
import { getTicketHistory } from '@/app/actions/tickets'
import { useInfiniteTicketList, useLoadMoreSentinel } from '@/lib/use-infinite-ticket-list'
import type { TicketHistoryWithUser } from '@/lib/types'

const ACTIVITY_PAGE_SIZE = 20

interface TicketActivityInfiniteProps {
  ticketId: number
  isClient: boolean
  initialHistory: TicketHistoryWithUser[]
  initialTotalCount: number
}

/**
 * Ticket Detail → Activity panel. Same fixed-height scrollable container the
 * panel already used (`max-h-[360px] overflow-y-auto`); the change is that
 * scrolling near the bottom now actually fetches the next 20 activity
 * entries via the existing getTicketHistory(ticketId, limit, offset) action
 * (re-authorized server-side on every call) instead of showing a static,
 * non-functional "Load More" label. Timeline rendering/design (TicketActivityTimeline) is untouched.
 */
export function TicketActivityInfinite({ ticketId, isClient, initialHistory, initialTotalCount }: TicketActivityInfiniteProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const { tickets: history, hasMore, loadingMore, loadMore } = useInfiniteTicketList<TicketHistoryWithUser>({
    initialTickets: initialHistory,
    initialHasMore: initialHistory.length < initialTotalCount,
    fetchPage: async (page) => {
      const offset = (page - 1) * ACTIVITY_PAGE_SIZE
      const batch = await getTicketHistory(ticketId, ACTIVITY_PAGE_SIZE, offset)
      return { tickets: batch, hasMore: offset + batch.length < initialTotalCount }
    },
  })

  useLoadMoreSentinel(containerRef, sentinelRef, loadMore, hasMore)

  return (
    <div ref={containerRef} className="max-h-[360px] overflow-y-auto overscroll-behavior-contain scroll-smooth pr-1 -mr-1">
      <TicketActivityTimeline history={history} isClient={isClient} />
      <div ref={sentinelRef} aria-hidden="true" />
      {loadingMore && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading more activity...
        </div>
      )}
    </div>
  )
}
