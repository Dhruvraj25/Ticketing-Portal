'use client'

import { memo, useCallback, useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { startComponentRender, endComponentRender } from '@/lib/performance-profiler'
import { stripHtml } from '@/lib/format'
import { formatDistanceToNow } from 'date-fns'
import { 
  ArrowRight, 
  Clock, 
  FolderKanban, 
  Layers, 
  User, 
  AlertCircle, 
  Paperclip, 
  RefreshCw,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TicketStatus, TICKET_STATUS_CONFIG, TICKET_PRIORITY_CONFIG } from '@/lib/types'
import type { TicketWithRelations } from '@/lib/types'

interface TicketCardProps {
  ticket: TicketWithRelations
  showClient?: boolean
  showAssignee?: boolean
  index?: number
  isSelected?: boolean
  onSelect?: (id: number) => void
  developers?: { id: string; name: string; email: string; activeTickets: number }[]
  userRole?: string
  onAssignmentComplete?: () => void
}

const statusDot: Record<string, string> = {
  [TicketStatus.NEW]: 'bg-blue-500',
  [TicketStatus.MANAGER_REVIEW]: 'bg-indigo-500',
  [TicketStatus.ESTIMATE_PENDING]: 'bg-sky-500',
  [TicketStatus.ESTIMATE_APPROVED]: 'bg-emerald-500',
  [TicketStatus.ASSIGNED]: 'bg-indigo-500',
  [TicketStatus.IN_PROGRESS]: 'bg-amber-500',
  [TicketStatus.RESOLVED]: 'bg-green-500',
  [TicketStatus.CLIENT_REVIEW]: 'bg-sky-500',
  [TicketStatus.CLOSED]: 'bg-gray-400',
  [TicketStatus.REQUEST_FOR_REVISION]: 'bg-orange-500',
}

const statusBorderColor: Record<string, string> = {
  [TicketStatus.NEW]: '#3B82F6',
  [TicketStatus.MANAGER_REVIEW]: '#6366F1',
  [TicketStatus.ESTIMATE_PENDING]: '#0EA5E9',
  [TicketStatus.ESTIMATE_APPROVED]: '#10B981',
  [TicketStatus.ASSIGNED]: '#06B6D4',
  [TicketStatus.IN_PROGRESS]: '#F97316',
  [TicketStatus.RESOLVED]: '#22C55E',
  [TicketStatus.CLIENT_REVIEW]: '#EAB308',
  [TicketStatus.CLOSED]: '#6B7280',
  [TicketStatus.REQUEST_FOR_REVISION]: '#A855F7',
}

export const TicketCard = memo(function TicketCard({ 
  ticket, 
  showClient = false, 
  showAssignee = false, 
  index = 0,
  isSelected = false,
  onSelect,
  developers,
  userRole,
  onAssignmentComplete,
}: TicketCardProps) {
  const renderStart = startComponentRender('TicketCard')
  const statusConfig = TICKET_STATUS_CONFIG[ticket.status] ?? { label: ticket.status, color: 'bg-gray-50 dark:bg-slate-800/50 text-gray-500 border-gray-200 dark:border-slate-800' }
  const priorityConfig = TICKET_PRIORITY_CONFIG[ticket.priority] ?? { label: ticket.priority, color: 'bg-gray-50 dark:bg-slate-800/50 text-gray-500 border-gray-200 dark:border-slate-800' }
  
  useEffect(() => { endComponentRender('TicketCard', renderStart) }, [])
  const [assignDevId, setAssignDevId] = useState<string>('')
  const [assigning, setAssigning] = useState(false)
  const [assigned, setAssigned] = useState(false)

  const isManagerOrAdmin = userRole === 'project_manager' || userRole === 'admin'
  const showQuickAssign = developers && developers.length > 0 && isManagerOrAdmin && !assigned

  const handleAssign = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!assignDevId) return

    setAssigning(true)
    try {
      const { assignTicket } = await import('@/app/actions/tickets')
      await assignTicket(ticket.id, assignDevId)
      setAssigned(true)
      toast.success('Ticket assigned successfully')
      onAssignmentComplete?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign ticket'
      toast.error(message)
    } finally {
      setAssigning(false)
    }
  }

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (onSelect) {
      onSelect(ticket.id)
    }
  }, [ticket.id, onSelect])

  return (
    <div
      className={cn(
        'rounded-2xl border bg-white dark:bg-slate-900 min-h-[100px]',
        'border-slate-200/90 dark:border-slate-800',
        'hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.04)] transition-transform duration-200',
        isSelected ? 'border-primary/30 bg-primary/[0.03] shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_4px_12px_rgba(0,0,0,0.08)]' : ''
      )}
      style={{ borderLeft: statusBorderColor[ticket.status] ? `4px solid ${statusBorderColor[ticket.status]}` : undefined }}
    >
      <Link href={`/dashboard/tickets/${ticket.id}`} className="block" onClick={handleClick}>
        <div className={cn(
          'p-4 transition-all duration-200 group',
          !isSelected && 'hover:card-shadow-hover'
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Meta row */}
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground">
                  {ticket.ticketNumber}
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border',
                  statusConfig.color
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', statusDot[ticket.status] || 'bg-gray-400')} />
                  {statusConfig.label}
                </span>
                <span className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border',
                  priorityConfig.color
                )}>
                  {priorityConfig.label}
                </span>
              </div>

              {/* Title */}
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition-colors truncate text-sm">
                {ticket.title}
              </h3>

              {/* Description */}
              {ticket.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1 leading-relaxed">
                  {stripHtml(ticket.description)}
                </p>
              )}

              {/* Meta footer */}
              <div className="flex items-center gap-2.5 mt-2 text-xs text-muted-foreground flex-wrap">
                {ticket.projectName && (
                  <span className="flex items-center gap-1">
                    <FolderKanban className="h-3 w-3" />
                    {ticket.projectCode || ''}
                  </span>
                )}
                {showClient && ticket.clientName && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {ticket.clientName}
                  </span>
                )}
                {showAssignee && ticket.assignedToName && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3 text-green-600 dark:text-green-400" />
                    {ticket.assignedToName}
                  </span>
                )}
                {ticket.attachmentCount ? (
                  <span className="flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    {ticket.attachmentCount}
                  </span>
                ) : null}
                {ticket.revisionCount && ticket.revisionCount > 0 && (
                  <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                    <RefreshCw className="h-3 w-3" />
                    {ticket.revisionCount}
                  </span>
                )}
                {/* Completion badge — only for non-client users */}
                {ticket.status === 'closed' && userRole && userRole !== 'client' && ticket.closedAt && ticket.estimatedCompletionDate && (
                  <span className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border',
                    new Date(ticket.closedAt) <= new Date(ticket.estimatedCompletionDate)
                      ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
                      : 'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30'
                  )}>
                    {new Date(ticket.closedAt) <= new Date(ticket.estimatedCompletionDate) ? 'ON TIME' : 'LATE'}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>

            {/* Arrow indicator */}
            <div className="hidden sm:flex items-center justify-center h-7 w-7 rounded-lg bg-accent text-muted-foreground opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5">
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </Link>          {/* Quick assign section - only for manager/admin */}
      {showQuickAssign && (
        <div className="border-t border-border/50 px-4 py-2.5 flex items-center gap-2" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
          <Select value={assignDevId} onValueChange={setAssignDevId}>
            <SelectTrigger className="flex-1 h-8 text-xs rounded-lg bg-muted/30 border-border/60">
              <SelectValue placeholder="Assign to..." />
            </SelectTrigger>
            <SelectContent>
              {developers?.map((dev) => (
                <SelectItem key={dev.id} value={dev.id} className="text-xs">
                  <div className="flex items-center justify-between w-full gap-2">
                    <span>{dev.name}</span>
                    <span className="text-[11px] text-muted-foreground">({dev.activeTickets} active)</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleAssign}
            disabled={!assignDevId || assigning}
            className="h-8 rounded-lg text-xs px-3 shrink-0"
          >
            {assigning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : assigned ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
            ) : (
              'Assign Resource'
            )}
          </Button>
        </div>
      )}
    </div>
  )
})

