'use client'

import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react'
import { format } from 'date-fns'
import {
  Search,
  SlidersHorizontal,
  X,
  Filter,
  List,
  Grid,
  ArrowUpDown,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { TicketStatus, TICKET_STATUS_CONFIG, TICKET_PRIORITY_CONFIG } from '@/lib/types'
import { StatCard } from '@/components/dashboard/stat-card'
import { statusKpis as buildStatusKpis, TOTAL_TICKETS_KPI } from '@/lib/ticket-status-kpis'
import { cn } from '@/lib/utils'

interface TicketTopBarProps {
  stats: {
    /** Exact ticket count per status (role-scoped), keyed by TicketStatus value. */
    statusCounts: Record<string, number>
    /** All tickets visible to this user (role-scoped). */
    totalTickets: number
    totalCount: number
  }
  projects: { id: number; projectName: string; projectCode: string }[]
  onViewChange: (view: 'list' | 'grid') => void
  viewMode: 'list' | 'grid'
  onSearchChange: (query: string) => void
  searchQuery: string
  selectedStatus: string
  onStatusChange: (status: string) => void
  selectedPriority: string
  onPriorityChange: (priority: string) => void
  selectedProject: string
  onProjectChange: (projectId: string) => void
  totalFiltered: number
  /** When true, hides the KPI cards row — useful for the sticky ticket section */
  showKpis?: boolean
}

export const TicketTopBar = memo(function TicketTopBar({
  stats,
  projects,
  onViewChange,
  viewMode,
  onSearchChange,
  searchQuery,
  selectedStatus,
  onStatusChange,
  selectedPriority,
  onPriorityChange,
  selectedProject,
  onProjectChange,
  totalFiltered,
  showKpis = true,
}: TicketTopBarProps) {
  const [showFilters, setShowFilters] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [localSearch, setLocalSearch] = useState(searchQuery)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        onSearchChange(localSearch)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [localSearch, searchQuery, onSearchChange])

  const hasFilters = selectedStatus !== 'all' || selectedPriority !== 'all' || selectedProject !== 'all' || searchQuery

  const clearFilters = useCallback(() => {
    setLocalSearch('')
    onSearchChange('')
    onStatusChange('all')
    onPriorityChange('all')
    onProjectChange('all')
  }, [onSearchChange, onStatusChange, onPriorityChange, onProjectChange])

  const currentDate = useMemo(() => format(new Date(), 'EEEE, MMMM d, yyyy'), [])

  // One KPI per real ticket status (the single TICKET_STATUS_CONFIG definition,
  // in its lifecycle order), shown only when that status has tickets —
  // shared with the Dashboard via lib/ticket-status-kpis.ts.
  const statusKpis = useMemo(() => buildStatusKpis(stats.statusCounts), [stats.statusCounts])

  return (
    <div className="bg-background/95 backdrop-blur-md">
      {/* KPI Cards Row — sized by its cards (the counts are server-rendered, so
          there is no load-time shift to reserve space for) and grows when more
          status cards wrap onto another row (never clips them). A fixed 184px
          reserve used to leave a large gap above the filters when the cards fit
          on one row; the gap is now the row's pb-3 — the same 12px as between
          the KPI cards. */}
      <div className={cn('px-4 lg:px-6 overflow-hidden transition-all duration-200', showKpis ? 'opacity-100' : 'opacity-0')} style={{ height: showKpis ? 'auto' : 8 }}>
        {showKpis && (
          <div className="pt-4 pb-3">
            <div data-tour="ticket-kpis" className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard title={TOTAL_TICKETS_KPI.label} value={stats.totalTickets} iconName={TOTAL_TICKETS_KPI.icon} colorTheme={TOTAL_TICKETS_KPI.color} />
              {statusKpis.map((k) => (
                <StatCard key={k.status} title={k.label} value={k.count} iconName={k.icon} colorTheme={k.color} />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="px-4 lg:px-6 pb-4">
        <div className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm">
          <div className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div data-tour="ticket-search" className="relative flex-1 min-w-[180px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  placeholder="Search by title, ID, or description..."
                  className="pl-9 h-9 rounded-xl bg-muted/30 border-border/50 text-sm"
                />
              </div>

              {/* Status pills */}
              <div data-tour="ticket-status-pills" className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                {[
                  // Each pill filters by exactly one status, so it shows that
                  // status's exact count (not a lumped bucket).
                  { value: 'all', label: 'All', count: stats.totalCount },
                  { value: TicketStatus.NEW, label: 'New Request', count: stats.statusCounts[TicketStatus.NEW] ?? 0 },
                  { value: TicketStatus.IN_PROGRESS, label: 'Work in Progress', count: stats.statusCounts[TicketStatus.IN_PROGRESS] ?? 0 },
                  { value: TicketStatus.RESOLVED, label: 'Manager Review', count: stats.statusCounts[TicketStatus.RESOLVED] ?? 0 },
                  { value: TicketStatus.CLOSED, label: 'Completed', count: stats.statusCounts[TicketStatus.CLOSED] ?? 0 },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => onStatusChange(tab.value === 'all' ? 'all' : tab.value)}
                    className={cn(
                      'relative px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all',
                      (selectedStatus === tab.value || (selectedStatus === 'all' && tab.value === 'all'))
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    {tab.label}
                    <span className={cn(
                      'ml-1.5 text-[11px]',
                      (selectedStatus === tab.value || (selectedStatus === 'all' && tab.value === 'all'))
                        ? 'text-primary-foreground/70'
                        : 'text-muted-foreground/60'
                    )}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* View Toggle */}
              <div data-tour="ticket-view-toggle" className="flex items-center rounded-lg border border-border/50 bg-muted/20 p-0.5 shrink-0">
                <button
                  onClick={() => onViewChange('list')}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    viewMode === 'list' ? 'bg-white dark:bg-slate-900 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-label="List view"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onViewChange('grid')}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    viewMode === 'grid' ? 'bg-white dark:bg-slate-900 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-label="Grid view"
                >
                  <Grid className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Filter toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                data-tour="ticket-filter-toggle"
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0',
                  hasFilters
                    ? 'bg-primary/5 border-primary/30 text-primary'
                    : 'bg-white dark:bg-slate-900 border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <Filter className="h-3.5 w-3.5" />
                Filters
                {hasFilters && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </button>

              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 shrink-0"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>

            {/* Expanded Filters — grid-rows collapse so the container grows with its
                content (wrap on small screens) instead of clipping the controls */}
            <div className={cn(
              'grid transition-all duration-200',
              showFilters ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            )}>
              <div className="overflow-hidden min-h-0">
              <div className="flex items-center gap-2 pt-3 mt-3 border-t border-border/50 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">Filter by:</span>
                    </div>

                    <Select value={selectedStatus} onValueChange={onStatusChange}>
                      <SelectTrigger className="w-[130px] h-8 rounded-lg bg-muted/20 border-border/50 text-xs">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {Object.entries(TICKET_STATUS_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>{config.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={selectedPriority} onValueChange={onPriorityChange}>
                      <SelectTrigger className="w-[130px] h-8 rounded-lg bg-muted/20 border-border/50 text-xs">
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Priorities</SelectItem>
                        {Object.entries(TICKET_PRIORITY_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>{config.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={selectedProject} onValueChange={onProjectChange}>
                      <SelectTrigger className="w-[150px] h-8 rounded-lg bg-muted/20 border-border/50 text-xs">
                        <SelectValue placeholder="Project" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Projects</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)} className="truncate">
                            <span className="truncate">{p.projectCode} — {p.projectName}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
              </div>
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between mt-2 px-1">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{totalFiltered}</span>{' '}
            {totalFiltered === 1 ? 'ticket' : 'tickets'}
            {hasFilters && ' (filtered)'}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <ArrowUpDown className="h-3 w-3" />
            Sorted by newest
          </p>
        </div>
      </div>
    </div>
  )
})
