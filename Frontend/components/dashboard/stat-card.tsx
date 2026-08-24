'use client'

import { cn } from '@/lib/utils'
import { memo, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import {
  Ticket, AlertCircle, Clock, CheckCircle2, FolderKanban, Layers, Users,
  Briefcase, Code2, UserCog, Wallet, FileText, BarChart3, Search,
  RefreshCw, ListChecks, ClipboardList, DollarSign, TrendingUp, Activity,
  Target, XCircle, AlertTriangle,
} from 'lucide-react'

// ─── Color theme configuration ─────────────────────────────────────────────

export type KpiColorTheme =
  | 'blue' | 'emerald' | 'purple' | 'orange' | 'cyan'
  | 'indigo' | 'amber' | 'violet' | 'green' | 'red' | 'gray'

interface KpiTheme {
  bg: string
  iconBg: string
  iconColor: string
  btnBg: string
  btnHoverBg: string
  btnText: string
  accent: string
}

const THEME_MAP: Record<KpiColorTheme, KpiTheme> = {
  blue:     { bg: 'bg-white dark:bg-slate-900', iconBg: 'bg-blue-100 dark:bg-blue-500/20', iconColor: 'text-blue-600 dark:text-blue-400', btnBg: 'bg-blue-50 dark:bg-blue-500/10', btnHoverBg: 'hover:bg-blue-100 dark:hover:bg-blue-500/20', btnText: 'text-blue-700 dark:text-blue-300', accent: 'border-blue-200 dark:border-blue-500/30' },
  emerald:  { bg: 'bg-white dark:bg-slate-900', iconBg: 'bg-emerald-100 dark:bg-emerald-500/20', iconColor: 'text-emerald-600 dark:text-emerald-400', btnBg: 'bg-emerald-50 dark:bg-emerald-500/10', btnHoverBg: 'hover:bg-emerald-100 dark:hover:bg-emerald-500/20', btnText: 'text-emerald-700 dark:text-emerald-300', accent: 'border-emerald-200 dark:border-emerald-500/30' },
  purple:   { bg: 'bg-white dark:bg-slate-900', iconBg: 'bg-purple-100 dark:bg-purple-500/20', iconColor: 'text-purple-600 dark:text-purple-400', btnBg: 'bg-purple-50 dark:bg-purple-500/10', btnHoverBg: 'hover:bg-purple-100 dark:hover:bg-purple-500/20', btnText: 'text-purple-700 dark:text-purple-300', accent: 'border-purple-200 dark:border-purple-500/30' },
  orange:   { bg: 'bg-white dark:bg-slate-900', iconBg: 'bg-orange-100 dark:bg-orange-500/20', iconColor: 'text-orange-600 dark:text-orange-400', btnBg: 'bg-orange-50 dark:bg-orange-500/10', btnHoverBg: 'hover:bg-orange-100 dark:hover:bg-orange-500/20', btnText: 'text-orange-700 dark:text-orange-300', accent: 'border-orange-200 dark:border-orange-500/30' },
  cyan:     { bg: 'bg-white dark:bg-slate-900', iconBg: 'bg-cyan-100 dark:bg-cyan-500/20', iconColor: 'text-cyan-600 dark:text-cyan-400', btnBg: 'bg-cyan-50 dark:bg-cyan-500/10', btnHoverBg: 'hover:bg-cyan-100 dark:hover:bg-cyan-500/20', btnText: 'text-cyan-700 dark:text-cyan-300', accent: 'border-cyan-200 dark:border-cyan-500/30' },
  indigo:   { bg: 'bg-white dark:bg-slate-900', iconBg: 'bg-indigo-100 dark:bg-indigo-500/20', iconColor: 'text-indigo-600 dark:text-indigo-400', btnBg: 'bg-indigo-50 dark:bg-indigo-500/10', btnHoverBg: 'hover:bg-indigo-100 dark:hover:bg-indigo-500/20', btnText: 'text-indigo-700 dark:text-indigo-300', accent: 'border-indigo-200 dark:border-indigo-500/30' },
  amber:    { bg: 'bg-white dark:bg-slate-900', iconBg: 'bg-amber-100 dark:bg-amber-500/20', iconColor: 'text-amber-600 dark:text-amber-400', btnBg: 'bg-amber-50 dark:bg-amber-500/10', btnHoverBg: 'hover:bg-amber-100 dark:hover:bg-amber-500/20', btnText: 'text-amber-700 dark:text-amber-300', accent: 'border-amber-200 dark:border-amber-500/30' },
  violet:   { bg: 'bg-white dark:bg-slate-900', iconBg: 'bg-violet-100 dark:bg-violet-500/20', iconColor: 'text-violet-600 dark:text-violet-400', btnBg: 'bg-violet-50 dark:bg-violet-500/10', btnHoverBg: 'hover:bg-violet-100 dark:hover:bg-violet-500/20', btnText: 'text-violet-700 dark:text-violet-300', accent: 'border-violet-200 dark:border-violet-500/30' },
  green:    { bg: 'bg-white dark:bg-slate-900', iconBg: 'bg-green-100 dark:bg-green-500/20', iconColor: 'text-green-600 dark:text-green-400', btnBg: 'bg-green-50 dark:bg-green-500/10', btnHoverBg: 'hover:bg-green-100 dark:hover:bg-green-500/20', btnText: 'text-green-700 dark:text-green-300', accent: 'border-green-200 dark:border-green-500/30' },
  red:      { bg: 'bg-white dark:bg-slate-900', iconBg: 'bg-red-100 dark:bg-red-500/20', iconColor: 'text-red-600 dark:text-red-400', btnBg: 'bg-red-50 dark:bg-red-500/10', btnHoverBg: 'hover:bg-red-100 dark:hover:bg-red-500/20', btnText: 'text-red-700 dark:text-red-300', accent: 'border-red-200 dark:border-red-500/30' },
  gray:     { bg: 'bg-white dark:bg-slate-900', iconBg: 'bg-gray-100 dark:bg-slate-800', iconColor: 'text-gray-500 dark:text-slate-400', btnBg: 'bg-gray-50 dark:bg-slate-800/50', btnHoverBg: 'hover:bg-gray-100 dark:hover:bg-slate-800', btnText: 'text-gray-600 dark:text-slate-400', accent: 'border-gray-200 dark:border-slate-800' },
}

// ─── Title → Theme mapping ─────────────────────────────────────────────────

const TITLE_THEME_MAP: Record<string, KpiColorTheme> = {
  'total tickets': 'blue',
  'open': 'amber',
  'open tickets': 'amber',
  'in progress': 'indigo',
  'resolved': 'green',
  'closed': 'emerald',
  'closed tickets': 'emerald',
  'projects': 'emerald',
  'total projects': 'emerald',
  'active projects': 'emerald',
  'modules': 'purple',
  'team': 'orange',
  'team members': 'orange',
  'users': 'blue',
  'total users': 'blue',
  'clients': 'green',
  'developers': 'emerald',
  'managers': 'blue',
  'support wallet': 'cyan',
  'support hours': 'cyan',
  'reports': 'indigo',
  'analytics': 'violet',
  'reviews': 'amber',
  'pending reviews': 'amber',
  'pending': 'red',
  'pending estimate approvals': 'red',
  'pending requested for revision': 'violet',
  'pending revisions': 'violet',
  'assignments': 'orange',
  'worklogs': 'purple',
  'billable': 'emerald',
  'non-billable': 'blue',
  'hours': 'purple',
  'total hours': 'blue',
  'total logged': 'emerald',
  'total employee hours': 'purple',
  'tickets worked': 'blue',
  'avg resolution': 'indigo',
  'resolution rate': 'blue',
}

function getTheme(title: string): KpiTheme {
  const key = title.toLowerCase().trim()
  const themeName = TITLE_THEME_MAP[key] || 'blue'
  return THEME_MAP[themeName] || THEME_MAP.blue
}

// ─── Title → Lucide Icon mapping ──────────────────────────────────────────

const ICON_LOOKUP: Record<string, LucideIcon> = {
  'total tickets': Ticket,
  'ticket': Ticket,
  'tickets': Ticket,
  'open': AlertCircle,
  'open tickets': AlertCircle,
  'in progress': Clock,
  'resolved': CheckCircle2,
  'closed': CheckCircle2,
  'closed tickets': CheckCircle2,
  'projects': FolderKanban,
  'total projects': FolderKanban,
  'active projects': FolderKanban,
  'modules': Layers,
  'team': Users,
  'team members': Users,
  'users': Users,
  'total users': Users,
  'clients': Briefcase,
  'developers': Code2,
  'managers': UserCog,
  'support wallet': Wallet,
  'support hours': Clock,
  'reports': FileText,
  'analytics': BarChart3,
  'reviews': Search,
  'pending reviews': Search,
  'pending': Clock,
  'pending estimate approvals': Clock,
  'pending requested for revision': RefreshCw,
  'pending revisions': RefreshCw,
  'assignments': ListChecks,
  'worklogs': ClipboardList,
  'billable': DollarSign,
  'non-billable': FileText,
  'hours': Clock,
  'total hours': Clock,
  'total logged': Clock,
  'total employee hours': Clock,
  'tickets worked': Ticket,
  'avg resolution': TrendingUp,
  'resolution rate': Target,
  'active': Activity,
  'completed': CheckCircle2,
  // Direct icon name lookups for iconName prop
  'barchart3': BarChart3,
  'checkcircle2': CheckCircle2,
  'alertcircle': AlertCircle,
  'xcircle': XCircle,
  'layers': Layers,
  'briefcase': Briefcase,
  'alerttriangle': AlertTriangle,
  'refreshcw': RefreshCw,
  'clipboardlist': ClipboardList,
  'trendingup': TrendingUp,
  'wallet': Wallet,
  'clock': Clock,
  'folderkanban': FolderKanban,
  'filetext': FileText,
  'search': Search,
  'listchecks': ListChecks,
  'dollarsign': DollarSign,
  'code2': Code2,
  'usercog': UserCog,
}

function getIconComponent(title: string, iconOverride?: string): LucideIcon {
  // Try icon override first
  if (iconOverride) {
    const key = iconOverride.toLowerCase().trim()
    if (ICON_LOOKUP[key]) return ICON_LOOKUP[key]
  }
  // Fall back to title lookup
  const key = title.toLowerCase().trim()
  return ICON_LOOKUP[key] || BarChart3
}

// ─── Component Props ───────────────────────────────────────────────────────

interface KpiCardProps {
  title: string
  value: string | number
  icon?: string
  colorTheme?: KpiColorTheme
  reportLink?: string
  className?: string
}

export const KpiCard = memo(function KpiCard({
  title,
  value,
  icon,
  colorTheme,
  reportLink,
  className,
}: KpiCardProps) {

  const theme = colorTheme ? THEME_MAP[colorTheme] || THEME_MAP.blue : getTheme(title)
  const IconComponent = getIconComponent(title, icon)

  // ── Card Content (AI Studio style) ────────────────────────────────────
  const inner = (
    <div
      className={cn(
        'relative flex flex-col group rounded-2xl p-5 border transition-all',
        'bg-white border-slate-200/90 dark:bg-slate-900 dark:border-slate-800',
        reportLink && 'hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-700',
        'w-full',
        className,
      )}
    >
      {/* Header: Title (left) + Icon (right) */}
      <div className="flex justify-between items-start mb-3">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 truncate pr-2 leading-4">
          {title}
        </span>
        <div className={cn(
          'flex items-center justify-center w-9 h-9 rounded-md shrink-0 shadow-sm',
          theme.iconBg,
        )}>
          <IconComponent className={cn('h-6 w-6', theme.iconColor)} />
        </div>
      </div>
      {/* Value + report arrow */}
      <div className="flex items-end justify-between gap-1">
        <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 leading-none tracking-tight">
          {value}
        </h3>
        {reportLink && (
          <ArrowRight className="h-4 w-4 text-slate-800 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400 transition-colors shrink-0" />
        )}
      </div>
    </div>
  )

  if (reportLink) {
    return (
      <Link href={reportLink} tabIndex={0} aria-label={`View report for ${title}`}>
        {inner}
      </Link>
    )
  }

  return inner
})

// ─── Backward-compatible StatCard (delegates to KpiCard) ───────────────────

interface StatCardProps {
  title: string
  value: string | number
  iconName?: string
  colorTheme?: KpiColorTheme
  className?: string
  href?: string
  delay?: number
  children?: ReactNode
}

export const StatCard = memo(function StatCard({
  title,
  value,
  iconName,
  colorTheme,
  href,
  className,
}: StatCardProps) {
  return (
    <KpiCard
      title={title}
      value={value}
      icon={iconName}
      colorTheme={colorTheme}
      reportLink={href}
      className={className}
    />
  )
})
