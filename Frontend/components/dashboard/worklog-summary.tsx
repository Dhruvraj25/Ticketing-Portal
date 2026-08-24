import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/dashboard/stat-card'
import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

interface DaySummary {
  date: string
  totalMinutes: number
  billableMinutes: number
}

interface TicketSummary {
  ticketId: number
  ticketNumber: string
  title: string
  totalMinutes: number
  billableMinutes: number
  entries: number
}

interface WorklogSummaryProps {
  data: {
    dailySummary: DaySummary[]
    byTicket: TicketSummary[]
    totalMinutes: number
    billableMinutes: number
  }
}

function fmtMins(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// Dynamically import the recharts chart component to reduce initial bundle size (~25KB)
const WorklogChart = dynamic<{
  chartData: { date: string; Billable: number; 'Non-billable': number }[]
}>(
  () => import('./worklog-chart').then((m) => m.WorklogChart),
  {
    loading: () => <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground animate-pulse">Loading chart...</div>,
  },
)

export function WorklogSummary({ data }: WorklogSummaryProps) {
  const { dailySummary, byTicket, totalMinutes, billableMinutes } = data
  const nonBillableMinutes = totalMinutes - billableMinutes
  const billablePct = totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0

  const chartData = dailySummary.map((d) => ({
    date: d.date,
    Billable: d.billableMinutes,
    'Non-billable': d.totalMinutes - d.billableMinutes,
  }))

  return (
    <div className="space-y-6">
      {/* KPI row with premium StatCards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Logged" value={fmtMins(totalMinutes)} iconName="Timer" delay={0} />
        <StatCard title="Billable" value={fmtMins(billableMinutes)} iconName="Ticket" delay={1} />
        <StatCard title="Non-billable" value={fmtMins(nonBillableMinutes)} iconName="Clock" delay={2} />
        <StatCard title="Billable Rate" value={`${billablePct}%`} iconName="TrendingUp" delay={3} />
      </div>

      {/* Daily bar chart — dynamically imported (recharts ~25KB) */}
      <Card className="p-5 bg-card/50 backdrop-blur-sm border-border/50">
        <h3 className="text-sm font-semibold text-foreground mb-4">Daily Hours (last 30 days)</h3>
        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No entries in this period</p>
          </div>
        ) : (
          <WorklogChart chartData={chartData} />
        )}
      </Card>

      {/* Per-ticket breakdown */}
      <Card className="p-5 bg-card/50 backdrop-blur-sm border-border/50">
        <h3 className="text-sm font-semibold text-foreground mb-4">Time by Ticket</h3>
        {byTicket.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">No time entries found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {byTicket.map((t) => {
              const pct = totalMinutes > 0 ? (t.totalMinutes / totalMinutes) * 100 : 0
              return (
                <div key={t.ticketId} className="group">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                        {t.ticketNumber}
                      </span>
                      <span className="text-sm text-foreground truncate">{t.title}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {t.billableMinutes > 0 && (
                        <Badge variant="outline" className="text-[11px] text-success border-success/30 py-0 h-5">
                          {fmtMins(t.billableMinutes)} billable
                        </Badge>
                      )}
                      <span className="text-sm font-medium text-foreground w-16 text-right">
                        {fmtMins(t.totalMinutes)}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
