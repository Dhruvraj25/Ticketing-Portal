import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Bell, Users, Info } from 'lucide-react'
import { PageTimer } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'
import { getProjectById, getProjectClientUsers } from '@/app/actions/projects'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { ProjectNotificationPreferencesSection } from '@/components/dashboard/project-notification-preferences-section'

export const dynamic = 'force-dynamic'

export default async function ProjectNotificationPreferencesPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const pageTimer = new PageTimer('Project Notification Preferences Page')
  const { projectId: projectIdParam } = await params
  const projectId = Number.parseInt(projectIdParam, 10)
  if (!Number.isFinite(projectId) || projectId <= 0) notFound()

  pageTimer.mark('Authentication')
  const user = await getCurrentUser()

  // Only Admin and Project Manager reach project notification management —
  // a client must never be able to view or modify these settings.
  if (user.role !== 'admin' && user.role !== 'project_manager') {
    redirect('/dashboard')
  }

  pageTimer.mark('Data Fetching')
  // getProjectById re-enforces the real authorization rule (Admin → any
  // project, Project Manager → only projects they manage via managerId) —
  // the same scope the backend's notification-preferences PUT endpoint
  // requires, so a manager can never land on a project they cannot save to.
  let project: Awaited<ReturnType<typeof getProjectById>>
  let clientAccounts: Awaited<ReturnType<typeof getProjectClientUsers>> = []
  try {
    const [projectData, clients] = await Promise.all([
      getProjectById(projectId),
      getProjectClientUsers(projectId),
    ])
    project = projectData
    clientAccounts = clients
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (/not found|Access denied/i.test(msg)) {
      notFound()
    }
    throw err
  }

  pageTimer.mark('Render')
  pageTimer.finish()

  return (
    <>
      <Link
        href="/dashboard/clients"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Clients
      </Link>
      <div className="space-y-6">
        <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
          <PageHeader
            title="Notification Preferences"
            subtitle={`Manage notification preferences shared by every client account on ${project.projectName}.`}
            icon={<Bell className="h-5 w-5" />}
            iconVariant="cyan"
            breadcrumbs={[
              { label: 'Clients', href: '/dashboard/clients' },
              { label: project.projectName, href: `/dashboard/clients/projects/${projectId}/notification-preferences` },
            ]}
          />
        </div>

        {/* Project + Client Accounts summary */}
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-border/70 card-shadow p-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Project</p>
          <p className="text-lg font-semibold text-foreground mb-4">{project.projectName}</p>

          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
            <Users className="h-3 w-3" />
            Client Accounts ({clientAccounts.length})
          </p>
          {clientAccounts.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-4">
              {clientAccounts.map(c => (
                <span
                  key={c.id}
                  className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs bg-muted/30 border border-border/50 text-foreground"
                >
                  {c.name}
                  <span className="text-muted-foreground ml-1.5">({c.email})</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 mb-4">No client accounts are assigned to this project yet.</p>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 px-3 py-2.5">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              These notification settings apply to all client accounts assigned to this project. There are no
              separate settings per individual client — a new client added to this project automatically follows
              these settings.
            </p>
          </div>
        </div>

        {/* key={projectId} remounts the editor on project switch so no stale
            preferences from the previously selected project can ever render. */}
        <ProjectNotificationPreferencesSection key={projectId} projectId={projectId} />
      </div>
    </>
  )
}
