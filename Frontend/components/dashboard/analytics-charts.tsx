'use client'

import { useEffect, memo } from 'react'
import { startComponentRender, endComponentRender } from '@/lib/performance-profiler'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { TICKET_STATUS_CONFIG, TICKET_PRIORITY_CONFIG } from '@/lib/types'
import { RefreshCw as RefreshCwIcon } from 'lucide-react'
import { StatCard } from '@/components/dashboard/stat-card'

const PRIORITY_COLORS: Record<string, string> = {
  low: '#22C55E',
  medium: '#F59E0B',
  high: '#EF4444',
  urgent: '#DC2626',
  critical: '#991B1B',
}

const RESOURCE_COLORS = [
  '#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
  '#14B8A6', '#F97316', '#6366F1', '#84CC16', '#06B6D4', '#D946EF',
]

const CHART_COLORS = [
  '#3B82F6',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#6B7280',
  '#8B5CF6',
]

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-900 border border-border rounded-lg p-3 text-sm shadow-md">
      {label && (
        <p className="font-medium text-foreground mb-1">
          {label.includes('-') && label.length === 10
            ? format(parseISO(label), 'EEE, MMM d')
            : label}
        </p>
      )}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="text-xs capitalize">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

interface DailyVolume {
  date: string
  count: number
}

const TicketVolumeChartBase = ({ data }: { data: DailyVolume[] }) => {
  const renderStart = startComponentRender('TicketVolumeChart')
  useEffect(() => { endComponentRender('TicketVolumeChart', renderStart) }, [])
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 card-shadow">
      <h3 className="text-sm font-semibold text-foreground mb-4">Ticket Volume (30 days)</h3>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No data in this period</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => format(parseISO(v), 'MMM d')}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="count"
              name="Tickets"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#volumeGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export const TicketVolumeChart = memo(TicketVolumeChartBase)

interface StatusDist {
  status: string
  count: number
}

