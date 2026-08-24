'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { format, subDays } from 'date-fns'
import {
  TrendingUp,
  Clock,
  Ticket,
  CheckCircle2,
  Trophy,
  Target,
  Calendar,
  Timer,
  BarChart3,
  Activity,
  Zap,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { getDeveloperAnalytics, getWorklogSummary, getEmployeeProductivity } from '@/app/actions/tickets'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/dashboard/stat-card'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { TICKET_STATUS_CONFIG, TicketStatus } from '@/lib/types'
import type { UserRole } from '@/lib/types'

const CHART_COLORS = ['#8B5CF6', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#6B7280']

function fmtMins(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * Builds a continuous daily trend series for the selected period, filling
 * days with no logged time as zero so the chart always shows ~days points
 * (7/30/90) rather than only the days that happen to have data.
 */
function buildTrendData(daily: { date: string; totalMinutes: number; billableMinutes: number }[], days: number) {
  const byDate = new Map(daily.map((d) => [d.date, d]))
  const points: { date: string; hours: number; productivity: number; closed: number }[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const key = format(subDays(today, i), 'yyyy-MM-dd')
    const total = byDate.get(key)?.totalMinutes ?? 0
    const billable = byDate.get(key)?.billableMinutes ?? 0
    points.push({
      date: key,
      hours: Math.round((total / 60) * 10) / 10,
      productivity: Math.min(100, Math.round((billable / Math.max(total, 1)) * 100)),
      closed: 0,
    })
  }
  return points
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-900 border border-border rounded-lg p-3 text-sm shadow-md">
      {label && <p className="font-medium text-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="text-xs">
          {p.name}: {typeof p.value === 'number' ? (p.dataKey === 'hours' ? `${p.value}h` : p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

interface DeveloperAnalytics {
  statusDistribution: { status: string; count: number }[]
  totalTimeMinutes: number
  billableTimeMinutes: number
  totalTickets: number
  resolvedTickets: number
  avgResolutionHours: number
}

interface WorklogData {
  dailySummary: { date: string; totalMinutes: number; billableMinutes: number }[]
  byTicket: { ticketId: number; ticketNumber: string; title: string; totalMinutes: number; billableMinutes: number; entries: number }[]
  totalMinutes: number
  billableMinutes: number
}

interface EmployeeProductivity {
  id: string
  name: string
  role: string
  email: string
  totalMinutes: number
  totalHours: number
  ticketsWorked: number
  resolvedTickets: number
  avgMinutesPerTicket: number
  lastActivity: Date | null
}

interface ResourcesClientProps {
  role: UserRole
  developerAnalytics?: DeveloperAnalytics
  worklog?: WorklogData
  productivityData?: EmployeeProductivity[]
}

export function ResourcesClient({
  role,
  developerAnalytics,
  worklog,
  productivityData,
}: ResourcesClientProps) {
  const [dateRange, setDateRange] = useState<'7' | '30' | '90'>('7')
  const [devAnalytics, setDevAnalytics] = useState(developerAnalytics)
  const [devWorklog, setDevWorklog] = useState(worklog)
  const [prodData, setProdData] = useState(productivityData)
  const [loading, setLoading] = useState(false)
  // Monotonic request id — only the latest period request may apply its result,
  // so rapid switching can never let a stale response overwrite a newer one.
  const requestIdRef = useRef(0)

  const fetchForPeriod = useCallback(async (period: '7' | '30' | '90'): Promise<boolean> => {
    const days = Number(period)
    const requestId = ++requestIdRef.current
    setLoading(true)
    try {
      if (role === 'developer') {
        const [analytics, worklogData] = await Promise.all([
          getDeveloperAnalytics(days),
          getWorklogSummary(days),
        ])
        if (requestIdRef.current === requestId) {
          setDevAnalytics(analytics)
          setDevWorklog(worklogData)
          return true
        }
        return false
      }
      if (role === 'project_manager' || role === 'admin') {
        const since = new Date()
        since.setDate(since.getDate() - days)
        const data = await getEmployeeProductivity({ startDate: since, endDate: new Date() })
        if (requestIdRef.current === requestId) {
          setProdData(data)
          return true
        }
        return false
      }
      return false
    } catch (err) {
      console.error('[resources] failed to load data for period', period, err)
      return false
    } finally {
      if (requestIdRef.current === requestId) setLoading(false)
    }
  }, [role])

  const handlePeriodChange = useCallback(async (period: '7' | '30' | '90') => {
    // Skip duplicate clicks while a request is already in flight.
    if (period === dateRange || loading) return
    const prev = dateRange
    setDateRange(period)
    const ok = await fetchForPeriod(period)
    // On failure, revert the selection so the highlighted period always
    // matches the data currently on screen.
    if (!ok) setDateRange(prev)
  }, [dateRange, loading, fetchForPeriod])

  // Continuous daily series for the selected period (7/30/90 points).
  const trendData = useMemo(
    () => buildTrendData(devWorklog?.dailySummary ?? [], Number(dateRange)),
    [devWorklog, dateRange],
  )

  // Developer view
  if (role === 'developer' && devAnalytics) {
    const { statusDistribution, totalTimeMinutes, billableTimeMinutes, totalTickets, resolvedTickets, avgResolutionHours } = devAnalytics

    const pieData = statusDistribution.map((s) => ({
      name: TICKET_STATUS_CONFIG[s.status as keyof typeof TICKET_STATUS_CONFIG]?.label || s.status,
      value: s.count,
    }))

    const resolutionRate = totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : 0
    const slaCompliance = Math.min(95, 70 + resolutionRate * 0.3) // simulated SLA
    const avgDailyHours = Math.round((totalTimeMinutes / 60 / Number(dateRange)) * 10) / 10
    const efficiencyRate = totalTimeMinutes > 0 ? Math.min(100, Math.round((resolvedTickets / (totalTimeMinutes / 60)) * 10)) : 0

    return (
      <div className="space-y-6">
        {/* Header in creative rounded container */}
        <motion.div
          data-tour="resources-header"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm overflow-hidden"
        >
          <div aria-hidden="true" className="pointer-events-none absolute top-0 right-0 w-48 h-32 opacity-[0.03]">
            <svg width="100%" height="100%" viewBox="0 0 100 60" fill="currentColor" className="text-foreground">
              <circle cx="10" cy="10" r="1.5" /><circle cx="30" cy="10" r="1.5" /><circle cx="50" cy="10" r="1.5" />
              <circle cx="70" cy="10" r="1.5" /><circle cx="90" cy="10" r="1.5" /><circle cx="20" cy="25" r="1.5" />
              <circle cx="40" cy="25" r="1.5" /><circle cx="60" cy="25" r="1.5" /><circle cx="80" cy="25" r="1.5" />
              <circle cx="10" cy="40" r="1.5" /><circle cx="30" cy="40" r="1.5" /><circle cx="50" cy="40" r="1.5" />
              <circle cx="70" cy="40" r="1.5" /><circle cx="90" cy="40" r="1.5" /><circle cx="20" cy="55" r="1.5" />
              <circle cx="40" cy="55" r="1.5" /><circle cx="60" cy="55" r="1.5" /><circle cx="80" cy="55" r="1.5" />
            </svg>
          </div>
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <PageHeaderIcon variant="emerald">
                <TrendingUp className="h-5 w-5" />
              </PageHeaderIcon>
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Resource Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Your performance and resource overview</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 border border-emerald-100 rounded-xl p-1">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1 shrink-0" />}
              {(['7', '30', '90'] as const).map((d) => (
                <button
                  key={d}
                  disabled={loading}
                  onClick={() => handlePeriodChange(d)}
                  aria-pressed={dateRange === d}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    dateRange === d
                      ? 'bg-white dark:bg-slate-900 text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* KPI Cards */}
        <div data-tour="resources-kpis" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Time Logged"
            value={fmtMins(totalTimeMinutes)}
            iconName="Timer"
            delay={0}
          />
          <StatCard
            title="Tickets Assigned"
            value={totalTickets}
            iconName="Ticket"
            delay={1}
          />
          <StatCard
            title="Tickets Resolved"
            value={resolvedTickets}
            iconName="CheckCircle2"
            delay={2}
          />
          <StatCard
            title="Productivity Score"
            value={`${resolutionRate}%`}
            iconName="BarChart3"
            delay={3}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Donut Chart */}
          <motion.div
            data-tour="resources-status-chart"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-slate-900 border border-border rounded-xl p-6 shadow-sm"
          >
            <h3 className="text-sm font-semibold text-foreground mb-4">Status Breakdown</h3>
            {pieData.length === 0 ? (
              <div className="h-48 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No data</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-xs text-muted-foreground">{d.name}</span>
                      <span className="text-xs font-medium text-foreground">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* Time Logged Trend */}
          <motion.div
            data-tour="resources-time-chart"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white dark:bg-slate-900 border border-border rounded-xl p-6 shadow-sm lg:col-span-2"
          >
            <h3 className="text-sm font-semibold text-foreground mb-4">Time Logged Trend</h3>
            {trendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => format(new Date(v), 'MMM d')}
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="hours" name="Hours" stroke="#8B5CF6" strokeWidth={2} fill="url(#hoursGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </div>

        {/* Additional Metrics */}
        <motion.div
          data-tour="resources-metrics"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-slate-900 border border-border rounded-xl p-6 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Additional Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Avg Resolution Time', value: `${avgResolutionHours}h`, icon: Timer, desc: 'Average time to resolve' },
              { label: 'Avg Daily Hours', value: `${avgDailyHours}h`, icon: Clock, desc: 'Average hours per day' },
              { label: 'SLA Compliance', value: `${Math.round(slaCompliance)}%`, icon: Target, desc: 'Within SLA targets' },
              { label: 'Awaiting Estimate Approval', value: statusDistribution.find(s => s.status === TicketStatus.ESTIMATE_PENDING)?.count || 0, icon: AlertCircle, desc: 'Awaiting estimate approval' },
              { label: 'Efficiency Rate', value: `${efficiencyRate}%`, icon: Zap, desc: 'Resolved per hour ratio' },
              { label: 'Resolution Rate', value: `${resolutionRate}%`, icon: Activity, desc: 'Of total tickets' },
            ].map((metric, idx) => (
              <div key={metric.label} className="p-4 rounded-xl bg-muted/20 border border-border/40">
                <div className="flex items-center gap-2 mb-2">
                  <metric.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{metric.label}</span>
                </div>
                <p className="text-lg font-bold text-foreground">{metric.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{metric.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    )
  }

  // Manager/Admin view — rankings respond to the selected 7/30/90d period
  if ((role === 'project_manager' || role === 'admin') && prodData) {
    const totalHours = prodData.reduce((s, e) => s + e.totalMinutes, 0)
    const totalResolved = prodData.reduce((s, e) => s + e.resolvedTickets, 0)
    const developerData = prodData.filter((e) => e.role === 'developer')
    const topPerformer = prodData[0] || null

    return (
      <div className="space-y-6">
        <motion.div
          data-tour="resources-header"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm overflow-hidden"
        >
          <div aria-hidden="true" className="pointer-events-none absolute top-0 right-0 w-48 h-32 opacity-[0.03]">
            <svg width="100%" height="100%" viewBox="0 0 100 60" fill="currentColor" className="text-foreground">
              <circle cx="10" cy="10" r="1.5" /><circle cx="30" cy="10" r="1.5" /><circle cx="50" cy="10" r="1.5" />
              <circle cx="70" cy="10" r="1.5" /><circle cx="90" cy="10" r="1.5" /><circle cx="20" cy="25" r="1.5" />
              <circle cx="40" cy="25" r="1.5" /><circle cx="60" cy="25" r="1.5" /><circle cx="80" cy="25" r="1.5" />
              <circle cx="10" cy="40" r="1.5" /><circle cx="30" cy="40" r="1.5" /><circle cx="50" cy="40" r="1.5" />
              <circle cx="70" cy="40" r="1.5" /><circle cx="90" cy="40" r="1.5" /><circle cx="20" cy="55" r="1.5" />
              <circle cx="40" cy="55" r="1.5" /><circle cx="60" cy="55" r="1.5" /><circle cx="80" cy="55" r="1.5" />
            </svg>
          </div>
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <PageHeaderIcon variant="amber">
                <TrendingUp className="h-5 w-5" />
              </PageHeaderIcon>
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Resource Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Team resource performance and rankings</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 border border-amber-100 rounded-xl p-1">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1 shrink-0" />}
              {(['7', '30', '90'] as const).map((d) => (
                <button
                  key={d}
                  disabled={loading}
                  onClick={() => handlePeriodChange(d)}
                  aria-pressed={dateRange === d}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    dateRange === d
                      ? 'bg-white dark:bg-slate-900 text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        <div data-tour="resources-kpis" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Hours"
            value={fmtMins(totalHours)}
            iconName="Timer"
            delay={0}
          />
          <StatCard
            title="Tickets Resolved"
            value={totalResolved}
            iconName="CheckCircle2"
            delay={1}
          />
          <StatCard
            title="Active Devs"
            value={developerData.length}
            iconName="Users"
            delay={2}
          />
          <StatCard
            title="Top Performer"
            value={topPerformer?.name || 'N/A'}
            iconName="Briefcase"
            delay={3}
          >
            {topPerformer && (
              <p className="text-xs text-muted-foreground">{fmtMins(topPerformer.totalMinutes)}</p>
            )}
          </StatCard>
        </div>

        <motion.div
          data-tour="resources-rankings"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm"
        >
          <div className="p-5 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Employee Rankings</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-muted-foreground font-medium">#</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Employee</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Role</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Hours</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Worked</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Resolved</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Avg/Ticket</th>
                </tr>
              </thead>
              <tbody>
                {prodData.map((emp, i) => (
                  <tr key={emp.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                    <td className="p-4">
                      <span className={`font-bold ${i === 0 ? 'text-amber-500 dark:text-amber-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
                        #{i + 1}
                      </span>
                    </td>
                    <td className="p-4">
                      <p className="font-medium text-foreground">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.email}</p>
                    </td>
                    <td className="p-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                        {emp.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4 text-right font-medium text-foreground">{fmtMins(emp.totalMinutes)}</td>
                    <td className="p-4 text-right text-foreground">{emp.ticketsWorked}</td>
                    <td className="p-4 text-right text-emerald-600 dark:text-emerald-400 font-medium">{emp.resolvedTickets}</td>
                    <td className="p-4 text-right text-muted-foreground">{emp.avgMinutesPerTicket > 0 ? fmtMins(emp.avgMinutesPerTicket) : '—'}</td>
                  </tr>
                ))}
                {prodData.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No productivity data available</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    )
  }

  return null
}
