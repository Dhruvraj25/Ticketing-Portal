import { Suspense } from 'react'
import { getDashboardCriticalData, getDashboardSidebarData } from '@/app/actions/dashboard'
import type {
  ConsolidatedStats,
  ProjectMetricsResult,
  SidebarDataResult,
  DashboardUser,
} from '@/app/actions/dashboard'
import { StatCard, type KpiColorTheme } from '@/components/dashboard/stat-card'
import { TicketStatus } from '@/lib/types'
import { TicketList } from '@/components/dashboard/ticket-card'
import { PageHeader, CurrentDate } from '@/components/dashboard/page-header-server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, ArrowRight, LayoutDashboard } from 'lucide-react'
import { SupportRenewalReminder } from '@/components/dashboard/support-renewal-reminder'

// ─── Loading Fallbacks ──────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="rounded-2xl bg-white dark:bg-slate-900 border border-border/60 p-5 shadow-sm animate-pulse">
          <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
          <div className="space-y-2">
            <div className="h-3 w-full bg-gray-100 dark:bg-slate-800 rounded" />
            <div className="h-3 w-3/4 bg-gray-100 dark:bg-slate-800 rounded" />
            <div className="h-8 w-full bg-gray-100 dark:bg-slate-800 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Critical Content (renders immediately, data pre-fetched) ───────────────

function StatsSection({ consolidatedStats, userRole }: { consolidatedStats: ConsolidatedStats; userRole: string }) {
  // Pending Revisions is only shown to internal roles (developer/resource, manager, admin).
  // The stats query is already role-filtered, so developers see their assigned revisions
  // while managers/admins see all revision-requested tickets. Clients never see this KPI.
  const canViewRevisions = userRole !== 'client'

  const cards: { title: string; value: number; href: string; iconName?: string; colorTheme?: KpiColorTheme }[] = [
    { title: 'Total Tickets', value: consolidatedStats.totalTickets, href: '/dashboard/reports/view?report=ticket_summary' },
    { title: 'Open', value: consolidatedStats.openTickets, href: '/dashboard/reports/view?report=ticket_status&status=open' },
    { title: 'In Progress', value: consolidatedStats.inProgressTickets, href: '/dashboard/reports/view?report=ticket_status&status=in_progress' },
    { title: 'Resolved', value: consolidatedStats.resolvedTickets, href: '/dashboard/reports/view?report=ticket_resolution' },
  ]
  // Always rendered for eligible roles — displays 0 when nothing is pending, never hidden.
  if (canViewRevisions) {
    cards.push({
      title: 'Pending Revisions',
      value: consolidatedStats.openRevisions,
      // Arrow relocates to the Report Center — revision-requests report
      // (ticket_summary honors the status filter and lists exactly the
      // revision-requested tickets; role filtering matches the KPI value).
      href: `/dashboard/reports/view?report=ticket_summary&status=${TicketStatus.REQUEST_FOR_REVISION}`,
      iconName: 'RefreshCw',
      colorTheme: 'violet',
    })
  }
  if (consolidatedStats.pendingEstimates > 0) {
    cards.push({ title: 'Pending Estimates', value: consolidatedStats.pendingEstimates, href: `/dashboard/tickets?status=${TicketStatus.ESTIMATE_PENDING}` })
  }

  // Grid columns adapt to the card count so there is no empty slot in the row.
  // Clients always get 4 cards (Pending Revisions is excluded), managers/admins
  // get 5, and 6 cards (pending estimates included) flow into 2 neat rows of 3.
  const kpiGridClass =
    cards.length >= 6
      ? 'sm:grid-cols-3 lg:grid-cols-3'
      : cards.length === 5
        ? 'sm:grid-cols-2 lg:grid-cols-5'
        : 'sm:grid-cols-2 lg:grid-cols-4'

  return (
    <div data-tour="dashboard-kpis" className={`grid grid-cols-1 gap-3 ${kpiGridClass}`}>
      {cards.map((card) => (
        <StatCard
          key={card.title}
          title={card.title}
          value={card.value}
          href={card.href}
          iconName={card.iconName}
          colorTheme={card.colorTheme}
        />
      ))}
    </div>
  )
}