const StatusDistributionChartBase = ({ data }: { data: StatusDist[] }) => {
  const renderStart = startComponentRender('StatusDistributionChart')
  useEffect(() => { endComponentRender('StatusDistributionChart', renderStart) }, [])
  const pieData = data.map((d) => ({
    name: TICKET_STATUS_CONFIG[d.status as keyof typeof TICKET_STATUS_CONFIG]?.label || d.status,
    value: d.count,
  }))

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 card-shadow">
      <h3 className="text-sm font-semibold text-foreground mb-4">Status Distribution</h3>
      {pieData.length === 0 ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No data</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
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
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '11px', color: 'var(--muted-foreground)' }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export const StatusDistributionChart = memo(StatusDistributionChartBase)

interface PriorityDist {
  priority: string
  count: number
}

const PriorityDistributionChartBase = ({ data }: { data: PriorityDist[] }) => {
  const renderStart = startComponentRender('PriorityDistributionChart')
  useEffect(() => { endComponentRender('PriorityDistributionChart', renderStart) }, [])
  const barData = data.map((d) => ({
    priority: TICKET_PRIORITY_CONFIG[d.priority as keyof typeof TICKET_PRIORITY_CONFIG]?.label || d.priority,
    count: d.count,
    color: PRIORITY_COLORS[d.priority] || '#6B7280',
  }))

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 card-shadow">
      <h3 className="text-sm font-semibold text-foreground mb-4">Priority Breakdown</h3>
      {barData.length === 0 ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No data</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} barSize={48}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="priority"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" name="Tickets" radius={[4, 4, 0, 0]}>
              {barData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export const PriorityDistributionChart = memo(PriorityDistributionChartBase)

interface DevStat {
  id: string
  name: string
  activeTickets: number
  resolvedTickets: number
  totalTimeMinutes: number
}

function fmtMins(m: number) {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min}m`
  if (min === 0) return `${h}h`
  return `${h}h ${min}m`
}

const DeveloperWorkloadChartBase = ({ data }: { data: DevStat[] }) => {
  const renderStart = startComponentRender('DeveloperWorkloadChart')
  useEffect(() => { endComponentRender('DeveloperWorkloadChart', renderStart) }, [])
  const barData = data.map((d) => ({
    name: d.name,
    Active: d.activeTickets,
    Resolved: d.resolvedTickets,
  }))

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 card-shadow">
      <h3 className="text-sm font-semibold text-foreground mb-4">Resource Workload</h3>
      {barData.length === 0 ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No developers found</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(200, barData.length * 48)}>
          <BarChart data={barData} layout="vertical" barSize={14} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={90}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '11px', color: 'var(--muted-foreground)' }}
            />
            <Bar dataKey="Active" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Resolved" stackId="a" fill="#22C55E" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export const DeveloperWorkloadChart = memo(DeveloperWorkloadChartBase)

interface RevisionAnalytics {
  totalRevisions: number
  clientRevisions: number
  managerRevisions: number
  adminRevisions: number
  avgRevisionsPerTicket: number
}

const RevisionAnalyticsCardsBase = ({ data }: { data: RevisionAnalytics }) => {
  const renderStart = startComponentRender('RevisionAnalyticsCards')
  useEffect(() => { endComponentRender('RevisionAnalyticsCards', renderStart) }, [])
  const items = [
    { label: 'Total Revisions', value: data.totalRevisions, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/15 border-orange-200 dark:border-orange-500/30' },
    { label: 'Client Revisions', value: data.clientRevisions, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/30' },
    { label: 'Manager Revisions', value: data.managerRevisions, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-500/30' },
    { label: 'Admin Revisions', value: data.adminRevisions, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30' },
  ]

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 card-shadow">
      <div className="flex items-center gap-2 mb-4">
        <RefreshCwIcon className="h-4 w-4 text-orange-500 dark:text-orange-400" />
        <h3 className="text-sm font-semibold text-foreground">Revision Analytics</h3>
        {data.avgRevisionsPerTicket > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            Avg {data.avgRevisionsPerTicket} per ticket
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((item) => (
          <div key={item.label} className={`rounded-lg border p-3 ${item.bg}`}>
            <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export const RevisionAnalyticsCards = memo(RevisionAnalyticsCardsBase)

const DeveloperTimeTableBase = ({ data }: { data: DevStat[] }) => {
  const renderStart = startComponentRender('DeveloperTimeTable')
  useEffect(() => { endComponentRender('DeveloperTimeTable', renderStart) }, [])
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 card-shadow">
      <h3 className="text-sm font-semibold text-foreground mb-4">Resource Time Logged</h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No developers found</p>
      ) : (
        <div className="space-y-2">
          {data
            .slice()
            .sort((a, b) => b.totalTimeMinutes - a.totalTimeMinutes)
            .map((dev, idx) => {
              const max = Math.max(...data.map((d) => d.totalTimeMinutes), 1)
              const pct = (dev.totalTimeMinutes / max) * 100
              const color = RESOURCE_COLORS[idx % RESOURCE_COLORS.length]
              return (
                <div key={dev.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-foreground font-medium">{dev.name}</span>
                    <span className="text-muted-foreground text-xs">{fmtMins(dev.totalTimeMinutes)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

export const DeveloperTimeTable = memo(DeveloperTimeTableBase)

interface AnalyticsKpis {
  totalTickets: number
  resolvedTickets: number
  avgResolutionHours: number
  openRate?: number
}

const AnalyticsKpiStripBase = ({ kpis }: { kpis: AnalyticsKpis }) => {
  const renderStart = startComponentRender('AnalyticsKpiStrip')
  useEffect(() => { endComponentRender('AnalyticsKpiStrip', renderStart) }, [])
  const resolutionRate =
    kpis.totalTickets > 0 ? Math.round((kpis.resolvedTickets / kpis.totalTickets) * 100) : 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard
        title="Total Tickets"
        value={kpis.totalTickets}
        iconName="Ticket"
        delay={0}
      />
      <StatCard
        title="Resolution Rate"
        value={`${resolutionRate}%`}
        iconName="BarChart3"
        delay={1}
      />
      <StatCard
        title="Average Resolution Time"
        value={`${kpis.avgResolutionHours}h`}
        iconName="Timer"
        delay={2}
      />
    </div>
  )
}

export const AnalyticsKpiStrip = memo(AnalyticsKpiStripBase)
