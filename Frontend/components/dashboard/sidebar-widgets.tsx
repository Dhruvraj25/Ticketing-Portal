import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  PlayCircle,
  FolderKanban,
  AlertCircle,
  Users,
  Plus,
  BarChart3,
  Ticket,
} from 'lucide-react'

interface ProjectWidget {
  id: number
  projectCode: string
  projectName: string
  ticketCount?: number
}

interface ProjectAnalytic {
  id: number
  projectCode: string
  total: number
  open: number
  inProgress: number
  resolved: number
  closed: number
}

interface SidebarWidgetsProps {
  role: string
  activeTimer: {
    ticketId: number
  } | null
  projects: ProjectWidget[]
  unassignedTickets: any[]
  developers: any[]
  projectAnalytics: ProjectAnalytic[]
}

const widgetAnimation = 'animate-fade-in-up'

const widgetDelays: Record<string, string> = {
  'active-timer': '0.15s',
  'active-projects': '0.2s',
  'unassigned': '0.25s',
  'team': '0.3s',
  'quick-actions': '0.2s',
  'analytics': '0.35s',
}

export function SidebarWidgets({
  role,
  activeTimer,
  projects,
  unassignedTickets,
  developers,
  projectAnalytics,
}: SidebarWidgetsProps) {
  return (
    <div className="space-y-4">
      {/* Developer: Active Timer */}
      {role === 'developer' && (
        <div
          data-tour="sidebar-active-timer"
          style={{ animationDelay: widgetDelays['active-timer'] }}
          className={`${widgetAnimation} relative rounded-2xl bg-white dark:bg-slate-900 border border-border/60 p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] hover:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.08)] transition-all duration-200 hover:-translate-y-0.5`}
        >
          <div className="absolute top-0 left-4 right-4 h-0.5 rounded-full bg-slate-200" />
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-accent transition-transform duration-200 hover:scale-110 hover:rotate-5">
              <PlayCircle className="h-4 w-4 text-foreground/70" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Timer</p>
            </div>
          </div>
          {activeTimer ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <p className="text-sm font-medium text-foreground">Working on ticket #{activeTimer.ticketId}</p>
              </div>
              <Link href="/dashboard/time-tracking">
                <Button variant="outline" size="sm" className="w-full">View Timer</Button>
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gray-300" />
              <p className="text-sm text-muted-foreground">No active timer. Start working to track.</p>
            </div>
          )}
        </div>
      )}

      {/* Active Projects (all roles except admin/pm get this via projects.length > 0) */}
      {projects.length > 0 && (
        <div
          data-tour="sidebar-active-projects"
          style={{ animationDelay: widgetDelays['active-projects'] }}
          className={`${widgetAnimation} relative rounded-2xl bg-white dark:bg-slate-900 border border-border/60 p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] hover:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.08)] transition-all duration-200 hover:-translate-y-0.5`}
        >
          <div className="absolute top-0 left-4 right-4 h-0.5 rounded-full bg-slate-200" />
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-accent transition-transform duration-200 hover:scale-110 hover:rotate-2">
              <FolderKanban className="h-4 w-4 text-foreground/70" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {role === 'client' ? 'My Projects' : 'Active Projects'}
              </p>
              <p className="text-xl font-bold text-foreground">{projects.length}</p>
            </div>
            <span className="h-2 w-2 rounded-full bg-green-500" />
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {projects.slice(0, 5).map((proj) => (
              <Link
                key={proj.id}
                href={`/dashboard/projects/${proj.id}`}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors text-sm group"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <div className="h-1.5 w-1.5 rounded-full bg-neutral-300 shrink-0" />
                  <span className="font-mono text-xs text-muted-foreground">{proj.projectCode}</span>
                  <span className="truncate text-foreground">{proj.projectName}</span>
                </span>
                <span className="text-muted-foreground text-xs shrink-0 ml-2">{proj.ticketCount ?? 0} tickets</span>
              </Link>
            ))}
            {projects.length > 5 && (
              <Link href="/dashboard/projects" className="block text-xs text-info text-center pt-2">View all {projects.length} projects</Link>
            )}
          </div>
        </div>
      )}

      {/* Manager/Admin: Unassigned */}
      {(role === 'project_manager' || role === 'admin') && (
        <div
          data-tour="sidebar-unassigned"
          style={{ animationDelay: widgetDelays['unassigned'] }}
          className={`${widgetAnimation} relative rounded-2xl bg-white dark:bg-slate-900 border border-border/60 p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] hover:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.08)] transition-all duration-200 hover:-translate-y-0.5`}
        >
          <div className="absolute top-0 left-4 right-4 h-0.5 rounded-full bg-slate-200" />
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-accent transition-transform duration-200 hover:scale-110 hover:rotate-5">
              <AlertCircle className="h-4 w-4 text-amber-500 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unassigned</p>
              <p className="text-2xl font-bold text-foreground">{unassignedTickets.length}</p>
            </div>
            <span className={cn('h-2 w-2 rounded-full', unassignedTickets.length > 0 ? 'bg-amber-500' : 'bg-green-500')} />
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {unassignedTickets.length > 0
              ? `${unassignedTickets.length} ticket${unassignedTickets.length !== 1 ? 's' : ''} need assignment`
              : 'All tickets assigned'}
          </p>
          <Link href="/dashboard/assignments">
            <Button variant="outline" size="sm" className="w-full">Manage Assignments</Button>
          </Link>
        </div>
      )}

      {/* Manager/Admin: Team */}
      {(role === 'project_manager' || role === 'admin') && (
        <div
          data-tour="sidebar-team"
          style={{ animationDelay: widgetDelays['team'] }}
          className={`${widgetAnimation} relative rounded-2xl bg-white dark:bg-slate-900 border border-border/60 p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] hover:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.08)] transition-all duration-200 hover:-translate-y-0.5`}
        >
          <div className="absolute top-0 left-4 right-4 h-0.5 rounded-full bg-slate-200" />
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-accent transition-transform duration-200 hover:scale-110">
              <Users className="h-4 w-4 text-foreground/70" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Team</p>
              <p className="text-2xl font-bold text-foreground">{developers.length}</p>
            </div>
            <span className={cn('h-2 w-2 rounded-full', developers.length > 0 ? 'bg-green-500' : 'bg-gray-300')} />
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {developers.length} active developer{developers.length !== 1 ? 's' : ''}
          </p>
          <Link href="/dashboard/team">
            <Button variant="outline" size="sm" className="w-full">View Team</Button>
          </Link>
        </div>
      )}

      {/* Client: Quick Actions */}
      {role === 'client' && (
        <div
          data-tour="sidebar-quick-actions"
          style={{ animationDelay: widgetDelays['quick-actions'] }}
          className={`${widgetAnimation} relative rounded-2xl bg-white dark:bg-slate-900 border border-border/60 p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all duration-200 hover:-translate-y-0.5`}
        >
          <div className="absolute top-0 left-4 right-4 h-0.5 rounded-full bg-slate-200" />
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-accent transition-transform duration-200 hover:scale-110">
              <BarChart3 className="h-4 w-4 text-foreground/70" />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Actions</p>
          </div>
          <div className="space-y-2">
            <Link href="/dashboard/tickets/new" className="block">
              <Button variant="outline" size="sm" className="w-full justify-start">
                <Plus className="mr-2 h-4 w-4" />
                Submit New Ticket
              </Button>
            </Link>

          </div>
        </div>
      )}

      {/* Manager/Admin: Project Analytics */}
      {(role === 'project_manager' || role === 'admin') && projectAnalytics.length > 0 && (
        <div
          data-tour="sidebar-project-analytics"
          style={{ animationDelay: widgetDelays['analytics'] }}
          className={`${widgetAnimation} relative rounded-2xl bg-white dark:bg-slate-900 border border-border/60 p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all duration-200`}
        >
          <div className="absolute top-0 left-4 right-4 h-0.5 rounded-full bg-slate-200" />
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-accent transition-transform duration-200 hover:scale-110">
              <BarChart3 className="h-4 w-4 text-foreground/70" />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Analytics</p>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {projectAnalytics.slice(0, 4).map((pa) => (
              <Link
                key={pa.id}
                href={`/dashboard/projects/${pa.id}`}
                className="block p-2 rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-foreground">{pa.projectCode}</span>
                  <span className="text-muted-foreground text-xs">{pa.total} tickets</span>
                </div>
                <div className="flex gap-2 text-xs">
                  {pa.open > 0 && <span className="text-info">{pa.open} open</span>}
                  {pa.inProgress > 0 && <span className="text-amber-600 dark:text-amber-400">{pa.inProgress} in prog</span>}
                  {pa.resolved > 0 && <span className="text-green-600 dark:text-green-400">{pa.resolved} resolved</span>}
                  {pa.closed > 0 && <span className="text-muted-foreground">{pa.closed} closed</span>}
                </div>
              </Link>
            ))}
            {projectAnalytics.length > 4 && (
              <Link href="/dashboard/analytics" className="block text-xs text-info text-center pt-1">View full analytics</Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}