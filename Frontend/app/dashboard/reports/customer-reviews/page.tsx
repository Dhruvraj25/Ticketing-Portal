'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { getReportData, getReportFormData } from '@/app/actions/reports'
import { KpiCard } from '@/components/dashboard/stat-card'
import { ReportMiniCharts } from '@/components/dashboard/report-center/report-mini-charts'
import { ReportExport } from '@/components/dashboard/report-center/report-export'
import { ReviewDetailModal } from '@/components/dashboard/customer-reviews/review-detail-modal'
import type { ReportFilters as ReportFiltersType, ReportResult } from '@/app/actions/reports'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Star, MessageSquare, ThumbsUp, AlertTriangle, Search, RefreshCw,
  BarChart3, Filter, X, Calendar, Loader2, Users, FileText, Clock,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

const REVIEW_STATUS_OPTIONS = [
  { value: 'all', label: 'All Reviews' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'pending', label: 'Pending Review' },
]

const STAR_RATING_OPTIONS = [
  { value: 'all', label: 'All Ratings' },
  { value: '5', label: '5 Stars' },
  { value: '4', label: '4 Stars' },
  { value: '3', label: '3 Stars' },
  { value: '2', label: '2 Stars' },
  { value: '1', label: '1 Star' },
]

export default function CustomerReviewsPage() {
  const [formData, setFormData] = useState<{ projects: any[]; developers: any[]; clients: any[]; managers: any[] }>({ projects: [], developers: [], clients: [], managers: [] })
  const [report, setReport] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showFilters, setShowFilters] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [developerId, setDeveloperId] = useState('')
  const [managerId, setManagerId] = useState('')
  const [ticketNumber, setTicketNumber] = useState('')
  const [reviewStatus, setReviewStatus] = useState('all')
  const [starRating, setStarRating] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const [detailTicketId, setDetailTicketId] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await getReportFormData()
        setFormData(data as any)
      } catch {}
    }
    load()
  }, [])

  function buildFilters(): ReportFiltersType {
    const filters: ReportFiltersType = { reportType: 'customer_review' }
    if (dateFrom) filters.dateFrom = dateFrom
    if (dateTo) filters.dateTo = dateTo
    if (projectId) filters.projectId = Number(projectId)
    if (moduleId) filters.moduleId = Number(moduleId)
    if (developerId) filters.developerId = developerId
    if (clientId) filters.clientId = clientId
    if (reviewStatus !== 'all') filters.reviewStatus = reviewStatus as 'all' | 'reviewed' | 'pending'
    if (starRating !== 'all') filters.starRating = starRating as 'all' | '1' | '2' | '3' | '4' | '5'
    if (managerId && managerId !== '__all__') filters.managerId = managerId
    filters.page = page
    filters.pageSize = pageSize
    return filters
  }

  async function handleGenerate() {
    setPage(1)
    setLoading(true)
    setError(null)
    try {
      const result = await getReportData(buildFilters())
      setReport(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  function handleRefresh() {
    if (report) handleGenerate()
  }

  function handleReset() {
    setDateFrom(''); setDateTo(''); setClientId(''); setProjectId('')
    setModuleId(''); setDeveloperId(''); setManagerId(''); setTicketNumber('')
    setReviewStatus('all'); setStarRating('all'); setPage(1)
  }

  const tableData = report?.data || []
  const summary = report?.meta?.summary || {}
  const charts = report?.charts || []
  const columns = report?.columns || []

  const resourcePerformanceData = (report?.extras as any)?.resourcePerformance || []

  const lowRatedData = tableData.filter((row: any) => {
    const r = Number(row.rating)
    return r === 1 || r === 2
  })

  const pendingData = tableData.filter((row: any) => row.reviewSubmitted === 'No')

  const pendingDataWithDays = pendingData.map((row: any) => {
    const rawDate = row._closedAt
    const days = rawDate ? Math.floor((Date.now() - new Date(rawDate).getTime()) / (1000 * 60 * 60 * 24)) : null
    return { ...row, daysSinceClosed: days !== null ? days : '—' }
  })

  const filteredTableData = ticketNumber
    ? tableData.filter((row: any) => String(row.ticketNumber).toLowerCase().includes(ticketNumber.toLowerCase()))
    : tableData

  const filteredLowRatedData = ticketNumber
    ? lowRatedData.filter((row: any) => String(row.ticketNumber).toLowerCase().includes(ticketNumber.toLowerCase()))
    : lowRatedData

  const filteredPendingData = ticketNumber
    ? pendingDataWithDays.filter((row: any) => String(row.ticketNumber).toLowerCase().includes(ticketNumber.toLowerCase()))
    : pendingDataWithDays

  const activeFilterCount = [dateFrom, dateTo, projectId, moduleId, developerId, clientId, managerId, reviewStatus !== 'all', starRating !== 'all'].filter(Boolean).length

  return (
    <div className="space-y-5" data-tour="customer-reviews-center">
        <div data-tour="customer-reviews-header" className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
      <PageHeader
          title="Customer Review Reports"
          subtitle="Analyze customer feedback, resource performance, and review completion"
          icon={<Star className="h-5 w-5" />}
          iconVariant="purple"
          actions={
            report && !loading ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleRefresh} className="rounded-xl h-10 px-4">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
                <ReportExport
                  columns={columns}
                  data={tableData}
                  reportTitle="Customer Review Reports"
                  summary={summary}
                />
              </div>
            ) : undefined
          }
        />
        </div>

      {/* Filters */}
      <div data-tour="customer-reviews-filters" className="space-y-5">
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
       
        <div className="flex items-start gap-3">
          <div className="flex-1 max-w-xs space-y-1.5">
            <Label className="text-xs">Ticket Number</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={ticketNumber}
                onChange={e => setTicketNumber(e.target.value)}
                placeholder="Search by ticket #..."
                className="pl-9 h-10 rounded-xl bg-white dark:bg-slate-900 border-border"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">&nbsp;</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={cn('rounded-xl h-10', activeFilterCount > 0 ? 'border-primary text-primary' : '')}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-2 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">&nbsp;</Label>
            <Button onClick={handleGenerate} size="sm" disabled={loading} className="rounded-xl h-10 bg-black text-white hover:bg-black/80">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Generate
            </Button>
            </div>
          </div>
        </div>
        

        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="bg-white dark:bg-slate-900 border border-border rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Advanced Filters</h3>
                  <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-muted-foreground h-7">
                    <X className="mr-1 h-3 w-3" /> Reset
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Date From</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="pl-9 h-10 rounded-xl bg-white dark:bg-slate-900 border-border" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Date To</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="pl-9 h-10 rounded-xl bg-white dark:bg-slate-900 border-border" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Client</Label>
                    <Select value={clientId} onValueChange={setClientId}>
                      <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border">
                        <SelectValue placeholder="All clients" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All clients</SelectItem>
                        {formData.clients.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Project</Label>
                    <Select value={projectId} onValueChange={setProjectId}>
                      <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border">
                        <SelectValue placeholder="All projects" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All projects</SelectItem>
                        {formData.projects.map(p => (<SelectItem key={p.id} value={String(p.id)}><span className="truncate">{p.projectCode} — {p.projectName}</span></SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Module</Label>
                    <Select value={moduleId} onValueChange={setModuleId}>
                      <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border">
                        <SelectValue placeholder="All modules" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All modules</SelectItem>
                        {formData.projects.filter(p => !projectId || String(p.id) === projectId).map(p => (<SelectItem key={p.id} value={String(p.id)}>{p.projectName}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Resource (Developer)</Label>
                    <Select value={developerId} onValueChange={setDeveloperId}>
                      <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border">
                        <SelectValue placeholder="All resources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All resources</SelectItem>
                        {formData.developers.map(d => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Review Status</Label>
                    <Select value={reviewStatus} onValueChange={setReviewStatus}>
                      <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border">
                        <SelectValue placeholder="All reviews" />
                      </SelectTrigger>
                      <SelectContent>
                        {REVIEW_STATUS_OPTIONS.map(o => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Star Rating</Label>
                    <Select value={starRating} onValueChange={setStarRating}>
                      <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border">
                        <SelectValue placeholder="All ratings" />
                      </SelectTrigger>
                      <SelectContent>
                        {STAR_RATING_OPTIONS.map(o => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Manager</Label>
                    <Select value={managerId} onValueChange={setManagerId}>
                      <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border">
                        <SelectValue placeholder="All managers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All managers</SelectItem>
                        {(formData.managers || []).map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="px-6">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating your report...</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-destructive/10 mb-4">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">Failed to generate report</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="rounded-xl">Try Again</Button>
          </div>
        )}

        {!report && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-accent mb-5">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No Report Generated</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Apply your filters above and click <strong>Generate</strong> to view customer review analytics.
            </p>
          </div>
        )}

        {report && !loading && (
          <div className="space-y-6">
            {/* Meta */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="font-medium text-foreground">Customer Review Reports</span>
                <span>Generated: {new Date(report.meta.generatedAt).toLocaleString()}</span>
                <span>{report.meta.totalRecords} records</span>
              </div>
              <div className="flex items-center gap-2">
                {report.meta.appliedFilters.filter(f => f !== 'customer review').map((f, i) => (
                  <Badge key={i} variant="outline" className="text-[11px] rounded-lg">{f}</Badge>
                ))}
              </div>
            </div>

            {/* KPIs */}
            <div data-tour="customer-reviews-kpis" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard title="Total Closed Tickets" value={String(summary['Total Closed Tickets'] || 0)} icon="CheckCircle2" colorTheme="blue" />
              <KpiCard title="Reviews Submitted" value={String(summary['Reviews Submitted'] || 0)} icon="MessageSquare" colorTheme="emerald" />
              <KpiCard title="Pending Reviews" value={String(summary['Pending Reviews'] || 0)} icon="Clock" colorTheme="amber" />
              <KpiCard title="Average Rating" value={String(summary['Average Rating'] || 0)} icon="Star" colorTheme="purple" />
              <KpiCard title="5 Star Reviews" value={String(summary['5 Star Reviews'] || 0)} icon="ThumbsUp" colorTheme="green" />
              <KpiCard title="Low Rated Reviews" value={String(summary['Low Rated Reviews'] || 0)} icon="AlertTriangle" colorTheme="red" />
            </div>

            {/* Charts */}
            {charts.length > 0 && <ReportMiniCharts charts={charts} />}

            {/* Main Table */}
            <div data-tour="customer-reviews-table">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-muted/50">
                  <FileText className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Customer Review Details</h3>
                <span className="text-xs text-muted-foreground">({filteredTableData.length})</span>
              </div>
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <div className="max-h-[600px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ticket #</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resource</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Manager</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Closed</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reviewed</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rating</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Comment</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTableData.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="px-4 py-12 text-center text-sm text-muted-foreground">
                              No records match your search criteria
                            </td>
                          </tr>
                        ) : (
                          filteredTableData.map((row: any, i: number) => (
                            <tr key={i} className={cn('border-b border-border/30 hover:bg-muted/20 transition-colors', i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-muted/10')}>
                              <td className="px-4 py-3 text-xs font-medium text-foreground">{row.ticketNumber}</td>
                              <td className="px-4 py-3 text-xs text-foreground max-w-[200px] truncate">{row.ticketTitle}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{row.client}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{row.project}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{row.assignedResource}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{row.manager}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{row.closedDate}</td>
                              <td className="px-4 py-3 text-xs text-center">
                                <span className={cn(
                                  'inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium',
                                  row.reviewSubmitted === 'Yes' ? 'bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300'
                                )}>
                                  {row.reviewSubmitted}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-center">
                                {row.rating !== '—' ? (
                                  <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-medium">
                                    {'★'.repeat(Number(row.rating))}{'☆'.repeat(5 - Number(row.rating))}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/50">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground max-w-[150px] truncate">{row.customerComment}</td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => setDetailTicketId(Number(row._ticketId))}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Resource Performance */}
            {resourcePerformanceData.length > 0 && (
              <div data-tour="customer-reviews-resource-performance">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-muted/50">
                    <Users className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Resource Performance</h3>
                </div>
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Resource</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Reviews</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Avg Rating</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">5★</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">4★</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">3★</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">2★</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">1★</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resourcePerformanceData.map((r: any, i: number) => (
                          <tr key={i} className={cn('border-b border-border/30', i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-muted/10')}>
                            <td className="px-4 py-3 text-xs font-medium text-foreground">{r.name}</td>
                            <td className="px-4 py-3 text-xs text-center tabular-nums">{r.reviewsReceived}</td>
                            <td className="px-4 py-3 text-xs text-center font-semibold">
                              <span className={cn(
                                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                                Number(r.averageRating) >= 4 ? 'bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300' :
                                Number(r.averageRating) >= 3 ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300' :
                                'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300'
                              )}>{r.averageRating}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-center text-green-600 dark:text-green-400 font-medium">{r.fiveStarCount}</td>
                            <td className="px-4 py-3 text-xs text-center text-blue-600 dark:text-blue-400 font-medium">{r.fourStarCount}</td>
                            <td className="px-4 py-3 text-xs text-center text-amber-600 dark:text-amber-400 font-medium">{r.threeStarCount}</td>
                            <td className="px-4 py-3 text-xs text-center text-orange-600 dark:text-orange-400 font-medium">{r.twoStarCount}</td>
                            <td className="px-4 py-3 text-xs text-center text-red-600 dark:text-red-400 font-medium">{r.oneStarCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Low Rating Report */}
            {filteredLowRatedData.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-muted/50">
                    <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Low Rated Tickets (1★ & 2★)</h3>
                  <span className="text-xs text-muted-foreground">({filteredLowRatedData.length})</span>
                </div>
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Ticket #</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Client</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Project</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Resource</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Manager</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Rating</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Comment</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Review Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLowRatedData.map((row: any, i: number) => (
                          <tr key={i} className={cn('border-b border-border/30', i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-muted/10')}>
                            <td className="px-4 py-3 text-xs font-medium text-foreground">{row.ticketNumber}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{row.client}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{row.project}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{row.assignedResource}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{row.manager}</td>
                            <td className="px-4 py-3 text-xs text-center">
                              <span className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                                Number(row.rating) <= 1 ? 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300' : 'bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300'
                              )}>{row.rating}★</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{row.customerComment}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{row.reviewDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Pending Review Report */}
            {filteredPendingData.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-muted/50">
                    <Clock className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Pending Review Tickets</h3>
                  <span className="text-xs text-muted-foreground">({filteredPendingData.length})</span>
                </div>
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Ticket #</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Client</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Project</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Resource</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Closed Date</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Days Since Closed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPendingData.map((row: any, i: number) => (
                          <tr key={i} className={cn('border-b border-border/30', i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-muted/10')}>
                            <td className="px-4 py-3 text-xs font-medium text-foreground">{row.ticketNumber}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{row.client}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{row.project}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{row.assignedResource}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{row.closedDate}</td>
                            <td className="px-4 py-3 text-xs text-center">
                              <span className={cn(
                                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                                row.daysSinceClosed > 14 ? 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300' :
                                row.daysSinceClosed > 7 ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300' :
                                'bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300'
                              )}>{row.daysSinceClosed}d</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Pagination */}
            {(report?.extras as any)?.pagination && (() => {
              const pag = (report?.extras as any)?.pagination
              if (pag.totalPages <= 1) return null
              return (
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Rows per page:</span>
                    <select
                      value={pageSize}
                      onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                      className="h-8 w-16 rounded-lg bg-white dark:bg-slate-900 border border-border text-xs px-2"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span className="text-xs text-muted-foreground ml-2">
                      Showing {((pag.page - 1) * pag.pageSize) + 1}–{Math.min(pag.page * pag.pageSize, pag.total)} of {pag.total}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="h-7 px-2 rounded-lg border border-border text-xs font-medium disabled:opacity-30 hover:bg-muted transition-colors"
                    >
                      Previous
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(pag.totalPages, 5) }, (_, i) => {
                        const start = Math.max(1, Math.min(page - 2, pag.totalPages - 4))
                        const p = start + i
                        if (p > pag.totalPages) return null
                        return (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={cn(
                              'h-7 w-7 rounded-lg text-xs font-medium transition-colors',
                              page === p ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'
                            )}
                          >
                            {p}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      onClick={() => setPage(p => Math.min(pag.totalPages, p + 1))}
                      disabled={page >= pag.totalPages}
                      className="h-7 px-2 rounded-lg border border-border text-xs font-medium disabled:opacity-30 hover:bg-muted transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )
            })()}

            <div className="h-4" />
          </div>
        )}
      </div>

      {detailTicketId && (
        <ReviewDetailModal ticketId={detailTicketId} open={!!detailTicketId} onClose={() => setDetailTicketId(null)} />
      )}
    </div>
  )
}
