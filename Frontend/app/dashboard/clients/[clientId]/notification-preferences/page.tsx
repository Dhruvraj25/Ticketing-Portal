import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Bell } from 'lucide-react'
import { PageTimer } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'
import {
  getClientNotificationPreferences,
  getManageableClients,
} from '@/app/actions/client-notification-preferences'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { ClientNotificationPreferences } from '@/components/dashboard/client-notification-preferences'

export const dynamic = 'force-dynamic'

export default async function ClientNotificationPreferencesPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const pageTimer = new PageTimer('Client Notification Preferences Page')
  const { clientId } = await params
  if (!clientId) notFound()

  pageTimer.mark('Authentication')
  const user = await getCurrentUser()

  // Only Admin and Project Manager reach client notification management.
  if (user.role !== 'admin' && user.role !== 'project_manager') {
    redirect('/dashboard')
  }

  pageTimer.mark('Data Fetching')
  // The client switcher + authorization checks both derive from the manageable
  // client list. A manager who is not authorized for this client is sent back
  // to the list (the server actions re-enforce the same rule).
  let clients: Awaited<ReturnType<typeof getManageableClients>> = []
  let initialData: Awaited<ReturnType<typeof getClientNotificationPreferences>> | null = null
  try {
    const [managed, prefs] = await Promise.all([
      getManageableClients(),
      getClientNotificationPreferences(clientId),
    ])
    clients = managed
    initialData = prefs
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (/Client not found|Access denied|can only be managed for client accounts/i.test(msg)) {
      // Client missing or the signed-in user is not authorized for it.
      notFound()
    }
    // Anything else (e.g. preferences table not migrated yet) — surface the
    // real failure so the operator sees the exact message.
    throw err
  }

  if (!initialData) notFound()

  const selected = clients.find(c => c.id === clientId)
  if (user.role === 'project_manager' && !selected) {
    // Manager must not manage an unauthorized client.
    redirect('/dashboard/clients')
  }

  pageTimer.mark('Render')
  pageTimer.finish()

  return (
    <div className="space-y-6">
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
        <Link
          href="/dashboard/clients"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Clients
        </Link>
        <PageHeader
          title="Notification Preferences"
          subtitle={`Manage notification preferences for ${initialData.client.name} — Email, Teams, and In-App channels per event.`}
          icon={<Bell className="h-5 w-5" />}
          iconVariant="cyan"
          breadcrumbs={[
            { label: 'Clients', href: '/dashboard/clients' },
            { label: initialData.client.name, href: `/dashboard/clients/${clientId}/notification-preferences` },
          ]}
        />
      </div>

      {/* key={clientId} remounts the editor on client switch so no stale
          preferences from the previously selected client can ever render. */}
      <ClientNotificationPreferences
        key={clientId}
        clients={clients}
        clientId={clientId}
        initialData={initialData}
      />
    </div>
  )
}
