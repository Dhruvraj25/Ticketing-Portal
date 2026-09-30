'use client'

import { useState, useMemo, useCallback, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { useDebounce } from '@/hooks/use-debounce'
import { getModules, deleteModule } from '@/app/actions/modules'
import {
  Plus,
  Search,
  Layers,
  SlidersHorizontal,
  X,
  ArrowUpDown,
  FolderKanban,
  Eye,  
  Edit3,
  Trash2,
  Ticket,
  MoreHorizontal,
  User,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MODULE_STATUS_CONFIG } from '@/lib/types'
import { StatCard } from '@/components/dashboard/stat-card'
import { CurrentDate } from '@/components/dashboard/page-header'
import type { ModuleWithRelations, UserRole } from '@/lib/types'
import type { ModuleListResult, ModuleStatusCounts } from '@/app/actions/modules'
import { useInfiniteTicketList, useLoadMoreSentinel } from '@/lib/use-infinite-ticket-list'
import { INITIAL_FILTER_KEY, moduleBatchFilters } from '@/lib/module-list-batches'

interface ModulesPageClientProps {
  user: { id: string; name: string; role: UserRole }
  projects: { id: number; projectName: string; projectCode: string }[]
  /** First batch (default filters), fetched server-side for the first paint. */
  initialPage: ModuleListResult
}

type ModuleSort = 'name' | 'created' | 'tickets'

export function ModulesPageClient({ user, projects, initialPage }: ModulesPageClientProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProject, setSelectedProject] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState<ModuleSort>('created')

  const debouncedSearch = useDebounce(searchQuery, 350)

  // ── Infinite scroll (shared hook, same as the Ticket List) ──────────────
  // Batches of MODULES_BATCH_SIZE from getModules (server-side search /
  // filter / sort, LIMIT/OFFSET). Any search/filter/sort change is a new
  // result set: the list is cleared and loading restarts from batch 1.
  const filterKey = `${debouncedSearch}|${selectedProject}|${selectedStatus}|${sortBy}`
  const isInitialFilters = filterKey === INITIAL_FILTER_KEY
  const [meta, setMeta] = useState<{ total: number; statusCounts: ModuleStatusCounts | undefined }>({
    total: initialPage.total,
    statusCounts: initialPage.statusCounts,
  })
  const filterKeyRef = useRef(filterKey)
  filterKeyRef.current = filterKey

  const fetchModulesPage = useCallback(async (page: number) => {
    const key = filterKey
    const result = await getModules(moduleBatchFilters({
      search: debouncedSearch, projectId: selectedProject, status: selectedStatus, sortBy, page,
    }))
    // Count / KPI metadata from the current result set only (a stale
    // response for an older filter set never updates it).
    if (key === filterKeyRef.current) {
      setMeta((prev) => ({ total: result.total, statusCounts: result.statusCounts ?? prev.statusCounts }))
    }
    return { tickets: result.modules as unknown as ModuleWithRelations[], hasMore: page < result.totalPages }
  }, [filterKey, debouncedSearch, selectedProject, selectedStatus, sortBy])

  const {
    tickets: loadedModules,
    hasMore,
    loadingMore,
    error: loadError,
    loadMore,
  } = useInfiniteTicketList<ModuleWithRelations>({
    // Default filters → the server-rendered first batch. Any other filter set
    // starts EMPTY at page 0, so the sentinel immediately loads its batch 1.
    initialTickets: isInitialFilters ? (initialPage.modules as unknown as ModuleWithRelations[]) : [],
    initialHasMore: isInitialFilters ? initialPage.page < initialPage.totalPages : true,
    startPage: isInitialFilters ? 1 : 0,
    fetchPage: fetchModulesPage,
    resetKey: filterKey,
  })

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  useLoadMoreSentinel(scrollContainerRef, loadMoreRef, loadMore, hasMore)

  // Deleted rows are hidden optimistically (the list itself belongs to the hook).
  const [removedIds, setRemovedIds] = useState<Set<number>>(() => new Set())
  const visibleModules = useMemo(() => loadedModules.filter((m) => !removedIds.has(m.id)), [loadedModules, removedIds])
  const totalCount = Math.max(0, meta.total - loadedModules.filter((m) => removedIds.has(m.id)).length)

  // KPI cards: role scope + search (server-side counts, not just the loaded rows).
  const stats = meta.statusCounts ?? { total: 0, active: 0, completed: 0 }

  // Project options for the filter: the projects this user can see.
  const projectOptions = useMemo(
    () => projects.map((p) => ({ id: p.id, name: p.projectName, code: p.projectCode })),
    [projects],
  )

  const hasFilters = searchQuery || selectedProject !== 'all' || selectedStatus !== 'all'
  const searchLoading = searchQuery !== debouncedSearch || (loadingMore && visibleModules.length === 0)
  const nothingFound = visibleModules.length === 0 && !hasMore && !loadingMore

  const handleDeleteModule = useCallback(async (moduleId: number) => {
    if (!confirm('Are you sure you want to delete this module? Tickets linked to it will have their module reference removed.')) return
    try {
      await deleteModule(moduleId)
      // Optimistic local update — no router.refresh() needed
      setRemovedIds((prev) => new Set(prev).add(moduleId))
    } catch {}
  }, [])

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setSelectedProject('all')
    setSelectedStatus('all')
  }, [])

  return (
    <div className="space-y-6" data-tour="modules-list">
      {/* Header — single clean card */}
      <motion.div
        data-tour="modules-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm"
      >
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PageHeaderIcon variant="indigo">
              <Layers className="h-5 w-5" />
            </PageHeaderIcon>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Modules / Service Areas</h1>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                <span className="text-amber-500/80 dark:text-amber-400/80">✨</span>
                Manage and organize project modules / service areas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <CurrentDate />
            <Button asChild className="rounded-xl font-mono font-bold text-xs h-9 shadow-sm">
              <Link href="/dashboard/modules/create">
                <Plus className="mr-1.5 h-4 w-4" />
                New Module / Service Area
              </Link>
            </Button>
          </div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <motion.div
        data-tour="modules-kpis"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        <StatCard title="Total Modules / Service Areas" value={stats.total} iconName="Layers" delay={0} />
        <StatCard title="Active Modules / Service Areas" value={stats.active} iconName="Briefcase" delay={1} />
        <StatCard title="Completed" value={stats.completed} iconName="CheckCircle2" delay={2} />
      </motion.div>

      {/* Search & Filters */}
      <motion.div
        data-tour="modules-search-filters"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm"
      >
        <div className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search modules by name, description, or project..."
                className="pl-9 h-10 rounded-xl bg-muted/30 border-border/50 text-sm"
              />
            </div>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as ModuleSort)}>
              <SelectTrigger className="w-[140px] h-10 rounded-xl bg-muted/20 border-border/50 text-sm">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created">Newest</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="tickets">Most Tickets</SelectItem>
              </SelectContent>
            </Select>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                hasFilters
                  ? 'bg-primary/5 border-primary/30 text-primary'
                  : 'bg-white dark:bg-slate-900 border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {hasFilters && <span className="h-2 w-2 rounded-full bg-primary" />}
            </button>

            {hasFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 pt-4 mt-4 border-t border-border/50 flex-wrap">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">Filter by:</span>
                  </div>

                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger className="w-[180px] h-9 rounded-xl bg-muted/20 border-border/50 text-sm">
                      <SelectValue placeholder="Project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {projectOptions.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)} className="truncate">
                          <span className="truncate">{p.code} — {p.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-[140px] h-9 rounded-xl bg-muted/20 border-border/50 text-sm">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {Object.entries(MODULE_STATUS_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>{config.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          {searchLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Showing <span className="font-medium text-foreground">{totalCount}</span>{' '}
          {totalCount === 1 ? 'module / service area' : 'modules / service areas'}
          {hasFilters && ' (filtered)'}
          {visibleModules.length < totalCount && (
            <span className="text-xs">· {visibleModules.length} loaded</span>
          )}
        </p>
      </div>

      {/* Modules Table */}
      {nothingFound ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-white dark:bg-slate-900 border border-border p-12 text-center"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 rounded-2xl bg-muted/30">
              <Layers className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <p className="font-semibold text-foreground text-lg">
              {hasFilters ? 'No modules / service areas found' : 'No modules / service areas yet'}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? 'Try adjusting your search or filter criteria.'
                : 'Create your first module / service area to organize tickets within a project.'}
            </p>
            {!hasFilters && (
              <Link href="/dashboard/modules/create">
                <Button>
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Module / Service Area
                </Button>
              </Link>
            )}
          </div>
        </motion.div>
      ) : (
        <div data-tour="modules-table" className="rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden shadow-sm">
          {/* The list scrolls inside this container (like the Ticket List) instead
              of growing the page; the header row stays visible while scrolling. */}
          <div ref={scrollContainerRef} data-testid="modules-table-scroll" className="max-h-[640px] overflow-auto overscroll-behavior-contain">
          <table data-slot="table" className="w-full caption-bottom font-mono text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-900">
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Module / Service Area Name</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Tickets</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assigned To</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleModules.map((mod) => (
                <ModuleTableRow
                  key={mod.id}
                  mod={mod}
                  onDelete={handleDeleteModule}
                />
              ))}
            </TableBody>
          </table>
          {/* Sentinel: next batch loads shortly before the bottom is reached
              (IntersectionObserver rootMargin — works with touch scrolling). */}
          <div ref={loadMoreRef} aria-hidden="true" />
          <div className="px-4 py-3 text-center text-xs text-muted-foreground" role="status">
            {loadingMore ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more modules...</span>
            ) : loadError ? (
              <span className="text-destructive">Couldn't load more modules. Scroll to retry.</span>
            ) : !hasMore && visibleModules.length > 0 ? (
              'All modules / service areas loaded'
            ) : null}
          </div>
          </div>
        </div>
      )}

    </div>
  )
}

