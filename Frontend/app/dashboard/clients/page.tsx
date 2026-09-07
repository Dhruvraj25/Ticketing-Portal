import { PageTimer } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'
import { getManageableClients } from '@/app/actions/client-notification-preferences'
import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { ClientsManagementClient } from '@/components/dashboard/clients-management-client'

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
  const clients = await getManageableClients()

  pageTimer.mark('Render')
  pageTimer.finish()

  return (
    <div className="space-y-6">
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
        <PageHeader
          title="Client Management"
          subtitle={
            user.role === 'project_manager'
              ? 'Clients assigned to the projects you manage. Select a client to manage their notification preferences.'
              : 'Select a client to manage their notification preferences.'
          }
          icon={<Building2 className="h-5 w-5" />}
          iconVariant="cyan"
          badge={`${user.role === 'admin' ? 'Admin' : 'Manager'}`}
        />
      </div>
      <ClientsManagementClient clients={clients} role={user.role} />
    </div>
  )
}
