'use client'

import { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  Plus,
  Search,
  Calendar,
  ListChecks,
  Users,
  Ticket,
  Clock,
  User,
  FolderKanban,
  Layers,
  Loader2,
  CheckCircle2,
  Shuffle,
  CopyPlus,
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
import { StatCard } from '@/components/dashboard/stat-card'
import { toast } from 'sonner'
import { TICKET_PRIORITY_CONFIG, TICKET_CATEGORY_CONFIG, TICKET_STATUS_CONFIG } from '@/lib/types'
import { stripHtml } from '@/lib/format'
import type { TicketWithRelations, TicketStatus, TicketPriority } from '@/lib/types'

interface Developer {
  id: string
  name: string
  email: string
  activeTickets: number
}

interface AssignmentPanelProps {
  unassignedTickets: TicketWithRelations[]
  developers: Developer[]
}

export function AssignmentPanel({ unassignedTickets, developers }: AssignmentPanelProps) {
  const [selectedDeveloper, setSelectedDeveloper] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState<Record<number, boolean>>({})
  const [assigned, setAssigned] = useState<Set<number>>(new Set())
  const [error, setError] = useState<Record<number, string>>({})

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')

  const handleAssign = async (ticketId: number) => {
    const developerId = selectedDeveloper[ticketId]
    if (!developerId) return

    setLoading(prev => ({ ...prev, [ticketId]: true }))
    setError(prev => ({ ...prev, [ticketId]: '' }))

    try {
      const { assignTicket } = await import('@/app/actions/tickets')
      await assignTicket(ticketId, developerId)
      setAssigned(prev => new Set(prev).add(ticketId))
      toast.success('Ticket assigned successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign ticket'
      setError(prev => ({
        ...prev,
        [ticketId]: message,
      }))
      toast.error(message)
    } finally {
      setLoading(prev => ({ ...prev, [ticketId]: false }))
    }
  }

  // Project options from tickets
  const projectOptions = useMemo(() => {
    const seen = new Set<string>()
    return unassignedTickets
      .filter(t => t.projectId && t.projectName && !seen.has(t.projectName))
      .map(t => {
        seen.add(t.projectName!)
        return { id: t.projectId!, name: t.projectName!, code: t.projectCode }
      })
  }, [unassignedTickets])

  // Filter tickets
  const visibleTickets = useMemo(() => {
    let result = unassignedTickets.filter(t => !assigned.has(t.id))

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.ticketNumber.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.projectName || '').toLowerCase().includes(q)
      )
    }
    if (priorityFilter !== 'all') {
      result = result.filter(t => t.priority === priorityFilter)
    }
    if (projectFilter !== 'all') {
      result = result.filter(t => t.projectName === projectFilter)
    }

    return result
  }, [unassignedTickets, assigned, searchQuery, priorityFilter, projectFilter])

  // Summary stats
  const summary = useMemo(() => ({
    total: unassignedTickets.length,
    unassigned: visibleTickets.length,
    assigned: assigned.size,
    developers: developers.length,
  }), [unassignedTickets.length, visibleTickets.length, assigned.size, developers.length])

  // Max workload for percentage calculation
  const maxWorkload = useMemo(() => {
    if (developers.length === 0) return 1
    return Math.max(...developers.map(d => d.activeTickets), 1)
  }, [developers])

  const allAssigned = visibleTickets.length === 0 && unassignedTickets.length > 0
  const allCaughtUp = unassignedTickets.length === 0

  if (allCaughtUp) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-12 text-center card-shadow">
        <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">All caught up!</h3>
        <p className="text-muted-foreground">There are no unassigned tickets at the moment.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <motion.div
        data-tour="assignments-kpis"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        <StatCard title="Total Tickets" value={summary.total} iconName="Ticket" delay={0} />
        <StatCard title="Unassigned" value={summary.unassigned} iconName="AlertCircle" delay={1} />
        <StatCard title="Assigned" value={summary.assigned} iconName="CheckCircle2" delay={2} />
        <StatCard title="Developers" value={summary.developers} iconName="Users" delay={3} />
      </motion.div>

      {/* Filters */}
      <motion.div
        data-tour="assignments-filters"
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
          </div>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
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
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[160px] h-9 rounded-xl bg-muted/20 border-border/50 text-sm">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projectOptions.map((p) => (
                <SelectItem key={p.id} value={p.name!}>{p.code} — {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Main Layout: Tickets + Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Unassigned Tickets */}
        <div data-tour="assignments-tickets" className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Ticket className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Unassigned Tickets</h2>
            <Badge variant="outline" className="ml-auto text-xs">{visibleTickets.length} remaining</Badge>
          </div>

          {allAssigned ? (
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-10 text-center card-shadow">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
              <h3 className="font-semibold text-foreground">All tickets assigned!</h3>
              <p className="text-sm text-muted-foreground mt-1">You&apos;ve assigned all tickets.</p>
            </div>
          ) : visibleTickets.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-10 text-center card-shadow">
              <p className="text-muted-foreground">No tickets match your filters.</p>
            </div>
          ) : (
            visibleTickets.map((ticket) => {
              const priorityConfig = TICKET_PRIORITY_CONFIG[ticket.priority as keyof typeof TICKET_PRIORITY_CONFIG]
              const categoryConfig = TICKET_CATEGORY_CONFIG[ticket.category as keyof typeof TICKET_CATEGORY_CONFIG]

              return (
                <motion.div
                  key={ticket.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 card-shadow hover:card-shadow-hover transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Badges Row */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">{ticket.ticketNumber}</span>
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', priorityConfig.color)}>
                          {priorityConfig.label}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-muted/30 text-muted-foreground border-border/50">
                          {categoryConfig.label}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="font-semibold text-foreground">{ticket.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{stripHtml(ticket.description)}</p>

                      {/* Meta */}
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                        {ticket.projectName && (
                          <span className="flex items-center gap-1">
                            <FolderKanban className="h-3 w-3" />
                            {ticket.projectCode} — {ticket.projectName}
                          </span>
                        )}
                        {ticket.moduleName && (
                          <span className="flex items-center gap-1">
                            <Layers className="h-3 w-3" />
                            {ticket.moduleName}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {ticket.clientName || 'Unknown'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Assignment Controls */}
                  <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/50">
                    <Select
                      value={selectedDeveloper[ticket.id] || ''}
                      onValueChange={(v) => setSelectedDeveloper(prev => ({ ...prev, [ticket.id]: v }))}
                    >
                      <SelectTrigger className="flex-1 bg-input/50 h-9 rounded-xl">
                        <SelectValue placeholder="Select developer..." />
                      </SelectTrigger>
                      <SelectContent>
                        {developers.map((dev) => (
                          <SelectItem key={dev.id} value={dev.id}>
                            <div className="flex items-center justify-between w-full gap-3">
                              <span>{dev.name}</span>
                              <span className="text-xs text-muted-foreground">({dev.activeTickets} active)</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      onClick={() => handleAssign(ticket.id)}
                      disabled={!selectedDeveloper[ticket.id] || loading[ticket.id]}
                      className="bg-primary text-primary-foreground shadow-sm rounded-xl shrink-0"
                    >
                      {loading[ticket.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Assign Resource'
                      )}
                    </Button>
                  </div>

                  {error[ticket.id] && (
                    <p className="text-sm text-destructive mt-2">{error[ticket.id]}</p>
                  )}
                </motion.div>
              )
            })
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Developer Workload Panel */}
          <div data-tour="assignments-developers" className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Developer Workload</h2>
            </div>

          {developers.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-6 text-center card-shadow">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No developers available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {developers
                .sort((a, b) => b.activeTickets - a.activeTickets)
                .map((dev, i) => {
                  const workloadPct = Math.round((dev.activeTickets / maxWorkload) * 100)
                  return (
                    <motion.div
                      key={dev.id}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-xl bg-white dark:bg-slate-900 border border-border p-4 card-shadow hover:card-shadow-hover transition-all duration-200"
                    >
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-white">
                            {dev.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">{dev.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{dev.email}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-foreground">{dev.activeTickets}</p>
                          <p className="text-[11px] text-muted-foreground uppercase">Active</p>
                        </div>
                      </div>

                      {/* Workload Progress Bar */}
                      <div className="mt-3 pt-3 border-t border-border/30">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-muted-foreground">Workload</span>
                          <span className="font-semibold text-foreground">{workloadPct}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${workloadPct}%` }}
                            transition={{ duration: 0.6, delay: i * 0.08 }}
                            className={cn(
                              'h-full rounded-full transition-colors',
                              workloadPct > 80 ? 'bg-red-500' : workloadPct > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                            )}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
            </div>
          )}
        </div>

        {/* Assignment Summary */}
        <motion.div
          data-tour="assignments-summary"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="relative rounded-2xl bg-white dark:bg-slate-900 border border-border/60 p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all duration-200"
        >
          <div className="absolute top-0 left-4 right-4 h-0.5 rounded-full bg-slate-200" />
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-accent">
              <ListChecks className="h-4 w-4 text-foreground/70" />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assignment Summary</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Tickets</span>
              <span className="text-lg font-bold text-foreground">{summary.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Unassigned</span>
              <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{summary.unassigned}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Assigned</span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{summary.assigned}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Developers</span>
              <span className="text-lg font-bold text-foreground">{summary.developers}</span>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative rounded-2xl bg-white dark:bg-slate-900 border border-border/60 p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all duration-200"
        >
          <div className="absolute top-0 left-4 right-4 h-0.5 rounded-full bg-slate-200" />
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-accent">
              <Shuffle className="h-4 w-4 text-foreground/70" />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Actions</p>
          </div>
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl gap-2 justify-start font-medium"
              onClick={async () => {
                const devs = [...developers].sort((a, b) => a.activeTickets - b.activeTickets)
                for (const ticket of visibleTickets.slice(0, 10)) {
                  if (devs.length > 0) {
                    const dev = devs[0]
                    setSelectedDeveloper(prev => ({ ...prev, [ticket.id]: dev.id }))
                    await handleAssign(ticket.id)
                    devs.sort((a, b) => a.activeTickets - b.activeTickets)
                  }
                }
              }}
              disabled={visibleTickets.length === 0}
            >
              <Shuffle className="h-5 w-5 text-primary" />
              Auto Assign Tickets
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl gap-2 justify-start font-medium"
              disabled={true}
            >
              <CopyPlus className="h-5 w-5 text-primary" />
              Bulk Assign Tickets
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
    </div>
  )
}
