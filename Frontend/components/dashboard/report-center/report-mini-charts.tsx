'use client'

// framer-motion removed — replaced with CSS transition + animation-delay
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { format, parseISO } from 'date-fns'

const CHART_COLORS = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#6B7280', '#8B5CF6', '#EC4899', '#14B8A6']

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-900 border border-border rounded-lg p-2.5 text-xs shadow-md">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-medium">
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  )
}

interface ChartData {
  type: 'line' | 'bar' | 'pie'
  title: string
  data: { name: string; value: number }[]
}

interface ReportMiniChartsProps {
  charts: ChartData[]
}

export function ReportMiniCharts({ charts }: ReportMiniChartsProps) {
  if (!charts || charts.length === 0) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {charts.map((chart, i) => (
        <div
          key={i}
          className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 card-shadow animate-fade-in-up"
          style={{ animationDelay: `${i * 0.1}s` }}
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">{chart.title}</h3>
          {chart.data.length === 0 ? (
            <div className="h-48 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No data</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              {chart.type === 'pie' ? (
                <PieChart>
                  <Pie
                    data={chart.data}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {chart.data.map((_, j) => (
                      <Cell key={j} fill={CHART_COLORS[j % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              ) : chart.type === 'line' ? (
                <LineChart data={chart.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <BarChart data={chart.data} barSize={24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" fill="#3B82F6" radius={[3, 3, 0, 0]}>
                    {chart.data.map((_, j) => (
                      <Cell key={j} fill={CHART_COLORS[j % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      ))}
    </div>
  )
}
