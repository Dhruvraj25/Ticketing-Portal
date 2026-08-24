import { PageTimer } from '@/lib/performance-profiler'
import { getCurrentUser, getEmployeeProductivity, getCachedWorklogs, getPaginatedWorklogs } from '@/app/actions/tickets'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { timeLog, ticket, user } from '@/lib/db/schema'
import { desc, eq, isNotNull } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { ActivityLogPanel } from '@/components/dashboard/activity-log-panel'
import { ClipboardList, Clock, Ticket as TicketIcon, Timer, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import { USER_ROLE_CONFIG } from '@/lib/types'
import { cn } from '@/lib/utils'
import { fmtDuration, stripHtml } from '@/lib/format'
import { StatCard } from '@/components/dashboard/stat-card'

const WORKLOGS_CACHE_KEY = 'all_worklogs'

interface WorklogEntry {
  id: number
  ticketId: number
  userId: string
  description: string | null
  startTime: Date
  durationMinutes: number | null
  endTime: Date | null
  isBillable: boolean
  userName: string
  userRole: string
  ticketNumber: string
  ticketTitle: string
}

async function getAllWorklogs(): Promise<WorklogEntry[]> {
  // ── Cache-check via getCachedWorklogs helper ───────────────────────────
  // Worklogs data changes only when timers stop. The 30s TTL + invalidation
  // in stopTimer() keeps the cache fresh without re-sorting every load.
  return getCachedWorklogs(WORKLOGS_CACHE_KEY, async () => {
    // OPTIMIZATION: Use LEFT JOINs instead of 3 separate queries + JS enrichment.
    // Before: 1 × timeLog query + 1 × user query + 1 × ticket query = 3 queries
    // After:  1 × timeLog query with JOINs = 1 query
    // Expected: ~75% reduction in query count, ~50% reduction in wall-clock time
    // Uses idx_time_log_completed_recent partial index (migration 0013):
    //   time_log("startTime" DESC) WHERE "endTime" IS NOT NULL
    const logs = await db
      .select({
        id: timeLog.id,
        ticketId: timeLog.ticketId,
        userId: timeLog.userId,
        description: timeLog.description,
        startTime: timeLog.startTime,
        durationMinutes: timeLog.durationMinutes,
        endTime: timeLog.endTime,
        isBillable: timeLog.isBillable,
        // JOIN enrichment directly in SQL
        userName: user.name,
        userRole: user.role,
        ticketNumber: ticket.ticketNumber,
        ticketTitle: ticket.title,
      })
      .from(timeLog)
      .leftJoin(user, eq(timeLog.userId, user.id))
      .leftJoin(ticket, eq(timeLog.ticketId, ticket.id))
      .where(isNotNull(timeLog.endTime))
      .orderBy(desc(timeLog.startTime))
      .limit(200)

    return logs.map((l) => ({
      id: l.id,
      ticketId: l.ticketId,
      userId: l.userId,
      description: l.description,
      startTime: l.startTime,
      durationMinutes: l.durationMinutes,
      endTime: l.endTime,
      isBillable: l.isBillable,
      userName: l.userName || 'Unknown',
      userRole: l.userRole || 'developer',
      ticketNumber: l.ticketNumber || `#${l.ticketId}`,
      ticketTitle: l.ticketTitle || 'Unknown Ticket',
    }))
  }) as Promise<WorklogEntry[]>
}

export default async function WorklogsPage() {
  const pageTimer = new PageTimer('Worklogs Page')
  
  pageTimer.mark('Parallel Data Fetching')
  // Start data fetches IMMEDIATELY — they execute in parallel with getCurrentUser()
  // The redirect still happens before awaiting data results, so unauthorized
  // users are redirected without waiting for expensive worklog queries.
  const userPromise = getCurrentUser()
  const worklogsPromise = getAllWorklogs()
  const productivityPromise = getEmployeeProductivity()
  const initialActivityPromise = getPaginatedWorklogs(20, 0)

  const user = await userPromise
  if (user.role !== 'admin' && user.role !== 'project_manager') {
    redirect('/dashboard')
  }

  const [worklogs, productivity, initialActivity] = await Promise.all([
    worklogsPromise,
    productivityPromise,
    initialActivityPromise,
  ])

  const totalMinutes = worklogs.reduce((s: number, l) => s + (l.durationMinutes || 0), 0)
  const billableMinutes = worklogs.filter((l: any) => l.isBillable).reduce((s: number, l: any) => s + (l.durationMinutes || 0), 0)
  const nonBillableMinutes = totalMinutes - billableMinutes

  type EmpProd = { id: string; name: string; role: string; email: string; totalMinutes: number; totalHours: number; ticketsWorked: number; resolvedTickets: number; avgMinutesPerTicket: number; lastActivity: Date | null }

  const byEmployee: (EmpProd & { recentLogs: { id: number; ticketNumber: string; ticketTitle: string; startTime: Date; durationMinutes: number | null }[] })[] = productivity.map((emp: EmpProd) => ({
    ...emp,
    recentLogs: worklogs.filter((l) => l.userId === emp.id).slice(0, 3),
  }))

  pageTimer.mark('Render')
  pageTimer.finish()

  return (
    <div className="space-y-6" data-tour="worklogs-table">
       <div data-tour="worklogs-header" className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
      <PageHeader
          title="Worklogs"
          subtitle="All employee time logs across tickets"
          icon={<Clock className="h-5 w-5" />}
          iconVariant="amber"
        />
</div>
      <div className="space-y-6">
          {/* KPI Summary */}
          <div data-tour="worklogs-kpis" className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Total Logged Hours"
              value={fmtDuration(totalMinutes)}
              iconName="Timer"
              delay={0}
            />
            <StatCard
              title="Billable Hours"
              value={fmtDuration(billableMinutes)}
              iconName="CheckCircle2"
              delay={1}
            />
            <StatCard
              title="Non-Billable Hours"
              value={fmtDuration(nonBillableMinutes)}
              iconName="Clock"
              delay={2}
            />
            <StatCard
              title="Active Developers"
              value={productivity.filter((e: { totalMinutes: number }) => e.totalMinutes > 0).length}
              iconName="Users"
              delay={3}
            />
          </div>

          {/* Employee Worklog Summary — redesigned cards */}
          <div data-tour="worklog-summary" className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Employee Worklog Summary
            </h2>
            {byEmployee.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 rounded-xl bg-white dark:bg-slate-900 border border-border">
                <ClipboardList className="h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">No worklog data found</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {byEmployee.map((emp) => {
                  const totalHours = Math.round(emp.totalMinutes / 60 * 10) / 10
                  return (
                    <div
                      key={emp.id}
                      className="rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden card-shadow hover:shadow-md transition-shadow"
                    >
                      {/* Header with gradient accent */}
                      <div className="relative">
                        <div className="p-4 pb-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                              <span className="text-sm font-bold text-white">
                                {emp.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-foreground truncate">{emp.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                            </div>
                            <Badge variant="outline" className={cn('text-xs shrink-0 rounded-lg', USER_ROLE_CONFIG[emp.role as keyof typeof USER_ROLE_CONFIG]?.color)}>
                              {USER_ROLE_CONFIG[emp.role as keyof typeof USER_ROLE_CONFIG]?.label || emp.role}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="px-4 py-3 bg-muted/10 border-t border-b border-border/30">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-lg font-bold text-foreground tabular-nums">{totalHours}h</p>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Hours</p>
                          </div>
                          <div className="border-x border-border/30">
                            <p className="text-lg font-bold text-foreground tabular-nums">{emp.ticketsWorked}</p>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Tickets</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{emp.resolvedTickets}</p>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Resolved</p>
                          </div>
                        </div>
                      </div>

                      {/* Recent logs */}
                      {emp.recentLogs.length > 0 && (
                        <div className="p-4 pt-3">
                          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Timer className="h-3 w-3" />
                            Recent Activity
                          </p>
                          <div className="space-y-1.5">
                            {emp.recentLogs.map((log: any) => (
                              <div key={log.id} className="flex items-center justify-between text-xs bg-muted/20 rounded-lg px-3 py-2 hover:bg-muted/40 transition-colors">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div className="h-1.5 w-1.5 rounded-full bg-primary/40 shrink-0" />
                                  <span className="font-mono text-muted-foreground shrink-0 text-[11px]">{log.ticketNumber}</span>
                                  <span className="text-foreground truncate">{log.ticketTitle}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <span className="text-muted-foreground/60 text-[11px]">{format(new Date(log.startTime), 'MMM d')}</span>
                                  <span className="font-semibold text-foreground tabular-nums">{fmtDuration(log.durationMinutes || 0)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}                      </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Activity Log Panel — sticky, paginated, infinite scroll */}
          <ActivityLogPanel initialLogs={initialActivity.logs} initialHasMore={initialActivity.hasMore} />
        </div>
    </div>
  )
}
