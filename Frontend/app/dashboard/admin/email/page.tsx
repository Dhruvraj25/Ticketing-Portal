import { getCurrentUser } from '@/app/actions/tickets'
import { redirect } from 'next/navigation'
import { Mail } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/page-header-server'
import {
  getEmailOverview,
  getEmailProviderStatus,
  getEmailSenderConfig,
  getEmailLogsAdmin,
  getEmailTemplates,
  getEmailEventTypes,
  getEmailLiveQueue,
} from '@/app/actions/email-admin'
import { EmailManagementClient } from './email-management-client'

export default async function AdminEmailManagementPage() {
  // Admin only — same gate as Admin → Microsoft Teams. The backend re-verifies
  // the ADMIN role on every /api/email-admin call as well.
  const user = await getCurrentUser()
  if (user.role !== 'admin') redirect('/dashboard')

  const [overview, provider, sender, recent, templates, eventTypes, liveQueue] = await Promise.all([
    getEmailOverview('7d'),
    getEmailProviderStatus(),
    getEmailSenderConfig(),
    getEmailLogsAdmin({ limit: 30 }),
    getEmailTemplates(),
    getEmailEventTypes(),
    getEmailLiveQueue(),
  ])

  return (
    <div className="space-y-6" data-tour="email-management">
      {/* Same header card as Client Management (dashboard/clients/page.tsx). */}
      <div data-tour="email-header" className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
        <PageHeader
          title="Email Management"
          subtitle="Manage email delivery, sender configuration, templates, notifications and email activity."
          icon={<Mail className="h-5 w-5" />}
          iconVariant="blue"
          badge="Admin"
        />
      </div>
      <EmailManagementClient
        initial={{ overview, provider, sender, recent, templates, eventTypes, liveQueue }}
      />
    </div>
  )
}
