'use client'

import { useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { Loader2, Play, Pause, RotateCcw, Square, CheckCircle2, ClipboardList } from 'lucide-react'
import { getTicketWorkActivity } from '@/app/actions/tickets'
import { useInfiniteTicketList, useLoadMoreSentinel } from '@/lib/use-infinite-ticket-list'
import { fmtTz } from '@/lib/datetime'
import { useUserTimezone } from '@/components/timezone-provider'
import { cn } from '@/lib/utils'
import { BILLING_LABEL } from '@/lib/billing'
import {
  groupEventsByTicket, WORK_ACTIVITY_BATCH, WORK_EVENT_LABEL, workEventDetail, workEventKind,
  type WorkActivityEvent, type WorkEventKind,
} from '@/lib/work-activity'

const KIND_ICON: Record<WorkEventKind, { icon: typeof Play; className: string }> = {
  started: { icon: Play, className: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15' },
  resumed: { icon: RotateCcw, className: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/15' },
  paused: { icon: Pause, className: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15' },
  stopped: { icon: Square, className: 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800' },
  resolved: { icon: CheckCircle2, className: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/15' },
}

function BillingBadge({ billable }: { billable: boolean }) {
  return (
    <span className={cn(
      'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 border',
      billable
        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-500/30'
        : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
    )}>
      {BILLING_LABEL[billable ? 'billable' : 'non_billable']}
    </span>
  )
}

/**
 * Worklogs → Activity Log → Ticket activity: each ticket with its work events
 * (started / paused / started again / stopped / resolved), who did it, when,
 * and whether the ticket's work is billable. Loads in batches as it scrolls.
 */
export function TicketWorkActivity({ initialEvents, initialHasMore }: { initialEvents: WorkActivityEvent[]; initialHasMore: boolean }) {
  const timezone = useUserTimezone()
  const fetchPage = useCallback(async (page: number) => {
    const result = await getTicketWorkActivity(WORK_ACTIVITY_BATCH, (page - 1) * WORK_ACTIVITY_BATCH)
    return { tickets: result.events, hasMore: result.hasMore }
  }, [])

  const { tickets: events, hasMore, loadingMore, error, loadMore } = useInfiniteTicketList<WorkActivityEvent>({
    initialTickets: initialEvents,
    initialHasMore,
    fetchPage,
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useLoadMoreSentinel(scrollRef, sentinelRef, loadMore, hasMore)

  const groups = useMemo(() => groupEventsByTicket(events), [events])

  return (
    <div ref={scrollRef} data-testid="ticket-work-activity" className="max-h-[650px] overflow-y-auto">
      {groups.length === 0 && !loadingMore ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No ticket activity yet</p>
        </div>
      ) : (
        groups.map((g, gi) => {
          const head = g.events[0]
          return (
            <section key={`${g.ticketId}-${gi}`} className="border-b border-border/30">
              {/* Ticket header — stays visible while its events scroll */}
              <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-muted/40 backdrop-blur-sm border-b border-border/20">
                <Link href={`/dashboard/tickets/${g.ticketId}`} className="text-[11px] font-mono font-semibold text-foreground hover:text-primary shrink-0">
                  {head.ticketNumber}
                </Link>
                <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{head.ticketTitle}</span>
                <BillingBadge billable={head.isBillable} />
              </div>
              <ul className="divide-y divide-border/10">
                {g.events.map((e) => {
                  const kind = workEventKind(e.action, e.newValue)
                  if (!kind) return null
                  const { icon: Icon, className } = KIND_ICON[kind]
                  const detail = workEventDetail(e)
                  return (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                      <span className={cn('h-7 w-7 rounded-lg flex items-center justify-center shrink-0', className)}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground truncate">
                          <span className="font-medium">{e.userName}</span>{' '}
                          <span className="text-muted-foreground">·</span>{' '}
                          {WORK_EVENT_LABEL[kind]}
                        </p>
                        {detail && <p className="text-[11px] text-muted-foreground truncate">{detail}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-[11px] text-muted-foreground/70 tabular-nums">
                          {fmtTz(e.createdAt, 'MMM d, HH:mm', timezone)}
                        </span>
                        <BillingBadge billable={e.isBillable} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })
      )}

      <div ref={sentinelRef} aria-hidden="true" className="h-4" />
      <div className="text-center py-3 text-xs text-muted-foreground/70" role="status">
        {loadingMore ? (
          <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more activity...</span>
        ) : error ? (
          <span className="text-destructive">Couldn&apos;t load more activity. Scroll to retry.</span>
        ) : !hasMore && events.length > 0 ? (
          'All ticket activity loaded'
        ) : null}
      </div>
    </div>
  )
}
