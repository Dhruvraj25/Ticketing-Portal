'use client'

import { useState, useMemo, useCallback } from 'react'
import { format } from 'date-fns'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plus,
  Ticket,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TICKET_STATUS_CONFIG, TICKET_PRIORITY_CONFIG } from '@/lib/types'
import { TicketList, TicketGrid } from '@/components/dashboard/ticket-card'
import type { TicketWithRelations, UserRole } from '@/lib/types'
import { TicketTopBar } from '@/components/dashboard/ticket-top-bar'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { TicketRightPanel } from '@/components/dashboard/ticket-right-panel'
import type { TicketListItem } from '@/app/actions/tickets'
import { cn } from '@/lib/utils'

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

  const goToPage = useCallback((page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))
    router.push(`/dashboard/tickets?${params.toString()}`)
  }, [router, searchParams])

  const currentDate = useMemo(() => format(new Date(), 'EEEE, MMMM d, yyyy'), [])

  return (
    <div className="flex flex-col max-h-[calc(100dvh-7.5rem)]">
      {/* ── SECTION 1: Page Header — AI Studio style, scrolls away naturally ── */}
       <div data-tour="tickets-header" className="shrink-0 relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
   
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
          <div className="flex flex-wrap items-center gap-3 self-start sm:self-center">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono border bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300">
              <Calendar size={14} className="text-slate-400" />
              <span>{currentDate}</span>
            </div>
            <Link href="/dashboard/tickets/new">
              <Button size="sm" data-tour="tickets-new-ticket" className="h-9 rounded-xl px-4 font-mono font-bold text-xs shadow-sm">
                <Plus className="mr-1 h-3.5 w-3.5" />
                New Ticket
              </Button>
            </Link>
          </div>
          </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: KPI & Filters — scrolls away naturally ── */}
      <div className="shrink-0 space-y-5" data-tour="ticket-filters">
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
          totalFiltered={tickets.length}
        />
      </div>

      {/* ── SECTION 3: Ticket Container — fills remaining viewport space ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
          {/* Main area: Ticket List + Right Panel */}
          <div className="flex h-full min-h-0">
            {/* Center: Ticket List (scrolls) */}
            <div data-tour="ticket-list" className="flex-1 overflow-y-auto overscroll-behavior-contain scroll-smooth px-4 lg:px-6 py-4">
              {viewMode === 'list' ? (
                <TicketList
                  tickets={tickets as any}
                  showClient={user.role !== 'client'}
                  showAssignee={user.role !== 'developer'}
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
                  tickets={tickets as any}
                  showClient={user.role !== 'client'}
                  showAssignee={user.role !== 'developer'}
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

              {/* ── Server-side Pagination — always reserves space to prevent CLS ── */}
              <div data-tour="ticket-pagination" style={{ minHeight: 40 }} className="flex items-center justify-between mt-4 px-1 pb-4">
              {pagination && pagination.totalPages > 1 ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages}
                    {' '}({pagination.total} total)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => goToPage(pagination.page - 1)} disabled={pagination.page <= 1} className="h-8 w-8 p-0 rounded-lg" aria-label="Previous page">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      const startPage = Math.max(1, pagination.page - 2)
                      const pageNum = startPage + i
                      if (pageNum > pagination.totalPages) return null
                      return (
                        <Button key={pageNum} variant={pageNum === pagination.page ? 'default' : 'outline'} size="sm" onClick={() => goToPage(pageNum)} className={cn('h-8 w-8 p-0 rounded-lg text-xs', pageNum === pagination.page ? '' : 'text-muted-foreground')}>
                          {pageNum}
                        </Button>
                      )
                    })}
                    <Button variant="outline" size="sm" onClick={() => goToPage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="h-8 w-8 p-0 rounded-lg" aria-label="Next page">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {pagination ? `${pagination.total} ticket${pagination.total !== 1 ? 's' : ''} total` : ''}
                </div>
              )}
              </div>
            </div>

            {/* Right Panel (independent scroll) */}
            <div data-tour="tickets-right-panel" className="hidden lg:block w-[300px] xl:w-[340px] shrink-0 border-l border-border/50 overflow-y-auto overscroll-behavior-contain bg-background/50">
              <div className="p-4">
                <TicketRightPanel userRole={user.role} />
              </div>
            </div>
          </div>
        </div>
    </div>
  )
}