interface TicketListProps {
  tickets: TicketWithRelations[]
  showClient?: boolean
  showAssignee?: boolean
  emptyMessage?: string
  selectedTicketId?: number | null
  onTicketSelect?: (id: number) => void
  developers?: { id: string; name: string; email: string; activeTickets: number }[]
  userRole?: string
  onAssignmentComplete?: () => void
}

export const TicketList = memo(function TicketList({ 
  tickets, 
  showClient, 
  showAssignee, 
  emptyMessage = 'No tickets found',
  selectedTicketId,
  onTicketSelect,
  developers,
  userRole,
  onAssignmentComplete,
}: TicketListProps) {
  const renderStart = startComponentRender('TicketList')
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endComponentRender('TicketList', renderStart) }, [])

  // Preserve scroll position on data refresh
  useEffect(() => {
    const list = listRef.current
    if (list) {
      const storedPosition = sessionStorage.getItem('ticket-list-scroll')
      if (storedPosition) {
        requestAnimationFrame(() => {
          list.scrollTop = parseInt(storedPosition, 10)
        })
        sessionStorage.removeItem('ticket-list-scroll')
      }
    }
  }, [])

  // Save scroll position before data refreshes
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const handleScroll = () => {
      sessionStorage.setItem('ticket-list-scroll', String(list.scrollTop))
    }
    list.addEventListener('scroll', handleScroll, { passive: true })
    return () => list.removeEventListener('scroll', handleScroll)
  }, [])

  if (tickets.length === 0) {
    return (
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-12 text-center animate-fade-in">
        <div className="flex flex-col items-center gap-2 font-mono text-xs">
          <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800">
            <AlertCircle className="h-6 w-6 text-slate-400 opacity-40" />
          </div>
          <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{emptyMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={listRef} className="space-y-2">
      {tickets.map((ticket, i) => (
        <TicketCard
          key={ticket.id}
          ticket={ticket}
          showClient={showClient}
          showAssignee={showAssignee}
          index={i}
          isSelected={selectedTicketId === ticket.id}
          onSelect={onTicketSelect}
          developers={developers}
          userRole={userRole}
          onAssignmentComplete={onAssignmentComplete}
        />
      ))}
      {tickets.length > 10 && (
        <div className="text-center py-3 text-xs text-muted-foreground">
          Showing {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
})

interface TicketGridProps {
  tickets: TicketWithRelations[]
  showClient?: boolean
  showAssignee?: boolean
  emptyMessage?: string
  selectedTicketId?: number | null
  onTicketSelect?: (id: number) => void
  developers?: { id: string; name: string; email: string; activeTickets: number }[]
  userRole?: string
  onAssignmentComplete?: () => void
}

export const TicketGrid = memo(function TicketGrid({ 
  tickets, 
  showClient, 
  showAssignee, 
  emptyMessage = 'No tickets found',
  selectedTicketId,
  onTicketSelect,
  developers,
  userRole,
  onAssignmentComplete,
}: TicketGridProps) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-12 text-center animate-fade-in">
        <div className="flex flex-col items-center gap-2 font-mono text-xs">
          <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800">
            <AlertCircle className="h-6 w-6 text-slate-400 opacity-40" />
          </div>
          <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{emptyMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {tickets.map((ticket, i) => (
        <TicketCard
          key={ticket.id}
          ticket={ticket}
          showClient={showClient}
          showAssignee={showAssignee}
          index={i}
          isSelected={selectedTicketId === ticket.id}
          onSelect={onTicketSelect}
          developers={developers}
          userRole={userRole}
          onAssignmentComplete={onAssignmentComplete}
        />
      ))}
    </div>
  )
})