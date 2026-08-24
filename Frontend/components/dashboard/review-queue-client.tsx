'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { format, formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { stripHtml } from '@/lib/format'
import {
  Search,
  CheckSquare,
  Clock,
  AlertCircle,
  TrendingUp,
  User,
  FolderKanban,
  Layers,
  Download,
  FileText,
  FileSpreadsheet,
  FileDown,
  SlidersHorizontal,
  X,
  CheckCircle2,
  XCircle,
  RefreshCw,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatCard } from '@/components/dashboard/stat-card'
import { CurrentDate } from '@/components/dashboard/page-header'
import { ManagerReviewActions } from '@/components/dashboard/manager-review-actions'
import { TICKET_STATUS_CONFIG, TICKET_PRIORITY_CONFIG } from '@/lib/types'
import type { TicketWithRelations } from '@/lib/types'

function exportAs(exportFormat: 'csv' | 'excel', tickets: TicketWithRelations[]) {
  const now = format(new Date(), 'yyyy-MM-dd')

  if (exportFormat === 'csv') {
    const csv = [
      ['Ticket ID', 'Title', 'Status', 'Priority', 'Project', 'Client', 'Developer', 'Resolved Date'].join(','),
      ...tickets.map((t) =>
        [
          t.ticketNumber,
          `"${t.title.replace(/"/g, '""')}"`,
          t.status,
          t.priority,
          `"${t.projectName || ''}"`,
          `"${t.clientName || ''}"`,
          `"${t.assignedToName || ''}"`,
          t.resolvedAt ? format(new Date(t.resolvedAt), 'yyyy-MM-dd') : '',
        ].join(','),
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `review-queue-${now}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
}

interface Developer {
  id: string
  name: string
  email: string
  activeTickets: number
}

interface ReviewQueueClientProps {
  resolvedTickets: TicketWithRelations[]
  developers: Developer[]
}

export function ReviewQueueClient({ resolvedTickets, developers }: ReviewQueueClientProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [developerFilter, setDeveloperFilter] = useState('all')

  // Stats
  const stats = useMemo(() => {
    const pending = resolvedTickets.length
    const dueToday = resolvedTickets.filter(t => {
      if (!t.resolvedAt) return false
      const today = new Date()
      const resolved = new Date(t.resolvedAt)
      return resolved.toDateString() === today.toDateString()
    }).length
    const overdue = 0 // No specific due date field
    const reviewedToday = 0
    return { pending, dueToday, overdue, reviewedToday }
  }, [resolvedTickets])

  // Developer options for filter
  const developerOptions = useMemo(() => {
    const seen = new Set<string>()
    const options: { id: string; name: string }[] = []
    for (const t of resolvedTickets) {
      if (t.assignedToName && !seen.has(t.assignedToName)) {
        seen.add(t.assignedToName)
        options.push({ id: t.assignedToId || t.assignedToName, name: t.assignedToName })
      }
    }
    return options
  }, [resolvedTickets])

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    let result = resolvedTickets
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.ticketNumber.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.projectName || '').toLowerCase().includes(q) ||
        (t.clientName || '').toLowerCase().includes(q) ||
        (t.assignedToName || '').toLowerCase().includes(q)
      )
    }
    if (priorityFilter !== 'all') {
      result = result.filter(t => t.priority === priorityFilter)
    }
    if (developerFilter !== 'all') {
      result = result.filter(t => t.assignedToId === developerFilter || t.assignedToName === developerFilter)
    }
    return result
  }, [resolvedTickets, searchQuery, priorityFilter, developerFilter])

  const hasFilters = searchQuery || priorityFilter !== 'all' || developerFilter !== 'all'

  const clearFilters = () => {
    setSearchQuery('')
    setPriorityFilter('all')
    setDeveloperFilter('all')
  }

  return (
    <div className="space-y-6" data-tour="review-queue">
      {/* Header — single clean card */}
      <motion.div
        data-tour="estimate-approval"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden"
      >
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PageHeaderIcon variant="emerald">
              <CheckSquare className="h-5 w-5" />
            </PageHeaderIcon>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Review Queue</h1>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                <span className="text-amber-500/80 dark:text-amber-400/80">✨</span>
                Tickets resolved by developers awaiting review
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <CurrentDate />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="rounded-xl gap-2">
                    <Download className="h-4 w-4" />
                    Export Report
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => exportAs('csv', filteredTickets)} className="cursor-pointer">
                    <FileDown className="mr-2 h-4 w-4" />
                    CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportAs('excel', filteredTickets)} className="cursor-pointer">
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.print()} className="cursor-pointer">
                    <FileText className="mr-2 h-4 w-4" />
                    PDF (Print)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </motion.div>

      {/* KPI Cards */}
      <motion.div
        data-tour="review-queue-kpis"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        <StatCard title="Pending Requests" value={stats.pending} iconName="Clock" delay={0} />
        <StatCard title="Total Requests" value={resolvedTickets.length} iconName="RefreshCw" delay={1} />
        <StatCard title="Approved Requests" value={stats.reviewedToday} iconName="CheckCircle2" delay={2} />
        <StatCard title="Rejected Requests" value={stats.overdue} iconName="XCircle" delay={3} />
      </motion.div>

      {/* Search & Filters */}
      <motion.div
        data-tour="review-queue-filters"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm p-4"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tickets..."
              className="pl-9 h-9 rounded-xl bg-muted/30 border-border/50 text-sm"
            />
          </div>            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[130px] h-9 rounded-xl bg-muted/20 border-border/50 text-sm">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {Object.entries(TICKET_PRIORITY_CONFIG).map(([key, c]) => (
                  <SelectItem key={key} value={key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={developerFilter} onValueChange={setDeveloperFilter}>
            <SelectTrigger className="w-[160px] h-9 rounded-xl bg-muted/20 border-border/50 text-sm">
              <SelectValue placeholder="Developer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Developers</SelectItem>
              {developerOptions.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            onClick={clearFilters}
            className={`flex items-center gap-1 px-3 py-2 rounded-xl text-sm transition-colors ${
              hasFilters
                ? 'text-primary bg-primary/5 border border-primary/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {hasFilters && (
              <>
                <span className="h-2 w-2 rounded-full bg-primary ml-1" />
                <X className="h-3 w-3 ml-1" onClick={(e) => { e.stopPropagation(); clearFilters() }} />
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{filteredTickets.length}</span>{' '}
          {filteredTickets.length === 1 ? 'ticket' : 'tickets'}
          {hasFilters && ' (filtered)'}
        </p>
      </div>

      {/* Review Tickets */}
      {filteredTickets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-white dark:bg-slate-900 border border-border p-12 text-center"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 rounded-2xl bg-muted/30">
              <CheckSquare className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <p className="font-semibold text-foreground text-lg">
              {hasFilters ? 'No tickets match your filters' : 'All caught up!'}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? 'Try adjusting your search or filter criteria.'
                : 'No tickets are currently waiting for your review.'}
            </p>
          </div>
        </motion.div>
      ) : (
        <div data-tour="review-queue-list" className="space-y-4">
          {filteredTickets.map((ticket, index) => {
            const statusConfig = TICKET_STATUS_CONFIG[ticket.status] ?? { label: ticket.status, color: 'bg-gray-50 dark:bg-slate-800/50 text-gray-500 border-gray-200 dark:border-slate-800' }
            const priorityConfig = TICKET_PRIORITY_CONFIG[ticket.priority] ?? { label: ticket.priority, color: 'bg-gray-50 dark:bg-slate-800/50 text-gray-500 border-gray-200 dark:border-slate-800' }

            return (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 card-shadow hover:card-shadow-hover transition-all duration-200"
              >
                {/* Top Row: Ticket Info */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Badges */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground">{ticket.ticketNumber}</span>
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border', statusConfig.color)}>
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {statusConfig.label}
                      </span>
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium border', priorityConfig.color)}>
                        {priorityConfig.label}
                      </span>
                    </div>

                    {/* Title */}
                    <Link
                      href={`/dashboard/tickets/${ticket.id}`}
                      className="text-lg font-semibold text-foreground hover:text-primary transition-colors"
                    >
                      {ticket.title}
                    </Link>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{stripHtml(ticket.description)}</p>
                  </div>
                </div>

                {/* Meta Row */}
                <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap mt-3">
                  {ticket.projectName && (
                    <div className="flex items-center gap-1.5">
                      <FolderKanban className="h-3.5 w-3.5" />
                      <span>{ticket.projectCode} — {ticket.projectName}</span>
                    </div>
                  )}
                  {ticket.clientName && (
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      {ticket.clientName}
                    </div>
                  )}
                  {ticket.assignedToName && (
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">{ticket.assignedToName}</span>
                    </div>
                  )}
                  {ticket.resolvedAt && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Resolved {formatDistanceToNow(new Date(ticket.resolvedAt), { addSuffix: true })}
                    </div>
                  )}
                </div>

                {/* Developer Section */}
                {ticket.assignedToName && (
                  <div className="flex items-center gap-3 mt-4 p-3 rounded-lg bg-muted/20 border border-border/30">
                    <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-white">
                        {ticket.assignedToName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{ticket.assignedToName}</p>
                      <p className="text-xs text-muted-foreground">Assigned Developer</p>
                    </div>
                  </div>
                )}

                {/* Review Actions */}
                <div className="mt-4">
                  <ManagerReviewActions ticketId={ticket.id} developers={developers} />
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
