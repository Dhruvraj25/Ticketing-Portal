import { getCurrentUser } from '@/app/actions/tickets'
import { getUserRoleCounts } from '@/app/actions/admin'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { BrandingSettings } from '@/components/dashboard/branding-settings'
import { PageTimer } from '@/lib/performance-profiler'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Users, UserCog, Building2, Code2, Shield } from 'lucide-react'
import { StatCard } from '@/components/dashboard/stat-card'

export default async function AdminPage() {
  const pageTimer = new PageTimer('Admin Page')
  pageTimer.mark('Authentication')
  const user = await getCurrentUser()

  if (user.role !== 'admin') {
    redirect('/dashboard')
  }

  pageTimer.mark('Data Fetching')
  const [roleCounts] = await Promise.all([
    getUserRoleCounts(),
  ])

  pageTimer.mark('Render')
  pageTimer.finish()

  return (
    <div className="space-y-8" data-tour="system-settings">
      <div data-tour="admin-header">
      <PageHeader
          title="System Overview"
          subtitle="User management and system-wide administration"
          icon={<Shield className="h-5 w-5" />}
          iconVariant="slate"
        />
      </div>
      <div className="space-y-8">
        {/* Branding Settings */}
        <div data-tour="admin-branding">
          <BrandingSettings />
        </div>

        {/* User Statistics */}
        <div data-tour="admin-user-stats" className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">User Statistics</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              title="Total Users"
              value={roleCounts.total}
              iconName="Users"
              delay={0}
            />
            <StatCard
              title="Admins"
              value={roleCounts.admins}
              iconName="Shield"
              delay={1}
            />
            <StatCard
              title="Managers"
              value={roleCounts.project_managers}
              iconName="Users"
              delay={2}
            />
            <StatCard
              title="Developers"
              value={roleCounts.developers}
              iconName="Code2"
              delay={3}
            />
            <StatCard
              title="Clients"
              value={roleCounts.clients}
              iconName="Building2"
              delay={4}
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div data-tour="admin-quick-actions" className="flex items-center gap-4">
          <Link href="/dashboard/admin/users">
            <Button size="default" className="gap-2">
              <UserCog className="h-4 w-4" />
              Manage Users
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