// function ProjectMetricsSection({ projectMetrics }: { projectMetrics: ProjectMetricsResult | null }) {
//   if (!projectMetrics || projectMetrics.activeProjects === 0) return null
//   return (
//     <div className="space-y-3">
//       <h2 className="text-sm font-semibold text-foreground tracking-wide">Project Metrics</h2>
//       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
//         <StatCard title="Active Projects" value={projectMetrics.activeProjects} href="/dashboard/projects" />
//       </div>
//     </div>
//   )
// }

function RecentTicketsSection({
  recentTickets,
  userRole,
}: {
  recentTickets: any[]
  userRole: string
}) {
  return (
    <div data-tour="dashboard-recent-tickets" className="lg:col-span-2 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {userRole === 'client' ? 'Your Recent Tickets' : 'Recent Tickets'}
        </h2>
        <Link href="/dashboard/tickets">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>
      <TicketList
        tickets={recentTickets}
        showClient={userRole !== 'client'}
        showAssignee={userRole !== 'developer'}
        emptyMessage={userRole === 'client' ? "You haven't submitted any tickets yet" : "No tickets in your queue"}
      />
    </div>
  )
}

// ─── STREAMED: Sidebar Widgets (fetches data + component lazily via Suspense) ─

async function SidebarSection({ user }: { user: DashboardUser }) {
  // Defer loading the SidebarWidgets component until this Suspense boundary
  // is streamed. The server action (getDashboardSidebarData) is already
  // statically imported above — no additional network cost.
  const sidebarData: SidebarDataResult = await getDashboardSidebarData()
  const { SidebarWidgets } = await import('@/components/dashboard/sidebar-widgets')
  return (
    <SidebarWidgets
      role={user.role}
      activeTimer={sidebarData.activeTimer}
      projects={sidebarData.projects}
      unassignedTickets={sidebarData.unassignedTickets}
      developers={sidebarData.developers}
      projectAnalytics={sidebarData.projectAnalytics}
    />
  )
}

// ─── ISR revalidation: re-render page every 30 seconds ───────────────────
// Cache the entire HTML output for 30s — the page's server actions also
// have their own cache TTLs, so data is never more than 30s stale.
// This prevents a full server-side render on every request.
export const revalidate = 30

// ─── Main Dashboard Page ────────────────────────────────────────────────────

export default async function DashboardPage() {
  // ── PHASE 3: Only await critical data — sidebar streams separately ────
  const criticalData = await getDashboardCriticalData()
  const { user, consolidatedStats, recentTickets, projectMetrics, renewalStatus } = criticalData

  const roleSubtitle = {
    client: 'System-wide overview of projects and tickets',
    developer: 'Your work queue — overview of assigned tickets',
    project_manager: 'Team overview and project status at a glance',
    admin: 'System-wide overview of all projects and tickets',
  }[user.role]

  return (
    <div className="space-y-4">
      {/* Client Renewal Reminder — fast cached query, renders inline */}
      <SupportRenewalReminder status={renewalStatus} />
 <div data-tour="dashboard-header" className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
    
      <PageHeader
        title="Dashboard"
        subtitle={roleSubtitle}
        icon={<LayoutDashboard className="h-5 w-5" />}
        iconVariant="blue"
        actions={
          <>
            <CurrentDate />
          </>
        }
      />
</div>
      <div className="space-y-4">
        {/* ── CRITICAL PATH: KPI cards — data already loaded ───────── */}
        <StatsSection consolidatedStats={consolidatedStats} userRole={user.role} />

        {/* Admin Project Metrics — already loaded in critical data
        {user.role === 'admin' && projectMetrics && (
          <ProjectMetricsSection projectMetrics={projectMetrics} />
        )} */}

        {/* ── Main Content Grid ────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* CRITICAL: Recent Tickets — data already loaded */}
          <RecentTicketsSection
            recentTickets={recentTickets}
            userRole={user.role}
          />

          {/* STREAMED: Sidebar Widgets — fetched asynchronously via Suspense.
              The SidebarSection lazy-imports the server action + component,
              so sidebar bundles never block the initial paint. */}
          <Suspense fallback={<SidebarSkeleton />}>
            <SidebarSection user={user} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
