'use client'

import { useState, useMemo, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { stripHtml } from '@/lib/format'
import { useDebounce } from '@/hooks/use-debounce'
import { getModules, deleteModule } from '@/app/actions/modules'
import {
  Plus,
  Search,
  Layers,
  SlidersHorizontal,
  X,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
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
  Table,
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
import type { ModuleTicketStats } from '@/app/actions/modules'

interface ModulesPageClientProps {
  user: { id: string; name: string; role: UserRole }
  projects: { id: number; projectName: string; projectCode: string }[]
  modules: ModuleWithRelations[]
  statsMap: Record<string, ModuleTicketStats>
}

const ITEMS_PER_PAGE = 10

export function ModulesPageClient({ user, projects, modules, statsMap }: ModulesPageClientProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProject, setSelectedProject] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'tickets'>('created')
  // Server-side search state
  const [serverSearchModules, setServerSearchModules] = useState<ModuleWithRelations[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  // Local modules state for optimistic CRUD updates (avoids router.refresh())
  const [localModules, setLocalModules] = useState<ModuleWithRelations[] | null>(null)

  const debouncedSearch = useDebounce(searchQuery, 350)

  // Debounced server-side search
  useEffect(() => {
    if (!debouncedSearch) {
      setServerSearchModules(null)
      setSearchLoading(false)
      return
    }

    let cancelled = false
    setSearchLoading(true)

    getModules({ search: debouncedSearch, limit: 100 })
      .then((results) => {
        if (!cancelled) {
          setServerSearchModules(results as unknown as ModuleWithRelations[])
          setSearchLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setSearchLoading(false)
      })

    return () => { cancelled = true }
  }, [debouncedSearch])

  // Use server results when searching, otherwise the initial/local modules
  const baseModules = localModules ?? modules
  const effectiveModules = serverSearchModules ?? baseModules

  // Stats
  const stats = useMemo(() => {
    const total = effectiveModules.length
    const active = effectiveModules.filter((m) => m.status === 'active').length
    const completed = effectiveModules.filter((m) => m.status === 'completed').length
    const archived = effectiveModules.filter((m) => m.status === 'archived').length
    return { total, active, completed, archived }
  }, [effectiveModules])

  // Project options for filter
  const projectOptions = useMemo(() => {
    const seen = new Set<number>()
    return effectiveModules
      .filter((m) => {
        if (seen.has(m.projectId)) return false
        seen.add(m.projectId)
        return true
      })
      .map((m) => ({
        id: m.projectId,
        name: m.projectName || `Project #${m.projectId}`,
        code: m.projectCode,
      }))
  }, [effectiveModules])

  // Filtered modules — server-side search already applied, just status/project filters client-side
  const filteredModules = useMemo(() => {
    let result = effectiveModules.filter((m) => {
      if (selectedProject !== 'all' && m.projectId !== Number(selectedProject)) return false
      if (selectedStatus !== 'all' && m.status !== selectedStatus) return false
      return true
    })

    result.sort((a, b) => {
      if (sortBy === 'name') return a.moduleName.localeCompare(b.moduleName)
      if (sortBy === 'tickets') return (b.ticketCount || 0) - (a.ticketCount || 0)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return result
  }, [effectiveModules, selectedProject, selectedStatus, sortBy])

  const totalPages = Math.max(1, Math.ceil(filteredModules.length / ITEMS_PER_PAGE))
  const paginatedModules = filteredModules.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  )

  const hasFilters = searchQuery || selectedProject !== 'all' || selectedStatus !== 'all'

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1)
  }, [filteredModules.length, totalPages])

  const handleDeleteModule = useCallback(async (moduleId: number) => {
    if (!confirm('Are you sure you want to delete this module? Tickets linked to it will have their module reference removed.')) return
    try {
      await deleteModule(moduleId)
      // Optimistic local state update — no router.refresh() needed
      setLocalModules((prev) => {
        const current = prev ?? modules
        return current.filter((m) => m.id !== moduleId)
      })
    } catch {}
  }, [modules])

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setSelectedProject('all')
    setSelectedStatus('all')
    setCurrentPage(1)
  }, [])

  const goToPrevPage = useCallback(() => setCurrentPage((p) => Math.max(1, p - 1)), [])
  const goToNextPage = useCallback(() => setCurrentPage((p) => Math.min(totalPages, p + 1)), [totalPages])
  const goToPage = useCallback((p: number) => setCurrentPage(p), [])

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
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Modules</h1>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                <span className="text-amber-500/80 dark:text-amber-400/80">✨</span>
                Manage and organize project modules
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <CurrentDate />
            <Button asChild className="rounded-xl font-mono font-bold text-xs h-9 shadow-sm">
              <Link href="/dashboard/modules/create">
                <Plus className="mr-1.5 h-4 w-4" />
                New Module
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
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        <StatCard title="Total Modules" value={stats.total} iconName="Layers" delay={0} />
        <StatCard title="Active Modules" value={stats.active} iconName="Briefcase" delay={1} />
        <StatCard title="Completed" value={stats.completed} iconName="CheckCircle2" delay={2} />
        <StatCard title="Archived" value={stats.archived} iconName="Layers" delay={3} />
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
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                placeholder="Search modules by name, description, or project..."
                className="pl-9 h-10 rounded-xl bg-muted/30 border-border/50 text-sm"
              />
            </div>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
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

                  <Select value={selectedProject} onValueChange={(v) => { setSelectedProject(v); setCurrentPage(1) }}>
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

                  <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setCurrentPage(1) }}>
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
          Showing <span className="font-medium text-foreground">{filteredModules.length}</span>{' '}
          {filteredModules.length === 1 ? 'module' : 'modules'}
          {hasFilters && ' (filtered)'}
        </p>
      </div>

      {/* Modules Table */}
      {filteredModules.length === 0 ? (
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
              {hasFilters ? 'No modules match your filters' : 'No modules yet'}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? 'Try adjusting your search or filter criteria.'
                : 'Create your first module to organize tickets within a project.'}
            </p>
            {!hasFilters && (
              <Link href="/dashboard/modules/create">
                <Button>
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Module
                </Button>
              </Link>
            )}
          </div>
        </motion.div>
      ) : (
        <div data-tour="modules-table" className="rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Module Name</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Tickets</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assigned To</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedModules.map((mod, i) => (
                <ModuleTableRow
                  key={mod.id}
                  mod={mod}
                  statsMap={statsMap}
                  onDelete={handleDeleteModule}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div data-tour="modules-pagination" className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToPrevPage} disabled={currentPage === 1} className="rounded-lg">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, idx, arr) => {
                const showEllipsis = idx > 0 && p - arr[idx - 1] > 1
                return (
                  <span key={p} className="flex items-center">
                    {showEllipsis && <span className="px-1 text-muted-foreground">...</span>}
                    <button
                      onClick={() => goToPage(p)}
                      className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      {p}
                    </button>
                  </span>
                )
              })}
            <Button variant="outline" size="sm" onClick={goToNextPage} disabled={currentPage === totalPages} className="rounded-lg">
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Memoized Module Table Row ────────────────────────────────────────
const ModuleTableRow = memo(function ModuleTableRow({
  mod,
  statsMap,
  onDelete,
}: {
  mod: ModuleWithRelations
  statsMap: Record<string, ModuleTicketStats>
  onDelete: (id: number) => void
}) {
  const statusConfig = MODULE_STATUS_CONFIG[mod.status]
  const stats = statsMap[mod.id]
  const totalTickets = stats?.total ?? 0

  return (
    <TableRow className="group hover:bg-muted/20 transition-colors">
      <TableCell>
        <Link href={`/dashboard/tickets?moduleId=${mod.id}`} className="block group/cell">
          <p className="font-medium text-foreground text-sm group-hover/cell:text-primary transition-colors truncate max-w-[180px]">
            {mod.moduleName}
          </p>
        </Link>
      </TableCell>
      <TableCell>
        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
          {stripHtml(mod.description) || '—'}
        </p>
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
              <Link href={`/dashboard/modules/${mod.id}`} className="cursor-pointer flex items-center">
                <Eye className="mr-2 h-4 w-4" />
                View Module
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/modules/${mod.id}/edit`} className="cursor-pointer flex items-center">
                <Edit3 className="mr-2 h-4 w-4" />
                Edit Module
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
              Delete Module
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
})