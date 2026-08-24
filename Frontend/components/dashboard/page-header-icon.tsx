import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared page-header icon — the single visual treatment used by every
 * dashboard page header across the portal.
 *
 * Reference structure (Projects page):
 *   w-10 h-10 rounded-xl bg-{color}-100 dark:bg-{color}-500/20
 *   text-{color}-600 dark:text-{color}-400 flex items-center justify-center shrink-0
 *   + icon at h-5 w-5
 *
 * Pass a lucide icon element sized h-5 w-5, e.g.:
 *   <PageHeaderIcon variant="blue"><FolderKanban className="h-5 w-5" /></PageHeaderIcon>
 *
 * Dark mode: the same semantic icon color is retained with a translucent
 * (20% opacity) background, keeping contrast without washing out.
 */

export type PageHeaderIconVariant =
  | 'blue'
  | 'indigo'
  | 'purple'
  | 'green'
  | 'emerald'
  | 'teal'
  | 'orange'
  | 'amber'
  | 'red'
  | 'rose'
  | 'pink'
  | 'cyan'
  | 'slate'

const VARIANT_CLASSES: Record<PageHeaderIconVariant, string> = {
  blue: 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400',
  indigo: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400',
  purple: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400',
  green: 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400',
  emerald: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  teal: 'bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400',
  orange: 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400',
  amber: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400',
  red: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400',
  rose: 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400',
  pink: 'bg-pink-100 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400',
  cyan: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400',
  slate: 'bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-400',
}

export function PageHeaderIcon({
  children,
  variant = 'blue',
  className,
}: {
  children: ReactNode
  variant?: PageHeaderIconVariant
  className?: string
}) {
  return (
    <div
      className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {children}
    </div>
  )
}
