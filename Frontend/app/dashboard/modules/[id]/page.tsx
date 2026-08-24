import { notFound, redirect } from 'next/navigation'
import { PageTimer } from '@/lib/performance-profiler'
import { getCurrentUser, getTicketsList } from '@/app/actions/tickets'
import { getModuleById } from '@/app/actions/modules'
import { MODULE_STATUS_CONFIG, TICKET_STATUS_CONFIG, TICKET_PRIORITY_CONFIG } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { stripHtml } from '@/lib/format'
import { format } from 'date-fns'
import {
  ArrowLeft,
  Layers,
  FolderKanban,
  Calendar,
  Ticket as TicketIcon,
  Edit,
  User,
  Hash,
  Clock,
  Plus,
} from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

// ─── Status badge helper (same visual treatment as the modules list) ───────
function statusBadge(config: { label: string; color: string }, fallbackColor: string) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', config.color || fallbackColor)}>
      {config.label}
    </span>
  )
}

const FALLBACK_BADGE = 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-800'

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const moduleId = parseInt(id)
  const pageTimer = new PageTimer('Module Detail Page')

  if (isNaN(moduleId)) notFound()

  pageTimer.mark('Auth')
  const user = await getCurrentUser()

  // Modules are an internal admin / project-manager feature — same gate as the
  // modules list. getModuleById additionally enforces role-based access on the
  // backend, so manual URL navigation cannot expose module data.
  if (user.role !== 'project_manager' && user.role !== 'admin') {
    redirect('/dashboard')
  }

  // A missing module or an unauthorized access attempt both land here.
  let mod: Awaited<ReturnType<typeof getModuleById>>
  try {
    mod = await getModuleById(moduleId)
  } catch {
    notFound()
  }

  // Module-only tickets — getTicketsList already applies role-based filtering.
  const { tickets, total } = await getTicketsList({ moduleId, limit: 50, page: 1 })

  const moduleStatus = MODULE_STATUS_CONFIG[mod.status] ?? {
    label: mod.status,
    color: FALLBACK_BADGE,
  }

  pageTimer.mark('Render')
  pageTimer.finish()

  const detailRows = [
    {
      icon: <FolderKanban className="h-3.5 w-3.5" />,
      label: 'Project',
      value: mod.projectName ? (
        <Link
          href={`/dashboard/projects/${mod.projectId}`}
          className="font-medium text-foreground hover:text-primary transition-colors truncate"
        >
          {mod.projectName}
        </Link>
      ) : (
        <span className="font-medium text-foreground">Project #{mod.projectId}</span>
      ),
    },
    {
      icon: <Hash className="h-3.5 w-3.5" />,
      label: 'Module ID',
      value: <span className="font-medium text-foreground">#{mod.id}</span>,
    },
    {
      icon: <Layers className="h-3.5 w-3.5" />,
      label: 'Status',
      value: statusBadge(moduleStatus, FALLBACK_BADGE),
    },
    {
      icon: <TicketIcon className="h-3.5 w-3.5" />,
      label: 'Tickets',
      value: (
        <Link
          href={`/dashboard/tickets?moduleId=${mod.id}`}
          className="font-medium text-foreground hover:text-primary transition-colors"
        >
          {mod.ticketCount}
        </Link>
      ),
    },
    {
      icon: <Calendar className="h-3.5 w-3.5" />,
      label: 'Created',
      value: <span className="font-medium text-foreground">{format(new Date(mod.createdAt), 'MMM d, yyyy')}</span>,
    },
    {
      icon: <Clock className="h-3.5 w-3.5" />,
      label: 'Updated',
      value: <span className="font-medium text-foreground">{format(new Date(mod.updatedAt), 'MMM d, yyyy')}</span>,
    },
  ]

  return (
    <div className="space-y-5">
      {/* ── Header: back, identity, status, actions ───────────────────── */}
      <div
        data-tour="module-detail-header"
        className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6"
      >
        <div className="flex items-start gap-4">
          <Link href="/dashboard/modules">
            <Button variant="ghost" size="icon" className="rounded-xl mt-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <PageHeaderIcon variant="indigo">
            <Layers className="h-5 w-5" />
          </PageHeaderIcon>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-sm font-mono text-muted-foreground">Module #{mod.id}</span>
              {statusBadge(moduleStatus, FALLBACK_BADGE)}
            </div>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground truncate">{mod.moduleName}</h1>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/dashboard/tickets?moduleId=${mod.id}`}>
                  <Button variant="outline" size="sm" className="rounded-xl">
                    <TicketIcon className="mr-2 h-4 w-4" />
                    View Tickets
                  </Button>
                </Link>
                <Link href={`/dashboard/modules/${mod.id}/edit`}>
                  <Button variant="outline" size="sm" className="rounded-xl">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Module
                  </Button>
                </Link>
              </div>
            </div>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5">
              <FolderKanban className="h-3.5 w-3.5" />
              {mod.projectName
                ? (
                  <Link
                    href={`/dashboard/projects/${mod.projectId}`}
                    className="hover:text-primary transition-colors"
                  >
                    Project: {mod.projectName}
                  </Link>
                )
                : `Project: #${mod.projectId}`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Module Information ─────────────────────────────────────────── */}
      <div
        data-tour="module-detail-info"
        className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6"
      >
        <div className="flex items-center gap-2 mb-5">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Module Information</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
          {detailRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-muted-foreground flex items-center gap-1.5 text-sm shrink-0">
                {row.icon}
                {row.label}
              </span>
              <span className="min-w-0 truncate text-right">{row.value}</span>
            </div>
          ))}
        </div>

        {mod.description && (
          <div className="mt-5 pt-5 border-t border-border/60">
            <h3 className="text-sm font-semibold text-foreground mb-2">Description</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{stripHtml(mod.description)}</p>
          </div>
        )}
      </div>

      {/* ── Tickets (module-scoped) ────────────────────────────────────── */}
      <div
        data-tour="module-detail-tickets"
        className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm"
      >
        <div className="p-6 pb-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <TicketIcon className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Tickets</h2>
            <Badge variant="outline" className="ml-1 rounded-lg text-xs font-mono">
              Total: {total}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {total > 50 && (
              <Link href={`/dashboard/tickets?moduleId=${mod.id}`}>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1 rounded-xl">
                  View all {total}
                </Button>
              </Link>
            )}
            <Link href={`/dashboard/tickets/new?projectId=${mod.projectId}&moduleId=${mod.id}`}>
              <Button size="sm" className="rounded-xl">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Ticket
              </Button>
            </Link>
          </div>
        </div>

        {tickets.length === 0 ? (
          <div className="px-6 pb-10 pt-2 text-center">
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="p-4 rounded-2xl bg-muted/30">
                <TicketIcon className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="font-semibold text-foreground">No tickets for this module yet</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Tickets created for this module will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto px-2 pb-2">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ticket</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assigned</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => {
                  const tStatus = TICKET_STATUS_CONFIG[t.status] ?? { label: t.status, color: FALLBACK_BADGE }
                  const tPriority = TICKET_PRIORITY_CONFIG[t.priority] ?? { label: t.priority, color: FALLBACK_BADGE }
                  return (
                    <TableRow key={t.id} className="group hover:bg-muted/20 transition-colors">
                      <TableCell>
                        <Link
                          href={`/dashboard/tickets/${t.id}`}
                          className="text-xs font-mono font-medium text-muted-foreground group-hover:text-primary transition-colors"
                        >
                          #{t.ticketNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/tickets/${t.id}`}
                          className="font-medium text-foreground text-sm hover:text-primary transition-colors truncate max-w-[220px] block"
                        >
                          {t.title}
                        </Link>
                      </TableCell>
                      <TableCell>{statusBadge(tStatus, FALLBACK_BADGE)}</TableCell>
                      <TableCell>{statusBadge(tPriority, FALLBACK_BADGE)}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <User className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[120px]">{t.clientName || '—'}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground truncate max-w-[120px] block">
                          {t.assignedToName || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(t.createdAt), 'MMM d, yyyy')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(t.updatedAt), 'MMM d, yyyy')}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
