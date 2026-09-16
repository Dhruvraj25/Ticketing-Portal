'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plus,
  Ticket,
  Calendar,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TICKET_STATUS_CONFIG, TICKET_PRIORITY_CONFIG } from '@/lib/types'
import { TicketList, TicketGrid } from '@/components/dashboard/ticket-card'
import type { TicketWithRelations, UserRole } from '@/lib/types'
import { TicketTopBar } from '@/components/dashboard/ticket-top-bar'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { TicketRightPanel } from '@/components/dashboard/ticket-right-panel'
import { getTicketsList, type TicketListItem } from '@/app/actions/tickets'
import { useInfiniteTicketList, useLoadMoreSentinel } from '@/lib/use-infinite-ticket-list'

// Infinite-scroll batch size — initial load and every subsequent "load more"
// request the same 20 tickets at a time (never the full dataset).
const TICKETS_PAGE_SIZE = 20

interface PaginationInfo {
  page: number
  totalPages: number
  total: number
  limit: number
}

interface TicketsPageClientProps {
  user: { id: string; name: string; role: UserRole }
  tickets: TicketListItem[]
  stats: {
    openCount: number
    inProgressCount: number
    resolvedCount: number
    closedCount: number
    totalCount: number
  }
  roleTitle: string
  projects: { id: number; projectName: string; projectCode: string }[]
  initialView?: 'list' | 'grid'
  developers?: { id: string; name: string; email: string; activeTickets: number }[]
  pagination?: PaginationInfo
}

