'use client'

import { useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { TicketList } from '@/components/dashboard/ticket-card'
import { getRecentTicketsPage } from '@/app/actions/dashboard'
import { useInfiniteTicketList, useLoadMoreSentinel } from '@/lib/use-infinite-ticket-list'

interface RecentTicketsScrollProps {
  /** Page 1 tickets, already fetched server-side (no extra request on mount). */
  initialTickets: any[]
  initialHasMore: boolean
  showClient: boolean
  showAssignee: boolean
  emptyMessage: string
}

/**
 * Dashboard "Recent Tickets" — fixed-height scrollable container (same visual
 * pattern as the sidebar's "Active Projects" panel: a bordered box with its
 * own `overflow-y-auto`) that lazy-loads additional tickets 20 at a time as
 * the user scrolls, instead of loading the whole ticket set up front.
 *
 * Ticket cards/design are untouched — this only wraps the existing
 * `TicketList` in a scroll container and appends pages fetched via the
 * existing `getRecentTicketsPage` server action.
 */
export function RecentTicketsScroll({
  initialTickets,
  initialHasMore,
  showClient,
  showAssignee,
  emptyMessage,
}: RecentTicketsScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const { tickets, hasMore, loadingMore, loadMore } = useInfiniteTicketList({
    initialTickets,
    initialHasMore,
    fetchPage: (page) => getRecentTicketsPage(page),
  })

  useLoadMoreSentinel(containerRef, sentinelRef, loadMore, hasMore)

  if (tickets.length === 0) {
    // Reuse TicketList's own empty state — no design change.
    return <TicketList tickets={[]} showClient={showClient} showAssignee={showAssignee} emptyMessage={emptyMessage} />
  }

  return (
    // Fixed-height scroll container, same styling family as the sidebar's
    // "Active Projects" panel (`overflow-y-auto` inside a bordered box) —
    // sized to show roughly 10 ticket cards before scrolling kicks in.
    <div
      ref={containerRef}
      data-tour="dashboard-recent-tickets-scroll"
      className="max-h-[900px] overflow-y-auto overscroll-behavior-contain rounded-2xl"
    >
      <TicketList
        tickets={tickets}
        showClient={showClient}
        showAssignee={showAssignee}
        emptyMessage={emptyMessage}
      />
      <div ref={sentinelRef} aria-hidden="true" />
      {loadingMore && (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading more tickets...
        </div>
      )}
      {!hasMore && tickets.length > 0 && (
        <div className="text-center py-3 text-xs text-muted-foreground/70">
          No more tickets
        </div>
      )}
    </div>
  )
}
