'use client'

import { useState, useMemo, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { stripHtml } from '@/lib/format'
import { useDebounce } from '@/hooks/use-debounce'
import { getProjects } from '@/app/actions/projects'
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Table2,
  FolderKanban,
  SlidersHorizontal,
  X,
  ChevronDown,
  ArrowUpDown,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Layers,
  Ticket,
  Users,
  TrendingUp,
  BarChart3,
  Briefcase,
  Eye,
  Edit3,
  Archive,
  MoreHorizontal,
  User,
  Target,
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
import { PROJECT_STATUS_CONFIG } from '@/lib/types'
import { StatCard } from '@/components/dashboard/stat-card'
import { CurrentDate } from '@/components/dashboard/page-header'
import type { ProjectWithRelations, UserRole } from '@/lib/types'

interface ProjectsPageClientProps {
  user: { id: string; name: string; role: UserRole }
  projects: ProjectWithRelations[]
  isManagerOrAdmin: boolean
}

const ITEMS_PER_PAGE = 10

export function ProjectsPageClient({ user, projects, isManagerOrAdmin }: ProjectsPageClientProps) {
  const [viewMode, setViewMode] = useState<'table' | 'grid' | 'list'>('table')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedClient, setSelectedClient] = useState('all')
  const [selectedManager, setSelectedManager] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'tickets' | 'progress'>('created')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  // Server-side search state
  const [serverSearchProjects, setServerSearchProjects] = useState<ProjectWithRelations[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)

  const debouncedSearch = useDebounce(searchQuery, 350)

  // Debounced server-side search — only when user types
  useEffect(() => {
    if (!debouncedSearch) {
      setServerSearchProjects(null)
      setSearchLoading(false)
      return
    }

    let cancelled = false
    setSearchLoading(true)

    getProjects({ search: debouncedSearch, limit: 100 })
      .then((results) => {
        if (!cancelled) {
          setServerSearchProjects(results as unknown as ProjectWithRelations[])
          setSearchLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setSearchLoading(false)
      })

    return () => { cancelled = true }
  }, [debouncedSearch])

  // Use server results when searching, otherwise use the server-provisioned projects
  const effectiveProjects = serverSearchProjects ?? projects

  // Extract unique clients and managers from effective data
  const clientOptions = useMemo(() => {
    const clientSet = new Set<string>()
    const options: { name: string }[] = []
    effectiveProjects.forEach((p) => {
      if (p.clientName && !clientSet.has(p.clientName)) {
        clientSet.add(p.clientName)
        options.push({ name: p.clientName! })
      }
    })
    return options
  }, [effectiveProjects])

  const managerOptions = useMemo(() => {
    const managerSet = new Set<string>()
    const options: { name: string }[] = []
    effectiveProjects.forEach((p) => {
      if (p.managerName && !managerSet.has(p.managerName)) {
        managerSet.add(p.managerName)
        options.push({ name: p.managerName! })
      }
    })
    return options
  }, [effectiveProjects])

  // Stats from effective projects
  const stats = useMemo(() => {
    const active = effectiveProjects.filter((p) => p.status === 'active').length
    const onHold = effectiveProjects.filter((p) => p.status === 'on_hold').length
    const completed = effectiveProjects.filter((p) => p.status === 'completed').length
    const inactiveOrArchived = effectiveProjects.filter((p) => p.status === 'inactive' || p.status === 'archived').length
    return { active, onHold, completed, inactiveOrArchived }
  }, [effectiveProjects])

  // Filtered and sorted projects — client-side status/client/manager filters applied on server results
  const filteredProjects = useMemo(() => {
    let result = effectiveProjects.filter((p) => {
      // No client-side search filtering — handled server-side via debounced search
      if (selectedStatus !== 'all' && p.status !== selectedStatus) return false
      if (selectedClient !== 'all' && p.clientName !== selectedClient) return false
      if (selectedManager !== 'all' && p.managerName !== selectedManager) return false
      return true
    })

    result.sort((a, b) => {
      if (sortBy === 'name') return a.projectName.localeCompare(b.projectName)
      if (sortBy === 'tickets') return (b.ticketCount || 0) - (a.ticketCount || 0)
      if (sortBy === 'progress') return getProgressValue(b) - getProgressValue(a)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return result
  }, [effectiveProjects, selectedStatus, selectedClient, selectedManager, sortBy])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / ITEMS_PER_PAGE))
  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  )

  const hasFilters = searchQuery || selectedStatus !== 'all' || selectedClient !== 'all' || selectedManager !== 'all'

  // Pagination handlers (defined after totalPages)
  const goToPrevPage = useCallback(() => setCurrentPage((p) => Math.max(1, p - 1)), [])
  const goToNextPage = useCallback(() => setCurrentPage((p) => Math.min(totalPages, p + 1)), [totalPages])
  const goToPage = useCallback((p: number) => setCurrentPage(p), [])

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setSelectedStatus('all')
    setSelectedClient('all')
    setSelectedManager('all')
    setCurrentPage(1)
  }, [])

  // Memoized toggle handler for card expand
  const handleToggleExpand = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1)
  }, [filteredProjects.length, totalPages])

  return (
    <div className="space-y-6" data-tour="projects-list">
      {/* Header — single clean card */}
      <motion.div
        data-tour="projects-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm"
      >
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PageHeaderIcon variant="blue">
              <FolderKanban className="h-5 w-5" />
            </PageHeaderIcon>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Projects</h1>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                <span className="text-amber-500/80 dark:text-amber-400/80">✨</span>
                Manage and monitor all projects
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <CurrentDate />
            {isManagerOrAdmin && (
              <Button asChild className="rounded-xl font-mono font-bold text-xs h-9 shadow-sm">
                <Link href="/dashboard/projects/new">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Project
                </Link>
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <motion.div
        data-tour="projects-kpis"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        <StatCard
          title="Total Projects"
          value={projects.length}
          iconName="FolderKanban"
          delay={0}
        />
        <StatCard
          title="Active"
          value={stats.active}
          iconName="Briefcase"
          delay={1}
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          iconName="CheckCircle2"
          delay={2}
        />
        <StatCard
          title="Archived"
          value={stats.inactiveOrArchived}
          iconName="Archive"
          delay={3}
        />
      </motion.div>

      {/* Search & Filters Bar */}
      <motion.div
        data-tour="projects-search-filters"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm"
      >
        <div className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Search projects by name, code, or description..."
                className="pl-9 h-10 rounded-xl bg-muted/30 border-border/50 text-sm"
              />
            </div>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-[140px] h-10 rounded-xl bg-muted/20 border-border/50 text-sm">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created">Newest</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="tickets">Most Tickets</SelectItem>
                <SelectItem value="progress">Progress</SelectItem>
              </SelectContent>
            </Select>

            {/* View Toggle */}
            <div className="flex items-center rounded-lg border border-border/50 bg-muted/20 p-0.5">
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white dark:bg-slate-900 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                aria-label="Table view"
              >
                <Table2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-slate-900 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-slate-900 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            {/* Filter toggle */}
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
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}

            {/* Export */}
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              onClick={() => {
                const csv = [
                  ['Project Name', 'Code', 'Status', 'Client', 'Manager', 'Tickets', 'Modules', 'Progress'].join(','),
                  ...filteredProjects.map((p) =>
                    [
                      `"${p.projectName}"`,
                      p.projectCode,
                      p.status,
                      `"${p.clientName || ''}"`,
                      `"${p.managerName || ''}"`,
                      p.ticketCount || 0,
                      p.moduleCount || 0,
                      `${getProgressValue(p)}%`,
                    ].join(','),
                  ),
                ].join('\n')
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `projects-export-${format(new Date(), 'yyyy-MM-dd')}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>

          {/* Expanded Filters */}
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

                  <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setCurrentPage(1) }}>
                    <SelectTrigger className="w-[140px] h-9 rounded-xl bg-muted/20 border-border/50 text-sm">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {Object.entries(PROJECT_STATUS_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>{config.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedClient} onValueChange={(v) => { setSelectedClient(v); setCurrentPage(1) }}>
                    <SelectTrigger className="w-[160px] h-9 rounded-xl bg-muted/20 border-border/50 text-sm">
                      <SelectValue placeholder="Client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Clients</SelectItem>
                      {clientOptions.map((c) => (                          <SelectItem key={c.name} value={c.name} className="truncate">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedManager} onValueChange={(v) => { setSelectedManager(v); setCurrentPage(1) }}>
                    <SelectTrigger className="w-[160px] h-9 rounded-xl bg-muted/20 border-border/50 text-sm">
                      <SelectValue placeholder="Manager" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Managers</SelectItem>
                      {managerOptions.map((m) => (                          <SelectItem key={m.name} value={m.name} className="truncate">{m.name}</SelectItem>
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
          Showing <span className="font-medium text-foreground">{filteredProjects.length}</span>{' '}
          {filteredProjects.length === 1 ? 'project' : 'projects'}
          {hasFilters && ' (filtered)'}
        </p>
      </div>

      {/* Projects Listing */}
      {filteredProjects.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-white dark:bg-slate-900 border border-border p-12 text-center"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 rounded-2xl bg-muted/30">
              <FolderKanban className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <p className="font-semibold text-foreground text-lg">
              {hasFilters ? 'No projects match your filters' : 'No projects yet'}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? 'Try adjusting your search or filter criteria.'
                : isManagerOrAdmin
                  ? 'Create your first project to get started.'
                  : 'You will see your projects here when a manager assigns them to you.'}
            </p>
            {isManagerOrAdmin && !hasFilters && (
              <Link href="/dashboard/projects/new">
                <Button>
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Project
                </Button>
              </Link>
            )}
          </div>
        </motion.div>
      ) : viewMode === 'table' ? (
        /* ─── TABLE VIEW ────────────────────────────────────────────── */
        <div data-tour="projects-table" className="rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Key</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Manager</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Team Size</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Modules</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Tickets</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Progress</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Updated</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedProjects.map((project, i) => (
                <TableRow key={project.id} className="group hover:bg-muted/20 transition-colors">
                  <TableCell>
                    <Link href={`/dashboard/projects/${project.id}`} className="block group/cell">
                      <p className="font-medium text-foreground text-sm group-hover/cell:text-primary transition-colors truncate max-w-[180px]">
                        {project.projectName}
                      </p>
                      {project.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">{stripHtml(project.description)}</p>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                      {project.projectCode}
                    </code>
                  </TableCell>
                  <TableCell>
                    <ProjectStatusBadge status={project.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
                        <User className="h-3 w-3 text-indigo-500 dark:text-indigo-400" />
                      </div>
                      <span className="text-sm text-foreground truncate max-w-[120px]">
                        {project.managerName || '—'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-medium text-foreground">—</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-medium text-foreground">{project.moduleCount ?? 0}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-medium text-foreground">{project.ticketCount ?? 0}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${getProgressValue(project)}%` }}
                          transition={{ duration: 0.6, delay: i * 0.05 }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-foreground w-8 text-right">
                        {getProgressValue(project)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(project.updatedAt), 'MMM d, yyyy')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ProjectActions project={project} isManagerOrAdmin={isManagerOrAdmin} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginatedProjects.map((project, index) => (
            <ProjectCardGrid
              key={project.id}
              project={project}
              index={index}
              isExpanded={expandedId === project.id}
              onToggleExpand={() => handleToggleExpand(project.id)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedProjects.map((project, index) => (
            <ProjectCardList
              key={project.id}
              project={project}
              index={index}
              isExpanded={expandedId === project.id}
              onToggleExpand={() => handleToggleExpand(project.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div data-tour="projects-pagination" className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevPage}
              disabled={currentPage === 1}
              className="rounded-lg"
            >
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
                        currentPage === p
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      {p}
                    </button>
                  </span>
                )
              })}
            <Button
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className="rounded-lg"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Status Badge ──────────────────────────────────────────────────────
const ProjectStatusBadge = memo(function ProjectStatusBadge({ status }: { status: string }) {
  const config = PROJECT_STATUS_CONFIG[status as keyof typeof PROJECT_STATUS_CONFIG]
  if (!config) return null
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
      config.color
    )}>
      {config.label}
    </span>
  )
});

// ─── Actions Dropdown ──────────────────────────────────────────────────
const ProjectActions = memo(function ProjectActions({ project, isManagerOrAdmin }: { project: ProjectWithRelations; isManagerOrAdmin: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/projects/${project.id}`} className="cursor-pointer flex items-center">
            <Eye className="mr-2 h-4 w-4" />
            View Project
          </Link>
        </DropdownMenuItem>
        {isManagerOrAdmin && (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/projects/${project.id}/edit`} className="cursor-pointer flex items-center">
                <Edit3 className="mr-2 h-4 w-4" />
                Edit Project
              </Link>
            </DropdownMenuItem>                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/tickets?projectId=${project.id}`} className="cursor-pointer flex items-center">
                                <Ticket className="mr-2 h-4 w-4" />
                                View Tickets
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/projects/${project.id}`} className="cursor-pointer flex items-center">
                                <Layers className="mr-2 h-4 w-4" />
                                Manage Modules
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                try {
                  const { archiveProject } = await import('@/app/actions/projects')
                  await archiveProject(project.id)
                  window.location.reload()
                } catch {}
              }}
              className="text-amber-600 dark:text-amber-400 cursor-pointer flex items-center"
            >
              <Archive className="mr-2 h-4 w-4" />
              Archive Project
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
});