export function TicketsPageClient({
  user,
  tickets,
  stats,
  roleTitle,
  projects,
  initialView = 'list',
  developers,
  pagination,
}: TicketsPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(initialView)
  const [localSearch, setLocalSearch] = useState(searchParams.get('q') || '')
  const [selectedStatus, setSelectedStatus] = useState(searchParams.get('status') || 'all')
  const [selectedPriority, setSelectedPriority] = useState(searchParams.get('priority') || 'all')
  const [selectedProject, setSelectedProject] = useState(searchParams.get('projectId') || 'all')

  // Debounced server-side search — updates URL so the server page re-fetches
  const debouncedSearch = useMemo(() => {
    let timeout: NodeJS.Timeout
    return (value: string) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString())
        if (value) {
          params.set('q', value)
        } else {
          params.delete('q')
        }
        params.set('page', '1') // Reset to page 1 on new search
        router.push(`/dashboard/tickets?${params.toString()}`)
      }, 250)
    }
  }, [router, searchParams])

  const handleSearchChange = useCallback((query: string) => {
    setLocalSearch(query)
    debouncedSearch(query)
  }, [debouncedSearch])

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.set('page', '1') // Reset to page 1 on filter change
    router.push(`/dashboard/tickets?${params.toString()}`)
  }, [router, searchParams])

  const handleStatusChange = useCallback((status: string) => {
    setSelectedStatus(status)
    updateFilter('status', status === 'all' ? '' : status)
  }, [updateFilter])

  const handlePriorityChange = useCallback((priority: string) => {
    setSelectedPriority(priority)
    updateFilter('priority', priority === 'all' ? '' : priority)
  }, [updateFilter])

  const handleProjectChange = useCallback((projectId: string) => {
    setSelectedProject(projectId)
    updateFilter('projectId', projectId === 'all' ? '' : projectId)
  }, [updateFilter])

  const handleViewChange = useCallback((view: 'list' | 'grid') => {
    setViewMode(view)
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', view)
    router.push(`/dashboard/tickets?${params.toString()}`)
  }, [router, searchParams])

  const onAssignmentComplete = useCallback(() => {
    router.refresh()
  }, [router])

  const currentDate = useMemo(() => format(new Date(), 'EEEE, MMMM d, yyyy'), [])

  // ── Infinite scroll ────────────────────────────────────────────────────
  // Filters/search/status/project are still resolved SERVER-SIDE via the URL
  // (unchanged above — router.push triggers a fresh server fetch of page 1,
  // which arrives here as new `tickets`/`pagination` props). Infinite scroll
  // only replaces HOW additional pages beyond page 1 are loaded: instead of
  // a "Next page" button, scrolling near the bottom calls the SAME existing
  // getTicketsList server action for page N+1 and appends the result.
  const q = searchParams.get('q') || ''
  const status = searchParams.get('status') || ''
  const priority = searchParams.get('priority') || ''
  const projectIdParam = searchParams.get('projectId') || ''
  const moduleIdParam = searchParams.get('moduleId') || ''

  // Changes whenever the SERVER-ENFORCED filter set changes (i.e. whenever
  // page.tsx will have re-fetched a fresh page 1) — never when only `page`
  // itself would change, since infinite scroll owns paging from here on.
  const filterResetKey = `${q}|${status}|${priority}|${projectIdParam}|${moduleIdParam}`

  const fetchTicketsPage = useCallback(async (page: number) => {
    const result = await getTicketsList({
      search: q || undefined,
      status: status || undefined,
      priority: priority || undefined,
      projectId: projectIdParam ? parseInt(projectIdParam, 10) : undefined,
      moduleId: moduleIdParam ? parseInt(moduleIdParam, 10) : undefined,
      page,
      limit: TICKETS_PAGE_SIZE,
    })
    return { tickets: result.tickets, hasMore: page < result.totalPages }
  }, [q, status, priority, projectIdParam, moduleIdParam])

  const {
    tickets: loadedTickets,
    hasMore,
    loadingMore,
    loadMore,
  } = useInfiniteTicketList<TicketListItem>({
    initialTickets: tickets,
    initialHasMore: pagination ? pagination.page < pagination.totalPages : false,
    fetchPage: fetchTicketsPage,
    resetKey: filterResetKey,
  })

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  useLoadMoreSentinel(scrollContainerRef, loadMoreRef, loadMore, hasMore)

  return (
    <div className="space-y-5">
      {/* ── SECTION 1: Page Header — AI Studio style, scrolls away naturally ── */}
       <div data-tour="tickets-header" className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
   
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn">
          <div className="flex items-center gap-3">
            <PageHeaderIcon variant="teal">
              <Ticket className="h-5 w-5" />
            </PageHeaderIcon>
            <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                {roleTitle}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {stats.totalCount} total
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono leading-relaxed flex items-center gap-1.5">
              <span className="text-amber-500/80 dark:text-amber-400/80 font-mono">✨</span>
              <span>Track, manage and review support tickets</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 self-start sm:self-center shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono border bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300">
              <Calendar size={14} className="text-slate-400" />
              <span>{currentDate}</span>
            </div>
            {user.role !== 'developer' && (
              <Link href="/dashboard/tickets/new">
                <Button size="sm" data-tour="tickets-new-ticket" className="h-9 rounded-xl px-4 font-mono font-bold text-xs shadow-sm">
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New Ticket
                </Button>
              </Link>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>

      {/* ── SECTION 2: KPI & Filters — scrolls away naturally ── */}
      <div className="space-y-5" data-tour="ticket-filters">
        <TicketTopBar
          stats={stats}
          projects={projects}
          onViewChange={handleViewChange}
          viewMode={viewMode}
          onSearchChange={handleSearchChange}
          searchQuery={localSearch}
          selectedStatus={selectedStatus}
          onStatusChange={handleStatusChange}
          selectedPriority={selectedPriority}
          onPriorityChange={handlePriorityChange}
          selectedProject={selectedProject}
          onProjectChange={handleProjectChange}
          totalFiltered={loadedTickets.length}
        />
      </div>

      {/* ── SECTION 3: Ticket Container — responsive grid: ticket list (left,
          ~69% on desktop) + Quick Actions/Insights/Analytics sidebar (right,
          ~31%), stacking to a single column below the lg breakpoint. Both
          columns carry min-w-0 so long ticket content can never force the
          grid (and the page) wider than the viewport. ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,0.9fr)] gap-6">

        {/* Ticket List — only this area has internal scrolling. Infinite
            scroll appends pages as the user nears the bottom of THIS
            container — the rest of the page never scrolls to load more. */}
        <div className="min-w-0">
          <div
            ref={scrollContainerRef}
            data-tour="ticket-list"
            className="w-full max-h-[900px] overflow-y-auto overscroll-behavior-contain scroll-smooth px-4 lg:px-6 py-4"
          >
            {viewMode === 'list' ? (
              <TicketList
                tickets={loadedTickets as any}
                showClient={user.role !== 'client'}
                // Developer assignment is internal — never shown to clients (R15).
                showAssignee={user.role !== 'developer' && user.role !== 'client'}
                developers={developers}
                userRole={user.role}
                onAssignmentComplete={onAssignmentComplete}
                emptyMessage={
                  user.role === 'client'
                    ? "You haven't submitted any tickets yet. Create your first ticket to get started!"
                    : user.role === 'developer'
                    ? "No tickets assigned to you yet."
                    : "No tickets found matching your filters."
                }
              />
            ) : (
              <TicketGrid
                tickets={loadedTickets as any}
                showClient={user.role !== 'client'}
                // Developer assignment is internal — never shown to clients (R15).
                showAssignee={user.role !== 'developer' && user.role !== 'client'}
                developers={developers}
                userRole={user.role}
                onAssignmentComplete={onAssignmentComplete}
                emptyMessage={
                  user.role === 'client'
                    ? "You haven't submitted any tickets yet."
                    : user.role === 'developer'
                    ? "No tickets assigned to you yet."
                    : "No tickets found matching your filters."
                }
              />
            )}

            {/* Bottom sentinel — becomes visible slightly before the actual
                bottom (rootMargin on the observer), triggering the next
                20-ticket batch. */}
            <div ref={loadMoreRef} aria-hidden="true" />

            {/* ── Infinite-scroll status — always reserves space to prevent CLS ── */}
            <div data-tour="ticket-pagination" style={{ minHeight: 40 }} className="flex items-center justify-center px-1 py-3">
              {loadingMore ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading more tickets...
                </div>
              ) : !hasMore && loadedTickets.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  No more tickets — {loadedTickets.length} of {pagination?.total ?? loadedTickets.length} loaded
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right Panel (independent scroll) — Quick Actions / Analytics /
            Insights, unchanged content, now a true grid sibling of the ticket
            list instead of nested beneath it. */}
        <aside data-tour="tickets-right-panel" className="min-w-0 lg:border-l lg:border-border/50 overflow-y-auto overscroll-behavior-contain bg-background/50">
          <div className="p-4">
            <TicketRightPanel userRole={user.role} />
          </div>
        </aside>
      </div>
    </div>
  )
}
