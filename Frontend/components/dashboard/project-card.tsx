'use client'

import { memo } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { stripHtml } from '@/lib/format'
import { Layers, Ticket, Users } from 'lucide-react'
import type { ProjectWithRelations } from '@/lib/types'
import { PROJECT_STATUS_CONFIG } from '@/lib/types'

interface ProjectCardProps {
  project: ProjectWithRelations
  index?: number
}

export const ProjectCard = memo(function ProjectCard({ project, index = 0 }: ProjectCardProps) {
  const statusConfig = PROJECT_STATUS_CONFIG[project.status]
  const progress = project.ticketCount ? Math.min(Math.round((project.ticketCount / 20) * 100), 100) : 0

  return (
    <div
      className="animate-fade-in-up group"
      style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
    >
      <Link href={`/dashboard/projects/${project.id}`} className="block">
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 card-shadow hover:card-shadow-hover transition-all duration-200 group">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-mono text-muted-foreground">
                  {project.projectCode}
                </span>
                <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', statusConfig.color)}>
                  {statusConfig.label}
                </span>
              </div>

              <h3 className="font-semibold text-foreground group-hover:text-neutral-700 transition-colors truncate">
                {project.projectName}
              </h3>

              {project.description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                  {stripHtml(project.description)}
                </p>
              )}
            </div>

            {/* Progress ring */}
            <div className="relative shrink-0 w-12 h-12">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18" cy="18" r="15.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-muted"
                />
                <circle
                  cx="18" cy="18" r="15.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={`${progress * 0.97} 100`}
                  className="text-foreground"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] font-semibold text-foreground">{progress}%</span>
              </div>
            </div>
          </div>

          {/* Meta footer */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {project.clientName && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {project.clientName}
              </span>
            )}
            {project.managerName && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {project.managerName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {project.moduleCount ?? 0} modules
            </span>
            <span className="flex items-center gap-1">
              <Ticket className="h-3 w-3" />
              {project.ticketCount ?? 0} tickets
            </span>
          </div>
        </div>
      </Link>
    </div>
  )
})
