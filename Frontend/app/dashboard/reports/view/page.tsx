'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { ReportTable } from '@/components/dashboard/report-center/report-table'
import { ReportSummaryCards } from '@/components/dashboard/report-center/report-summary-cards'
import { getReportData, getReportFormData } from '@/app/actions/reports'
import { REPORT_TYPE_LABELS } from '@/lib/report-types'
import type { ReportFilters as ReportFiltersType, ReportResult } from '@/app/actions/reports'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, AlertCircle, Loader2, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

// Dynamic imports — heavy components lazily loaded
const ReportFilters = dynamic(() => import('@/components/dashboard/report-center/report-filters').then(m => ({ default: m.ReportFilters })), {
  ssr: false,
  loading: () => (
    <div className="h-11 rounded-xl bg-muted/30 animate-pulse" />
  ),
})

const ReportExport = dynamic(() => import('@/components/dashboard/report-center/report-export').then(m => ({ default: m.ReportExport })), {
  ssr: false,
  loading: () => (
    <div className="h-10 w-28 rounded-xl bg-muted/30 animate-pulse" />
  ),
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
export default function ReportCenterPage() {
  const searchParams = useSearchParams()

  const [formData, setFormData] = useState<{ projects: any[]; developers: any[]; clients: any[] }>({ projects: [], developers: [], clients: [] })
  const [report, setReport] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentFilters, setCurrentFilters] = useState<ReportFiltersType | null>(null)

  // Load form data on mount
  useEffect(() => {
    async function load() {
      try {
        const data = await getReportFormData()
        setFormData(data)
      } catch {}
    }
    load()
  }, [])

  // Handle initial preset from search params
  useEffect(() => {
    const reportParam = searchParams.get('report')
    if (reportParam) {
      const presetFilters: ReportFiltersType = { reportType: reportParam as any }

      const statusParam = searchParams.get('status')
      if (statusParam) presetFilters.status = statusParam as any

      const priorityParam = searchParams.get('priority')
      if (priorityParam) presetFilters.priority = priorityParam as any

      const projectParam = searchParams.get('projectId')
      if (projectParam) presetFilters.projectId = Number(projectParam)

      const developerParam = searchParams.get('developerId')
      if (developerParam) presetFilters.developerId = developerParam

      setCurrentFilters(presetFilters)
      handleGenerateReport(presetFilters)
    }
  }, [searchParams])

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

  const handleRefresh = useCallback(() => {
    if (currentFilters) {
      handleGenerateReport(currentFilters)
    }
  }, [currentFilters, handleGenerateReport])

  const reportLabel = useMemo(() => 
    currentFilters ? REPORT_TYPE_LABELS[currentFilters.reportType] || currentFilters.reportType : '',
    [currentFilters]
  )

  return (
    <div className="space-y-5" data-tour="reports-center">
        <div data-tour="reports-header" className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
   
      <PageHeader
          title="Report Center"
          subtitle="View, filter, analyze and export system reports"
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

      {/* Filters */}
        <div className="space-y-5">
            <div data-tour="report-filters" className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
          <ReportFilters
            projects={formData.projects}
            developers={formData.developers}
            clients={formData.clients}
            onApply={handleGenerateReport}
            initialReportType={currentFilters?.reportType}
            initialFilters={currentFilters || undefined}
          />
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

          {/* Empty State */}
          {!report && !loading && !error && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-accent mb-5">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">No Report Selected</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Choose a report type from the dropdown above and click <strong>Generate</strong> to preview your data.
              </p>
            </div>
          )}

          {/* Report Results — plain div avoids framer-motion layout work */}
          {report && !loading && (
            <div data-tour="report-results" className="space-y-6">
                {/* Report Meta */}
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

                {/* Summary Cards */}
                <div data-tour="report-summary-cards">
                  <ReportSummaryCards summary={report.meta.summary} />
                </div>

                {/* Charts */}
                {report.charts && report.charts.length > 0 && (
                  <div data-tour="report-charts">
                    <ReportMiniCharts charts={report.charts} />
                  </div>
                )}

                {/* Data Table */}
                <div data-tour="report-table">
                  <ReportTable columns={report.columns} data={report.data} />
                </div>
            </div>
          )}
        </div>
    </div>
  )
}
