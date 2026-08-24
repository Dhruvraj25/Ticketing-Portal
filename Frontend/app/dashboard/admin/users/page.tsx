import { PageTimer } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/app/actions/tickets'
import { getUsersPaginated, getUserRoleCounts } from '@/app/actions/admin'
import { redirect } from 'next/navigation'
import { UserCog, Users, Shield, Code2, Building2 } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/page-header-server'
import UserManagementTablePaginated from '@/components/dashboard/user-management-table-paginated'
import { StatCard } from '@/components/dashboard/stat-card'

export default async function AdminUsersPage() {
  const pageTimer = new PageTimer('Admin Users Page')

  pageTimer.mark('Authentication')
  const user = await getCurrentUser()

  if (user.role !== 'admin') {
    redirect('/dashboard')
  }

  pageTimer.mark('Data Fetching')
  const [initialData, roleCounts] = await Promise.all([
    getUsersPaginated({ page: 1, pageSize: 50 }),
    getUserRoleCounts(),
  ])

  pageTimer.mark('Render')
  pageTimer.finish()

  return (
    <div className="space-y-6" data-tour="users-table">
       <div data-tour="admin-users-header" className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
   
      <PageHeader
          title="User Management"
          subtitle="Manage user accounts and roles across the platform"
          icon={<UserCog className="h-5 w-5" />}
          iconVariant="cyan"
        />
        </div>
      <div className="space-y-6">
        <div data-tour="admin-users-kpis" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Users" value={roleCounts.total} iconName="Users" delay={0} />
          <StatCard title="Clients" value={roleCounts.clients} iconName="Building2" delay={1} />
          <StatCard title="Managers" value={roleCounts.project_managers} iconName="Users" delay={2} />
          <StatCard title="Developers" value={roleCounts.developers} iconName="Code2" delay={3} />
        </div>

        <div data-tour="admin-users-table" className="rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden card-shadow p-3">
          <UserManagementTablePaginated
            initialData={initialData}
            roleCounts={roleCounts}
            currentUserId={user.id}
          />
        </div>
      </div>
    </div>
  )
}
