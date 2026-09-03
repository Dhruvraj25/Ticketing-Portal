import { PageTimer } from '@/lib/performance-profiler'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/app/actions/tickets'
import { getUserList } from '@/app/actions/users'
import { getProjectById, getProjectDevelopers, getProjectDetailAnalytics, getModuleAnalytics } from '@/app/actions/projects'
import { getModulesByProject } from '@/app/actions/modules'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/dashboard/stat-card'
import { WorkspaceContainer } from '@/components/dashboard/workspace-container'
import { cn } from '@/lib/utils'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { stripHtml } from '@/lib/format'
import { format } from 'date-fns'
import { ArrowLeft, FolderKanban, Users, Calendar, Ticket, Layers, Edit, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import { PROJECT_STATUS_CONFIG } from '@/lib/types'
import { ModuleManager } from '@/components/dashboard/module-manager'
import { ProjectStats } from '@/components/dashboard/project-stats'
import { ProjectAssignmentPanel } from '@/components/dashboard/project-assignment-panel'
import { DeveloperAssignment } from '@/components/dashboard/developer-assignment'
import { ProjectAnalyticsSection } from '@/components/dashboard/project-analytics-section'

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const projectId = parseInt(id)
  const pageTimer = new PageTimer('Project Detail')

  if (isNaN(projectId)) notFound()

  pageTimer.mark('Authentication & Data Fetching')
  try {
    // Fetch all data in parallel — analytics now rendered server-side
    const [user, project, modules] = await Promise.all([
      getCurrentUser(),
      getProjectById(projectId),
      getModulesByProject(projectId),
    ])

    const isManagerOrAdmin = user.role === 'project_manager' || user.role === 'admin'
    const statusConfig = PROJECT_STATUS_CONFIG[project.status]

    // Fetch analytics server-side for instant rendering
    let analytics = null as any
    let moduleAnalytics: any[] = []
    if (isManagerOrAdmin) {
      try {
        const [detail, modData] = await Promise.all([
          getProjectDetailAnalytics(projectId),
          getModuleAnalytics(projectId),
        ])
        analytics = detail
        moduleAnalytics = modData
      } catch {
        // Analytics are non-critical
      }
    }

    let userList: { id: string; name: string; email: string; role: string }[] = []
    if (isManagerOrAdmin) {
      try { userList = await getUserList() } catch {}
    }

    // Reassignment dropdowns must only ever offer role-matching accounts:
    // Client select = client accounts only; Manager select = managers only.
    // Developers/admins/other roles are never shown.
    const clients = userList.filter((u) => u.role === 'client' && u.id !== project.clientId)
    const managers = userList.filter((u) => u.role === 'project_manager' && u.id !== project.managerId)

    pageTimer.mark('Render')
    pageTimer.finish()

    return (
      <div className="space-y-5">
        <WorkspaceContainer>
          <div data-tour="project-detail-header" className="flex items-start gap-4">
            <Link href="/dashboard/projects">
              <Button variant="ghost" size="icon" className="rounded-xl mt-1">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <PageHeaderIcon variant="blue">
              <FolderKanban className="h-5 w-5" />
            </PageHeaderIcon>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-sm font-mono text-muted-foreground">{project.projectCode}</span>
                <Badge variant="outline" className={cn('text-xs rounded-lg', statusConfig.color)}>{statusConfig.label}</Badge>
              </div>
              <div className="flex items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-foreground truncate">{project.projectName}</h1>
                {isManagerOrAdmin && (
                  <Link href={`/dashboard/projects/${projectId}/edit`}>
                    <Button variant="outline" size="sm" className="rounded-xl shrink-0">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </WorkspaceContainer>

        {/* Quick Stats */}
        <div data-tour="project-detail-stats" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Modules"
            value={project.moduleCount}
            iconName="Layers"
            delay={0}
          />
          <StatCard
            title="Tickets"
            value={project.ticketCount}
            iconName="Ticket"
            delay={1}
          />
          <StatCard
            title="Client"
            value={project.clientName || '—'}
            iconName="Users"
            delay={2}
            valueClassName="text-sm font-normal leading-snug break-words"
          />
          <StatCard
            title="Manager"
            value={project.managerName || '—'}
            iconName="Briefcase"
            delay={3}
            valueClassName="text-sm font-normal leading-snug break-words"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {project.description && (
              <div className="space-y-5">
               <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
    
                <h2 data-tour="project-detail-description" className="text-lg font-semibold text-foreground mb-4">Description</h2>
                <p className="text-muted-foreground whitespace-pre-wrap">{stripHtml(project.description)}</p>
                </div>
              </div>
              
            )}

            {isManagerOrAdmin && (
              <div data-tour="project-detail-stats-panel">
                <ProjectStats projectId={projectId} />
              </div>
            )}

            {isManagerOrAdmin && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <BarChart3 className="h-4 w-4 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">Analytics</h2>
                </div>
                <ProjectAnalyticsSection
                  projectId={projectId}
                  initialAnalytics={analytics}
                  initialModuleData={moduleAnalytics}
                />
              </div>
            )}

            <div className="space-y-5">
              <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
              <div data-tour="project-detail-modules" className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Layers className="h-4 w-4 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">Modules</h2>
                </div>
                <span className="text-sm text-muted-foreground">{modules.length} module{modules.length !== 1 ? 's' : ''}</span>
              </div>
              <div data-tour="module-manager">
                <ModuleManager projectId={projectId} initialModules={modules} canManage={isManagerOrAdmin} />
              </div>
            </div>
          </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
   
            <div data-tour="project-detail-info" className="rounded-2xl glass-panel p-5">
              <h3 className="font-semibold text-foreground mb-4">Project Details</h3>
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Client</span>
                  <span className="text-foreground font-normal truncate ml-2 max-w-[160px]">{project.clientName || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-purple-400" /> Manager</span>
                  <span className="text-foreground font-normal truncate ml-2 max-w-[160px]">{project.managerName || '—'}</span>
                </div>
                {project.startDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Start</span>
                    <span className="text-foreground">{format(new Date(project.startDate), 'MMM d, yyyy')}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="text-foreground">{format(new Date(project.createdAt), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </div>
            </div>

            {isManagerOrAdmin && userList.length > 0 && (
              <ProjectAssignmentPanel
                projectId={projectId}
                currentClientId={project.clientId}
                currentManagerId={project.managerId}
                clients={clients}
                managers={managers}
                canAssignClient={isManagerOrAdmin}
                canAssignManager={user.role === 'admin'}
              />
            )}

            {isManagerOrAdmin && <DeveloperAssignment projectId={projectId} />}

            <div data-tour="project-detail-actions" className="rounded-2xl glass-panel p-5">
              <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
              <h3 className="font-semibold text-foreground mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <Link href={`/dashboard/tickets/new?projectId=${projectId}`} className="block">
                  <Button variant="outline" size="sm" className="w-full justify-start rounded-xl">
                    <Ticket className="mr-2 h-4 w-4" />
                    Create Ticket
                  </Button>
                </Link>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    )
  } catch (error) {
    notFound()
  }
}
