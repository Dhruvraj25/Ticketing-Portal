'use client'

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { getPaginatedWorklogs } from '@/app/actions/tickets'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { fmtDuration, stripHtml } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { useIsMobile } from '@/hooks/use-mobile'
import { ClipboardList, Activity, ChevronDown, Timer } from 'lucide-react'

interface LogEntry {
  id: number
  ticketId: number
  userId: string
  description: string | null
  startTime: Date
  durationMinutes: number | null
  endTime: Date | null
  isBillable: boolean
  userName: string
  userRole: string
  ticketNumber: string
  ticketTitle: string
}

const PAGE_SIZE = 20

function LogRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/20">
      <Skeleton className="h-7 w-7 rounded-lg shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-16 rounded" />
          <Skeleton className="h-3.5 w-24 rounded" />
        </div>
        <Skeleton className="h-3 w-40 rounded" />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Skeleton className="h-3 w-14 rounded" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
    </div>
  )
}

function LogRow({ log }: { log: LogEntry }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/20 hover:bg-muted/20 transition-colors group">
      <div className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
        <span className="text-[11px] font-semibold text-foreground">
          {log.userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground truncate">{log.userName}</span>
          <span className="text-[11px] font-mono text-muted-foreground/60 shrink-0">
            {log.ticketNumber}
          </span>
          {log.isBillable && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium shrink-0">
              Billable
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate max-w-[300px]">
          {stripHtml(log.description) || (
            <span className="italic text-muted-foreground/50">No description</span>
          )}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground/60 tabular-nums">
            {format(new Date(log.startTime), 'MMM d, HH:mm')}
          </span>
        </div>
        <span className="text-xs font-semibold text-foreground tabular-nums">
          {fmtDuration(log.durationMinutes || 0)}
        </span>
      </div>
    </div>
  )
}

const MemoizedLogRow = memo(LogRow)

export function ActivityLogPanel({ initialLogs, initialHasMore }: { initialLogs: LogEntry[]; initialHasMore: boolean }) {
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs)
  const [hasMoreState, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)
  const [isSticky, setIsSticky] = useState(false)
  const isMobile = useIsMobile()

  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const stickySentinelRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(1)
  const loadingRef = useRef(false)

  // ── Load more function (declare before effects that use it) ─────────
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreState) return
    loadingRef.current = true
    setLoading(true)

    try {
      const offset = pageRef.current * PAGE_SIZE
      const result = await getPaginatedWorklogs(PAGE_SIZE, offset)

      setLogs((prev) => {
        const existingIds = new Set(prev.map((l) => l.id))
        const newLogs = result.logs.filter((l) => !existingIds.has(l.id))
        if (newLogs.length === 0) return prev
        return prev.concat(newLogs)
      })

      setHasMore(result.hasMore)
      pageRef.current += 1
    } catch {
      console.error('Failed to load more worklogs')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [hasMoreState])

  // ── Sticky detection ────────────────────────────────────────────────
  useEffect(() => {
    if (isMobile) return

    const sentinel = stickySentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSticky(!entry.isIntersecting)
      },
      { threshold: 0 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [isMobile])

  // ── Infinite scroll ─────────────────────────────────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMoreState && !loadingRef.current) {
          loadMore()
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMoreState, loadMore])

  // Memoize the log list to avoid unnecessary re-renders
  const logList = useMemo(() => {
    return logs.map((log) => <MemoizedLogRow key={log.id} log={log} />)
  }, [logs])

  const [disableSticky, setDisableSticky] = useState(() => {
    if (typeof window !== 'undefined') {
      return isMobile || window.innerHeight < 700
    }
    return false
  })

  const summaryTotal = useMemo(
    () => logs.reduce((s, l) => s + (l.durationMinutes || 0), 0),
    [logs]
  )
  const summaryBillable = useMemo(
    () => logs.filter((l) => l.isBillable).reduce((s, l) => s + (l.durationMinutes || 0), 0),
    [logs]
  )

  return (
    <>
      {/* Sentinel for sticky detection */}
      {!disableSticky && <div ref={stickySentinelRef} className="h-1" />}

      <div
        ref={containerRef}
        data-tour="worklogs-activity-log"
        className={cn(
          'rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden card-shadow transition-shadow',
          !disableSticky && isSticky && 'shadow-lg'
        )}
        style={
          !disableSticky && isSticky
            ? {
                position: 'sticky',
                top: '24px',
                maxHeight: 'calc(100vh - 48px)',
                display: 'flex',
                flexDirection: 'column',
              }
            : undefined
        }
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/5">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Activity Log</h3>
              <p className="text-[11px] text-muted-foreground">
                {logs.length} log{logs.length !== 1 ? 's' : ''} loaded
              </p>
            </div>
          </div>
          {hasMoreState && (
            <Badge variant="outline" className="text-[11px] text-muted-foreground">
              <ChevronDown className="h-3 w-3 mr-1" />
              Scroll for more
            </Badge>
          )}
        </div>

        {/* Scrollable list area */}
        <div
          className={cn(
            'overflow-y-auto',
            !disableSticky && isSticky ? 'flex-1' : 'max-h-[650px]'
          )}
          style={!disableSticky && isSticky ? { minHeight: 0 } : undefined}
        >
          {/* Summary bar */}
          <div className="px-4 py-2.5 bg-muted/10 border-b border-border/30 flex items-center gap-4 text-xs text-muted-foreground sticky top-0 bg-white/90 dark:bg-slate-900 backdrop-blur-sm z-10">
            <div className="flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" />
              <span>
                Total: <strong className="text-foreground">{fmtDuration(summaryTotal)}</strong>
              </span>
            </div>
            <div>
              Billable: <strong className="text-green-600 dark:text-green-400">{fmtDuration(summaryBillable)}</strong>
            </div>
          </div>

          {/* Log list */}
          {logs.length === 0 && !loading ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No activity logs yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border/10">{logList}</div>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div className="py-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <LogRowSkeleton key={'skel-' + i} />
              ))}
            </div>
          )}

          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-4" />

          {/* End state */}
          {!hasMoreState && logs.length > 0 && !loading && (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground/50">
                All {logs.length} logs loaded
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
