'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Bell, ChevronRight, FolderKanban, Search, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ManageableProjectForNotifications } from '@/app/actions/client-notification-preferences'
import type { UserRole } from '@/lib/types'

interface ProjectsNotificationManagementClientProps {
  projects: ManageableProjectForNotifications[]
  role: UserRole
}

export function ProjectsNotificationManagementClient({ projects, role }: ProjectsNotificationManagementClientProps) {
  const [search, setSearch] = useState('')
  const isManager = role === 'project_manager'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      p =>
        p.projectName.toLowerCase().includes(q) ||
        p.projectCode.toLowerCase().includes(q) ||
        p.clientAccounts.some(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)),
    )
  }, [projects, search])

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden card-shadow p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <FolderKanban className="h-4 w-4 text-primary" />
            <span>
              <span className="font-medium text-foreground">{projects.length}</span> {projects.length === 1 ? 'project' : 'projects'}
              {isManager && ' you manage'}
            </span>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by project, code, client name or email..."
              className="pl-9 h-9 rounded-lg bg-muted/20 border-border/50"
            />
          </div>
        </div>
      </div>

      {/* Project list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 rounded-2xl bg-muted/30">
              <FolderKanban className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <p className="font-semibold text-foreground">
              {projects.length === 0
                ? isManager
                  ? 'No projects assigned to you yet'
                  : 'No projects yet'
                : 'No projects match your search'}
            </p>
            <p className="text-sm text-muted-foreground max-w-md">
              {projects.length === 0
                ? isManager
                  ? 'When you are assigned as the manager of a project, it will appear here and you can manage its client notification preferences.'
                  : 'Projects appear here. Select a project to manage the notification preferences shared by its client accounts.'
                : 'Try adjusting your search criteria.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(project => (
            <div
              key={project.id}
              data-tour="project-notification-card"
              className="rounded-xl bg-white dark:bg-slate-900 border border-border/70 card-shadow overflow-hidden flex flex-col"
            >
              <div className="p-5 flex-1">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <FolderKanban className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{project.projectName}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5 font-mono">{project.projectCode}</p>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 mt-2 rounded-full text-[10px] font-medium uppercase tracking-wide bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30">
                      <Users className="h-2.5 w-2.5" />
                      {project.clientAccounts.length} client {project.clientAccounts.length === 1 ? 'account' : 'accounts'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border/50">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                    <Users className="h-3 w-3" />
                    Client Accounts
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {project.clientAccounts.length > 0 ? (
                      project.clientAccounts.slice(0, 3).map(c => (
                        <span
                          key={c.id}
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-muted/30 border border-border/50 text-muted-foreground max-w-full"
                        >
                          <span className="truncate">{c.name}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground/60">No client accounts assigned yet</span>
                    )}
                    {project.clientAccounts.length > 3 && (
                      <span className="text-[11px] text-muted-foreground self-center">
                        +{project.clientAccounts.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-5 pb-5">
                <Button asChild variant="outline" className="w-full rounded-lg" size="sm">
                  <Link
                    href={`/dashboard/clients/projects/${project.id}/notification-preferences`}
                    className="flex items-center justify-center gap-2"
                  >
                    <Bell className="h-4 w-4 text-primary" />
                    Notification Preferences
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
