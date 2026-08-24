import Link from 'next/link'
import { cn } from '@/lib/utils'
import { CurrentDate } from './page-header'
import { PageHeaderIcon, type PageHeaderIconVariant } from './page-header-icon'

interface PageHeaderProps {
  title: string
  subtitle: string
  actions?: React.ReactNode
  icon?: React.ReactNode
  iconVariant?: PageHeaderIconVariant
  breadcrumbs?: { label: string; href?: string }[]
  badge?: React.ReactNode
  className?: string
}

// Re-export CurrentDate from the client component for convenience
export { CurrentDate } from './page-header'

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  iconVariant = 'blue',
  breadcrumbs,
  badge,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn',
        className
      )}
    >
      <div className="flex items-center gap-3">
        {icon && <PageHeaderIcon variant={iconVariant}>{icon}</PageHeaderIcon>}
        <div className="space-y-1">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400 mb-1">
              {breadcrumbs.map((crumb, index) => (
                <span key={index} className="flex items-center gap-1.5">
                  {index > 0 && <span className="text-slate-400 dark:text-slate-600">/</span>}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-slate-800 dark:text-slate-200 font-medium">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              {title}
            </h1>
            {badge && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono leading-relaxed flex items-center gap-1.5">
              <span className="text-amber-500/80 dark:text-amber-400/80 font-mono">✨</span>
              <span>{subtitle}</span>
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-3 self-start sm:self-center">
          {actions}
        </div>
      )}
    </div>
  )
}
