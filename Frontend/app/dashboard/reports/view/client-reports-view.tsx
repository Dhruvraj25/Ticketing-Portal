'use client'

// Dedicated Client Report Center — /dashboard/reports/view for role==='client'
// only (dispatched server-side in page.tsx, so a client never even renders
// the generic admin/manager ReportCenterClient). Shows exactly the 4
// required reports as cards; clicking one deep-links to this same route with
// `?report=ticket_summary[&status=...]` and reuses the EXACT SAME report
// engine, server action and result-rendering components as the admin Report
// Center — getTicketSummaryReport is already tenant-scoped to the logged-in
// client's own org (see ticketClientScopeCondition in
// app/actions/reports/ticket-reports.ts) and already allow-listed for the
// 'client' role in checkAccess() (app/actions/reports/types.ts). No new
// report type, no new query, no second report system.

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { ReportTable } from '@/components/dashboard/report-center/report-table'
import { ReportSummaryCards } from '@/components/dashboard/report-center/report-summary-cards'
import { StatCard, type KpiColorTheme } from '@/components/dashboard/stat-card'
import { getReportData } from '@/app/actions/reports'
import { REPORT_TYPE_LABELS } from '@/lib/report-types'
import type { ReportFilters as ReportFiltersType, ReportResult } from '@/app/actions/reports'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, AlertCircle, Loader2, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

const ReportExport = dynamic(() => import('@/components/dashboard/report-center/report-export').then(m => ({ default: m.ReportExport })), {
  ssr: false,
  loading: () => <div className="h-10 w-28 rounded-xl bg-muted/30 animate-pulse" />,
})

const ReportMiniCharts = dynamic(() => import('@/components/dashboard/report-center/report-mini-charts').then(m => ({ default: m.ReportMiniCharts })), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 card-shadow animate-pulse">
          <div className="h-4 w-24 bg-muted rounded mb-4" />
          <div className="h-48 bg-muted/50 rounded" />
        </div>
      ))}
    </div>
  ),
})

interface ClientDashboardStats {
  totalTickets: number
  inProgressTickets: number
  clientReviewCount: number
  closedCount: number
}

// Exactly 4 reports. Each maps to its OWN, mutually-exclusive `status` value
// (or no status at all for "Total Tickets") so Total ≠ In Progress ≠
// Pending for Approval ≠ Closed ≠ Total can never collapse onto each other —
// verified by a dedicated regression test (tests/report-access.test.ts).
const CLIENT_REPORT_CARDS: { title: string; status?: string; getValue: (s: ClientDashboardStats) => number; colorTheme?: KpiColorTheme }[] = [
  { title: 'Total Tickets', getValue: (s) => s.totalTickets },
  { title: 'In Progress', status: 'in_progress', getValue: (s) => s.inProgressTickets, colorTheme: 'indigo' },
  { title: 'Pending for Approval (Client)', status: 'client_review', getValue: (s) => s.clientReviewCount, colorTheme: 'amber' },
  { title: 'Closed', status: 'closed', getValue: (s) => s.closedCount, colorTheme: 'emerald' },
]

function cardHref(status?: string): string {
  return status
    ? `/dashboard/reports/view?report=ticket_summary&status=${status}`
    : '/dashboard/reports/view?report=ticket_summary'
}

export function ClientReportsView({ stats }: { stats: ClientDashboardStats }) {
  const searchParams = useSearchParams()

  const [report, setReport] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentFilters, setCurrentFilters] = useState<ReportFiltersType | null>(null)

  const handleGenerateReport = useCallback(async (filters: ReportFiltersType) => {
    setLoading(true)
    setError(null)
    setCurrentFilters(filters)
    try {
      const result = await getReportData(filters)
      setReport(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Deep-link support: clicking a card navigates this same route with new
  // search params (?report=ticket_summary[&status=...]); this effect reacts
  // to that change the same way the admin Report Center reacts to its own
  // preset params, and also covers a direct URL visit / refresh.
  useEffect(() => {
    const reportParam = searchParams.get('report')
    if (reportParam) {
      const presetFilters: ReportFiltersType = { reportType: reportParam as any }
      const statusParam = searchParams.get('status')
      if (statusParam) presetFilters.status = statusParam as any
      setCurrentFilters(presetFilters)
      handleGenerateReport(presetFilters)
    } else {
      // No report selected yet (first visit, no query params) — default to
      // Total Tickets so the page never sits on the generic "No Report
      // Selected" empty state clients have no dropdown to recover from.
      const defaultFilters: ReportFiltersType = { reportType: 'ticket_summary' as any }
      setCurrentFilters(defaultFilters)
      handleGenerateReport(defaultFilters)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleRefresh = useCallback(() => {
    if (currentFilters) handleGenerateReport(currentFilters)
  }, [currentFilters, handleGenerateReport])

  const reportLabel = useMemo(
    () => (currentFilters ? REPORT_TYPE_LABELS[currentFilters.reportType] || currentFilters.reportType : ''),
    [currentFilters],
  )

  const activeStatus = currentFilters?.status ?? ''

  return (
    <div className="space-y-5" data-tour="reports-center">
      <div data-tour="reports-header" className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
        <PageHeader
          title="Reports"
          subtitle="Your ticket reports, scoped to your account"
          icon={<FileText className="h-5 w-5" />}
          iconVariant="cyan"
          actions={
            <div className="flex items-center gap-2">
              {report && currentFilters && (
                <>
                  <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="rounded-xl h-10 px-4">
                    <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                    Refresh
                  </Button>
                  <ReportExport
                    columns={report.columns}
                    data={report.data}
                    reportTitle={reportLabel}
                    summary={report.meta.summary}
                  />
                </>
              )}
            </div>
          }
        />
      </div>

      <div className="space-y-5">
        {/* Exactly 4 reports — Total Tickets, In Progress, Pending for
            Approval (Client), Closed. Each is its own link with its own
            status value, so clicking one can never open another. */}
        <div data-tour="client-report-cards" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {CLIENT_REPORT_CARDS.map((card) => (
            <StatCard
              key={card.title}
              title={card.title}
              value={card.getValue(stats)}
              href={cardHref(card.status)}
              colorTheme={card.colorTheme}
              className={cn(
                (card.status ?? '') === activeStatus && 'ring-2 ring-primary/60',
              )}
            />
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating your report...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-destructive/10 mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">Failed to generate report</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="rounded-xl">
              Try Again
            </Button>
          </div>
        )}

        {/* Report Results */}
        {report && !loading && (
          <div data-tour="report-results" className="space-y-6">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="font-medium text-foreground">{reportLabel}</span>
                <span>Generated: {new Date(report.meta.generatedAt).toLocaleString()}</span>
                <span>{report.meta.totalRecords} records</span>
              </div>
              <div className="flex items-center gap-2">
                {report.meta.appliedFilters.filter(f => f !== 'report type').map((f, i) => (
                  <Badge key={i} variant="outline" className="text-[11px] rounded-lg">{f}</Badge>
                ))}
              </div>
            </div>

            <div data-tour="report-summary-cards">
              <ReportSummaryCards summary={report.meta.summary} />
            </div>

            {report.charts && report.charts.length > 0 && (
              <div data-tour="report-charts">
                <ReportMiniCharts charts={report.charts} />
              </div>
            )}

            <div data-tour="report-table">
              <ReportTable columns={report.columns} data={report.data} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
