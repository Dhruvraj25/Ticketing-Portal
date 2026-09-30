import { Suspense } from 'react'
import { getDashboardCriticalData, getDashboardSidebarData } from '@/app/actions/dashboard'
import type {
  ConsolidatedStats,
  ProjectMetricsResult,
  SidebarDataResult,
  DashboardUser,
} from '@/app/actions/dashboard'
import { StatCard } from '@/components/dashboard/stat-card'
import { statusKpis, TOTAL_TICKETS_KPI } from '@/lib/ticket-status-kpis'
import { RecentTicketsScroll } from '@/components/dashboard/recent-tickets-scroll'
import { PageHeader, CurrentDate } from '@/components/dashboard/page-header-server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, ArrowRight, LayoutDashboard, FileText } from 'lucide-react'
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

function StatsSection({ consolidatedStats }: { consolidatedStats: ConsolidatedStats }) {
  // SAME KPI categories for every role (lib/ticket-status-kpis.ts): Total
  // Tickets + one card per ticket status, each with its own fixed color/icon.
  // The COUNTS are role-scoped on the server (ticketStatsScope — the same scope
  // as the Tickets list): developer → tickets assigned to them; client →
  // own tickets (Approver: their organization's); manager / admin → the
  // tickets they can access. Status cards with 0 tickets are not rendered.
  // Replaces the old per-role Open / In Progress / Resolved buckets, which
  // merged statuses (e.g. "Resolved" = Manager Review + Client Review) and left
  // some statuses (Assigned, Estimate Approved, Completed) uncounted.
  const perStatus = statusKpis(consolidatedStats.statusCounts)
  return (
    <div className="max-w-[1200px] w-full mx-auto">
      <div data-tour="dashboard-kpis" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          title={TOTAL_TICKETS_KPI.label}
          value={consolidatedStats.totalTickets}
          href="/dashboard/tickets"
          iconName={TOTAL_TICKETS_KPI.icon}
          colorTheme={TOTAL_TICKETS_KPI.color}
        />
        {perStatus.map((k) => (
          <StatCard
            key={k.status}
            title={k.label}
            value={k.count}
            href={`/dashboard/tickets?status=${k.status}`}
            iconName={k.icon}
            colorTheme={k.color}
          />
        ))}
      </div>
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
  recentTicketsHasMore,
  userRole,
}: {
  recentTickets: any[]
  recentTicketsHasMore: boolean
  userRole: string
}) {
  return (
    // Desktop (two columns): this cell is as tall as the grid row, which the
    // Analytics column beside it sets — the inner panel is taken out of the
    // row-height calculation (absolute inset-0) and fills it, so the ticket
    // list ends level with Analytics and scrolls internally (header + View all
    // stay visible). lg:min-h keeps a usable list when Analytics is short.
    // Single column (< lg): unchanged — normal flow, list capped at 900px.
    <div className="lg:col-span-2 relative lg:min-h-[640px]">
    <div data-tour="dashboard-recent-tickets" className="space-y-3 lg:space-y-0 lg:absolute lg:inset-0 lg:flex lg:flex-col lg:gap-3">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-foreground">
          {userRole === 'client' ? 'Your Recent Tickets' : 'Recent Tickets'}
        </h2>
        <Link href="/dashboard/tickets">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>
      <RecentTicketsScroll
        initialTickets={recentTickets}
        initialHasMore={recentTicketsHasMore}
        showClient={userRole !== 'client'}
        // Assignee (developer) is internal — never surfaced to clients (R15).
        showAssignee={userRole !== 'developer' && userRole !== 'client'}
        emptyMessage={userRole === 'client' ? "You haven't submitted any tickets yet" : "No tickets in your queue"}
        scrollClassName="lg:flex-1 lg:min-h-0 lg:max-h-none"
      />
    </div>
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
  const { user, consolidatedStats, recentTickets, recentTicketsHasMore, projectMetrics, renewalStatus } = criticalData

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
            {/* Client Reports entry point — the dedicated 4-report page
                (Total Tickets / In Progress / Pending for Approval (Client) /
                Closed) now lives on its own route instead of an inline
                dashboard section. */}
            {user.role === 'client' && (
              <Link href="/dashboard/reports/view">
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Reports
                </Button>
              </Link>
            )}
            <CurrentDate />
          </>
        }
      />
</div>
      <div className="space-y-4">
        {/* ── CRITICAL PATH: KPI cards — data already loaded ───────── */}
        <StatsSection consolidatedStats={consolidatedStats} />

        {/* Admin Project Metrics — already loaded in critical data
        {user.role === 'admin' && projectMetrics && (
          <ProjectMetricsSection projectMetrics={projectMetrics} />
        )} */}

        {/* ── Main Content Grid ────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* CRITICAL: Recent Tickets — data already loaded */}
          <RecentTicketsSection
            recentTickets={recentTickets}
            recentTicketsHasMore={recentTicketsHasMore}
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
