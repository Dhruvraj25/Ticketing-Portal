import { getCurrentUser } from '@/lib/auth-utils'
import { getConsolidatedDashboardData } from '@/app/actions/tickets'
import { ReportCenterClient } from './report-center-client'
import { ClientReportsView } from './client-reports-view'

// Role dispatch happens here, server-side, before anything renders — a
// client user's browser never even receives the admin/manager Report
// Center's markup or its full report-type list (defense in depth on top of
// the server-side checkAccess() enforcement in app/actions/reports/queries.ts,
// which is the real data-access gate either way).
export default async function ReportCenterPage() {
  const currentUser = await getCurrentUser()

  if (currentUser.role === 'client') {
    // Same cached, client-org-scoped stats the dashboard's KPI cards use
    // (getConsolidatedDashboardData) — reused here only for the 4 report
    // cards' displayed counts, no new query.
    const stats = await getConsolidatedDashboardData()
    return (
      <ClientReportsView
        stats={{
          totalTickets: stats.totalTickets,
          inProgressTickets: stats.inProgressTickets,
          clientReviewCount: stats.clientReviewCount,
          closedCount: stats.closedCount,
        }}
      />
    )
  }

  return <ReportCenterClient />
}
