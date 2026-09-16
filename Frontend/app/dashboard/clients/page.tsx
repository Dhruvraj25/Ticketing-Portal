import { PageTimer } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'
import { getManageableProjectsForNotifications } from '@/app/actions/client-notification-preferences'
import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { ProjectsNotificationManagementClient } from '@/components/dashboard/projects-notification-management-client'

export const dynamic = 'force-dynamic'

export default async function ClientsManagementPage() {
  const pageTimer = new PageTimer('Client Management Page')

  pageTimer.mark('Authentication')
  const user = await getCurrentUser()

  // Only Admin and Project Manager reach client notification management.
  if (user.role !== 'admin' && user.role !== 'project_manager') {
    redirect('/dashboard')
  }

  pageTimer.mark('Data Fetching')
  // Notification preferences are managed PROJECT-WISE for client accounts:
  // every client user assigned to a project shares that project's settings.
  // This page lists projects (not individual clients) as the entry point.
  const projects = await getManageableProjectsForNotifications()

  pageTimer.mark('Render')
  pageTimer.finish()

  return (
    <div className="space-y-6">
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
        <PageHeader
          title="Client Management"
          subtitle={
            user.role === 'project_manager'
              ? 'Projects you manage. Select a project to manage the notification preferences shared by its client accounts.'
              : 'Select a project to manage the notification preferences shared by its client accounts.'
          }
          icon={<Building2 className="h-5 w-5" />}
          iconVariant="cyan"
          badge={`${user.role === 'admin' ? 'Admin' : 'Support Manager'}`}
        />
      </div>
      <ProjectsNotificationManagementClient projects={projects} role={user.role} />
    </div>
  )
}
