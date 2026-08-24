import { memo } from 'react'
import { Ticket, AlertCircle, Clock, CheckCircle2, Users, FolderKanban, Timer, BarChart3, TrendingUp, Activity } from 'lucide-react'

const ICON_MAP: Record<string, React.ElementType> = {
  Ticket, AlertCircle, Clock, CheckCircle2, Users, FolderKanban, Timer, BarChart3, TrendingUp, Activity,
}

// Semantic KPI colors with dark-mode variants (preserve light palette, dim in dark)
const KPI_COLORS: Record<string, { bg: string; icon: string; border: string }> = {
  'total tickets': { bg: 'bg-blue-100 dark:bg-blue-500/20', icon: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500' },
  'open tickets': { bg: 'bg-amber-100 dark:bg-amber-500/20', icon: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500' },
  'resolved tickets': { bg: 'bg-emerald-100 dark:bg-emerald-500/20', icon: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500' },
  'in progress': { bg: 'bg-indigo-100 dark:bg-indigo-500/20', icon: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-500' },
  'total hours': { bg: 'bg-purple-100 dark:bg-purple-500/20', icon: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500' },
  'billable hours': { bg: 'bg-emerald-100 dark:bg-emerald-500/20', icon: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500' },
  'non-billable hours': { bg: 'bg-gray-100 dark:bg-slate-800', icon: 'text-gray-500 dark:text-slate-400', border: 'border-gray-400' },
  'total projects': { bg: 'bg-blue-100 dark:bg-blue-500/20', icon: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500' },
  'total clients': { bg: 'bg-emerald-100 dark:bg-emerald-500/20', icon: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500' },
  'total developers': { bg: 'bg-emerald-100 dark:bg-emerald-500/20', icon: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500' },
  'total users': { bg: 'bg-blue-100 dark:bg-blue-500/20', icon: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500' },
}

function getKpiColor(key: string) {
  const lookup = key.toLowerCase().trim()
  if (KPI_COLORS[lookup]) return KPI_COLORS[lookup]
  // Fallback: derive from key hash
  const colors = [
    { bg: 'bg-blue-100 dark:bg-blue-500/20', icon: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500' },
    { bg: 'bg-emerald-100 dark:bg-emerald-500/20', icon: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500' },
    { bg: 'bg-amber-100 dark:bg-amber-500/20', icon: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500' },
    { bg: 'bg-indigo-100 dark:bg-indigo-500/20', icon: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-500' },
    { bg: 'bg-purple-100 dark:bg-purple-500/20', icon: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500' },
    { bg: 'bg-pink-100 dark:bg-pink-500/20', icon: 'text-pink-600 dark:text-pink-400', border: 'border-pink-500' },
    { bg: 'bg-gray-100 dark:bg-slate-800', icon: 'text-gray-500 dark:text-slate-400', border: 'border-gray-400' },
    { bg: 'bg-cyan-100 dark:bg-cyan-500/20', icon: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-500' },
    { bg: 'bg-orange-100 dark:bg-orange-500/20', icon: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500' },
    { bg: 'bg-violet-100 dark:bg-violet-500/20', icon: 'text-violet-600 dark:text-violet-400', border: 'border-violet-500' },
  ]
  const hash = key.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return colors[hash % colors.length]
}

interface ReportSummaryCardsProps {
  summary: Record<string, string | number>
}

export const ReportSummaryCards = memo(function ReportSummaryCards({ summary }: ReportSummaryCardsProps) {
  const entries = Object.entries(summary)
  if (entries.length === 0) return null

  const icons = ['Ticket', 'CheckCircle2', 'Clock', 'AlertCircle', 'Users', 'FolderKanban', 'Timer', 'BarChart3', 'TrendingUp', 'Activity']

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {entries.map(([key, value], i) => {
        const Icon = ICON_MAP[icons[i % icons.length]] || Activity
        const kpiColor = getKpiColor(key)
        return (
          <div
            key={key}
            className={`rounded-xl bg-white dark:bg-slate-900 border border-border border-l-4 p-4 card-shadow transition-all duration-200 ${kpiColor.border}`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center justify-center h-9 w-9 rounded-lg shrink-0 ${kpiColor.bg}`}
              >
                <Icon className={`h-4 w-4 ${kpiColor.icon}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{key}</p>
                <p className="text-lg font-bold text-foreground tabular-nums mt-0.5">
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
})
