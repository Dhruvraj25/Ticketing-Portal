import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { getCurrentUser, getAnalyticsData, getManagerAnalytics } from '@/app/actions/tickets'
import { redirect } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { PageTimer } from '@/lib/performance-profiler'

// Dynamic imports for heavy chart components — code-split to reduce initial bundle size
const AnalyticsKpiStrip = dynamic(() => import('@/components/dashboard/analytics-charts').then(m => ({ default: m.AnalyticsKpiStrip })))
const TicketVolumeChart = dynamic(() => import('@/components/dashboard/analytics-charts').then(m => ({ default: m.TicketVolumeChart })))
const StatusDistributionChart = dynamic(() => import('@/components/dashboard/analytics-charts').then(m => ({ default: m.StatusDistributionChart })))
const PriorityDistributionChart = dynamic(() => import('@/components/dashboard/analytics-charts').then(m => ({ default: m.PriorityDistributionChart })))
const DeveloperWorkloadChart = dynamic(() => import('@/components/dashboard/analytics-charts').then(m => ({ default: m.DeveloperWorkloadChart })))
const DeveloperTimeTable = dynamic(() => import('@/components/dashboard/analytics-charts').then(m => ({ default: m.DeveloperTimeTable })))

// ── Suspense fallback skeletons with natural heights ──────────────────────

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border p-5">
          <div className="h-3 w-16 bg-muted rounded mb-3" />
          <div className="h-8 w-20 bg-muted rounded" />
        </div>
      ))}
    </div>
  )
}

function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border p-5 ${className || ''}`}>
      <div className="h-3 w-32 bg-muted rounded mb-4" />
      <div className="h-[200px] bg-muted/30 rounded-lg" />
    </div>
  )
}

function BarChartSkeleton() {
  return (
    <div className="animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border p-5">
      <div className="h-3 w-32 bg-muted rounded mb-4" />
      <div className="h-[200px] flex items-end gap-2">
        {[40, 65, 45, 80, 55, 90, 70, 60, 85, 50, 75, 95].map((h, i) => (
          <div key={i} className="flex-1 bg-muted/30 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border p-5">
      <div className="h-3 w-40 bg-muted rounded mb-4" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted" />
            <div className="flex-1 h-4 bg-muted rounded" />
            <div className="h-4 w-16 bg-muted rounded" />
            <div className="h-4 w-12 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default async function AnalyticsPage() {
  const pageTimer = new PageTimer('Analytics Page')
  pageTimer.mark('Authentication')
  const user = await getCurrentUser()

  if (user.role !== 'project_manager' && user.role !== 'admin') {
    redirect('/dashboard')
  }

  // ── STREAMING ARCHITECTURE ─────────────────────────────────────────────
  // Phase 8: Pre-fetch ALL analytics data at once (single round trip after SQL
  // merge), then pass pre-loaded data to each chart wrapper. The Suspense
  // boundaries still control render order, but each wrapper renders IMMEDIATELY
  // because data is already loaded — no re-fetching, no duplicate SQL.
  //
  // IMPORTANT: Without this pre-fetch, each Suspense boundary would independently
  // call getAnalyticsData(), executing the expensive analytics SQL MULTIPLE times
  // (once per boundary). The single pre-fetch ensures ONE SQL execution total.
  //
  // Before: ALL charts hidden until ALL data loaded (~200-500ms blank page)
  // After:  KPIs visible immediately, charts stream via Suspense with pre-loaded data

  const [analytics, devStats] = await Promise.all([
    getAnalyticsData(),
    getManagerAnalytics(),
  ])

  pageTimer.finish()

  return (
    <div className="space-y-5" data-tour="analytics-charts">
     <div data-tour="analytics-header" className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
   
      <PageHeader
          title="Analytics"
          subtitle="Ticket trends and developer performance over the last 30 days"
          icon={<BarChart3 className="h-5 w-5" />}
          iconVariant="blue"
          
        />
        </div>

      <div className="space-y-6">
        {/* KPIs — render immediately, pre-loaded data */}
        <div data-tour="analytics-kpis">
          <Suspense fallback={<KpiSkeleton />}>
            <AnalyticsKpiStrip
              kpis={{
                totalTickets: analytics.totalTickets,
                resolvedTickets: analytics.resolvedTickets,
                avgResolutionHours: analytics.avgResolutionHours,
              }}
            />
          </Suspense>
        </div>

        {/* Volume + Status — pre-loaded data streams instantly */}
        <div data-tour="analytics-charts-row" className="grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-hidden">
          <div data-tour="ticket-volume-chart" className="lg:col-span-2">
            <Suspense fallback={<BarChartSkeleton />}>
              <TicketVolumeChart data={analytics.dailyVolume} />
            </Suspense>
          </div>
          <div data-tour="status-distribution-chart">
            <Suspense fallback={<ChartSkeleton />}>
              <StatusDistributionChart data={analytics.statusDistribution} />
            </Suspense>
          </div>
        </div>

        {/* Priority & Category distributions — pre-loaded data */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden">
          <div data-tour="priority-distribution-chart">
            <Suspense fallback={<ChartSkeleton />}>
              <PriorityDistributionChart data={analytics.priorityDistribution} />
            </Suspense>
          </div>
          <div data-tour="category-distribution-chart">
            <Suspense fallback={<ChartSkeleton />}>
              <PriorityDistributionChart
                data={analytics.categoryDistribution.map((d: any) => ({ priority: d.category, count: d.count }))}
              />
            </Suspense>
          </div>
        </div>

        {/* Developer charts — pre-loaded data streams instantly */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
          <div data-tour="developer-workload-chart">
            <Suspense fallback={<TableSkeleton />}>
              <DeveloperWorkloadChart data={devStats} />
            </Suspense>
          </div>
          <div data-tour="developer-time-table">
            <Suspense fallback={<TableSkeleton />}>
              <DeveloperTimeTable data={devStats} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  )
}
