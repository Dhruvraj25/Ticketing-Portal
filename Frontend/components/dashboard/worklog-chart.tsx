'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { format, parseISO } from 'date-fns'

interface WorklogChartProps {
  chartData: { date: string; Billable: number; 'Non-billable': number }[]
}

function fmtMins(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border border-border/50 rounded-lg p-3 text-sm shadow-lg">
      <p className="font-medium text-foreground mb-1">
        {label ? format(parseISO(label), 'EEE, MMM d') : ''}
      </p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.fill }} className="text-xs">
          {p.name}: {fmtMins(p.value)}
        </p>
      ))}
    </div>
  )
}

export function WorklogChart({ chartData }: WorklogChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} barSize={14} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => format(parseISO(v), 'MMM d')}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmtMins}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="Billable" stackId="a" fill="var(--color-primary)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="Non-billable" stackId="a" fill="var(--color-muted)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