// ─── Grid Card ──────────────────────────────────────────────────────────
const ProjectCardGrid = memo(function ProjectCardGrid({
  project,
  index,
  isExpanded,
  onToggleExpand,
}: {
  project: ProjectWithRelations
  index: number
  isExpanded: boolean
  onToggleExpand: () => void
}) {
  const statusConfig = PROJECT_STATUS_CONFIG[project.status]
  const progress = getProgressValue(project)
  const ticketSummary = getTicketSummary(project)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
    >
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-border card-shadow hover:card-shadow-hover transition-all duration-200 overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-mono text-muted-foreground">{project.projectCode}</span>
                <ProjectStatusBadge status={project.status} />
              </div>
              <Link href={`/dashboard/projects/${project.id}`} className="block group">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                  {project.projectName}
                </h3>
              </Link>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{stripHtml(project.description)}</p>
              )}
            </div>

            {/* Progress Ring */}
            <div className="relative shrink-0 w-14 h-14">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#E5E7EB" strokeWidth="2.5" />
                <motion.circle
                  cx="18" cy="18" r="15.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={`${progress * 0.97} 100`}
                  className="text-primary"
                  initial={{ strokeDasharray: '0 100' }}
                  animate={{ strokeDasharray: `${progress * 0.97} 100` }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-foreground">{progress}%</span>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {project.moduleCount ?? 0} modules
            </span>
            <span className="flex items-center gap-1">
              <Ticket className="h-3 w-3" />
              {project.ticketCount ?? 0} tickets
            </span>
          </div>

          {/* People */}
          <div className="flex items-center gap-3 mt-2.5 text-xs text-muted-foreground">
            {project.clientName && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3 text-blue-400" />
                {project.clientName}
              </span>
            )}
            {project.managerName && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3 text-purple-400" />
                {project.managerName}
              </span>
            )}
          </div>

          {/* Ticket Summary Bar */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Open</span>
                  <span className="text-muted-foreground">{ticketSummary.open}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-amber-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${ticketSummary.openPct}%` }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Resolved</span>
                  <span className="text-green-500 dark:text-green-400">{ticketSummary.resolved}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-green-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${ticketSummary.resolvedPct}%` }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={onToggleExpand}
            className="flex items-center justify-center w-full mt-3 pt-2 border-t border-border/30 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? 'Show less' : 'Show details'}
            <ChevronDown className={cn('h-3 w-3 ml-1 transition-transform', isExpanded && 'rotate-180')} />
          </button>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-border/50"
            >
              <div className="p-5 space-y-4 bg-muted/20">
                {project.description && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</h4>
                    <p className="text-sm text-muted-foreground">{stripHtml(project.description)}</p>
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Activity</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                      <span>Project created — <span className="text-foreground font-medium">{format(new Date(project.createdAt), 'MMM d, yyyy')}</span></span>
                    </div>
                    {project.ticketCount! > 0 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                        <span>{project.ticketCount} tickets created</span>
                      </div>
                    )}
                    {project.moduleCount! > 0 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0" />
                        <span>{project.moduleCount} modules configured</span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Links</h4>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/dashboard/tickets?projectId=${project.id}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                      View All Tickets <ArrowRight className="h-3 w-3" />
                    </Link>
                    <Link href={`/dashboard/projects/${project.id}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Project Settings <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
});

// ─── List Card ──────────────────────────────────────────────────────────
const ProjectCardList = memo(function ProjectCardList({
  project,
  index,
  isExpanded,
  onToggleExpand,
}: {
  project: ProjectWithRelations
  index: number
  isExpanded: boolean
  onToggleExpand: () => void
}) {
  const statusConfig = PROJECT_STATUS_CONFIG[project.status]
  const progress = getProgressValue(project)
  const ticketSummary = getTicketSummary(project)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
    >
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-border card-shadow hover:card-shadow-hover transition-all duration-200 overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-4">
            {/* Progress Ring */}
            <div className="relative shrink-0 w-12 h-12">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#E5E7EB" strokeWidth="2" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${progress * 0.97} 100`} className="text-primary" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] font-bold text-foreground">{progress}%</span>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-mono text-muted-foreground">{project.projectCode}</span>
                <ProjectStatusBadge status={project.status} />
              </div>
              <Link href={`/dashboard/projects/${project.id}`}>
                <h3 className="font-medium text-foreground hover:text-primary transition-colors truncate">{project.projectName}</h3>
              </Link>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                <span>{project.moduleCount ?? 0} modules</span>
                <span>{project.ticketCount ?? 0} tickets</span>
                {project.clientName && <span>{project.clientName}</span>}
                {project.managerName && <span>{project.managerName}</span>}
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-3 text-xs">
              <div className="text-center">
                <p className="font-semibold text-amber-600 dark:text-amber-400">{ticketSummary.open}</p>
                <p className="text-muted-foreground">Open</p>
              </div>
              <div className="text-center">
                <p className="font-semibold text-green-600 dark:text-green-400">{ticketSummary.resolved}</p>
                <p className="text-muted-foreground">Done</p>
              </div>
            </div>

            <button onClick={onToggleExpand} className="shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors">
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-border/50">
              <div className="p-4 bg-muted/20 space-y-3">
                {project.description && <p className="text-sm text-muted-foreground">{stripHtml(project.description)}</p>}
                <div className="flex flex-wrap gap-2">
                  <Link href={`/dashboard/tickets?projectId=${project.id}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                    View All Tickets <ArrowRight className="h-3 w-3" />
                  </Link>
                  <Link href={`/dashboard/projects/${project.id}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    Project Settings <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
});

// ─── Helpers ────────────────────────────────────────────────────────────
function getProgressValue(project: ProjectWithRelations): number {
  if (project.status === 'completed' || project.status === 'archived') return 100
  const total = project.ticketCount || 0
  if (total === 0) return 0
  return Math.min(Math.round((total / Math.max(total + 5, 1)) * 100), 95)
}

function getTicketSummary(project: ProjectWithRelations): {
  open: number
  resolved: number
  openPct: number
  resolvedPct: number
} {
  const total = project.ticketCount || 0
  if (total === 0) return { open: 0, resolved: 0, openPct: 0, resolvedPct: 100 }
  const open = Math.round(total * 0.4)
  const resolved = total - open
  return {
    open,
    resolved,
    openPct: (open / total) * 100,
    resolvedPct: (resolved / total) * 100,
  }
}