/** Module Detail page — used by both the module name and "View Module". */
export function moduleDetailHref(moduleId: number): string {
  return `/dashboard/modules/${moduleId}`
}

// ─── Memoized Module Table Row ────────────────────────────────────────
const ModuleTableRow = memo(function ModuleTableRow({
  mod,
  onDelete,
}: {
  mod: ModuleWithRelations
  onDelete: (id: number) => void
}) {
  const statusConfig = MODULE_STATUS_CONFIG[mod.status]
  const totalTickets = mod.ticketCount ?? 0

  return (
    <TableRow className="group hover:bg-muted/20 transition-colors">
      <TableCell>
        {/* Same destination as the "View Module" menu item. */}
        <Link href={moduleDetailHref(mod.id)} className="block group/cell">
          <p className="font-medium text-foreground text-sm group-hover/cell:text-primary transition-colors truncate max-w-[180px]">
            {mod.moduleName}
          </p>
        </Link>
      </TableCell>
      <TableCell>
        <Link href={`/dashboard/projects/${mod.projectId}`} className="flex items-center gap-1.5 text-sm text-foreground hover:text-primary transition-colors">
          <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate max-w-[120px]">{mod.projectName || `Project #${mod.projectId}`}</span>
        </Link>
      </TableCell>
      <TableCell>
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', statusConfig.color)}>
          {statusConfig.label}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <span className="text-sm font-medium text-foreground">{totalTickets}</span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
            <User className="h-3 w-3 text-emerald-500 dark:text-emerald-400" />
          </div>
          <span className="text-sm text-muted-foreground">—</span>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">
          {format(new Date(mod.createdAt), 'MMM d, yyyy')}
        </span>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              {/* View Module → dedicated module detail page (not the generic tickets list) */}
              <Link href={moduleDetailHref(mod.id)} className="cursor-pointer flex items-center">
                <Eye className="mr-2 h-4 w-4" />
                View Module / Service Area
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/modules/${mod.id}/edit`} className="cursor-pointer flex items-center">
                <Edit3 className="mr-2 h-4 w-4" />
                Edit Module / Service Area
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/tickets?moduleId=${mod.id}`} className="cursor-pointer flex items-center">
                <Ticket className="mr-2 h-4 w-4" />
                View Tickets
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(mod.id)}
              className="text-destructive cursor-pointer flex items-center"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Module / Service Area
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
})