'use client'

import { useState, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Filter, X, Search, Calendar } from 'lucide-react'
import { TicketStatus, type UserRole } from '@/lib/types'
import type { ReportFilters as ReportFiltersType } from '@/app/actions/reports'
import { checkAccess } from '@/app/actions/reports/types'
import type { ReportType } from '@/lib/report-types'
import { REPORT_TYPE_OPTIONS, CLIENT_REPORT_PRESETS, clientPresetFromFilters, type ClientReportPreset } from '@/lib/report-types'

interface ReportFiltersProps {
  projects: { id: number; projectName: string; projectCode: string }[]
  developers: { id: string; name: string }[]
  clients: { id: string; name: string }[]
  onApply: (filters: ReportFiltersType) => void
  initialReportType?: ReportType
  initialFilters?: Partial<ReportFiltersType>
  /**
   * Current user's role — used to hide report types the role can't run
   * (server-enforced by checkAccess() in app/actions/reports/queries.ts;
   * this mirrors it so the dropdown never offers a report that will be
   * rejected, e.g. a client seeing "Worklog Report" or "Billable Hours
   * Report"). Falls back to showing every option until the role is known.
   */
  userRole?: UserRole
}

const STATUS_OPTIONS = [
  { value: TicketStatus.NEW, label: 'New Request' },
  { value: TicketStatus.MANAGER_REVIEW, label: 'Under Manager Review' },
  { value: TicketStatus.ESTIMATE_PENDING, label: 'Awaiting Estimate Approval' },
  { value: TicketStatus.ESTIMATE_APPROVED, label: 'Estimate Approved' },
  { value: TicketStatus.ASSIGNED, label: 'Assigned to Resource' },
  { value: TicketStatus.IN_PROGRESS, label: 'Work in Progress' },
  { value: TicketStatus.RESOLVED, label: 'Manager Review' },
  { value: TicketStatus.CLIENT_REVIEW, label: 'Awaiting Client Review' },
  { value: TicketStatus.CLOSED, label: 'Completed' },
  { value: TicketStatus.REWORK, label: 'Rework' },
  { value: TicketStatus.REQUEST_FOR_REVISION, label: 'Requested for Revision' },
]

// Radix Select doesn't allow an empty-string item value, so "All X" options
// use this sentinel instead. Every place that reads a filter's state value
// must treat this the same as "not selected" (see handleApply/activeFilterCount)
// — a prior version of this component forgot that in handleApply, so picking
// "All projects" after having a project selected sent `projectId: NaN` to the
// backend instead of clearing the filter.
const ALL_VALUE = '__all__'

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'LOW' },
  { value: 'medium', label: 'MEDIUM' },
  { value: 'high', label: 'HIGH' },
  { value: 'urgent', label: 'URGENT' },
  { value: 'critical', label: 'CRITICAL' },
]

export const ReportFilters = memo(function ReportFilters({ projects, developers, clients, onApply, initialReportType, initialFilters, userRole }: ReportFiltersProps) {
  const [showFilters, setShowFilters] = useState(false)
  const [reportType, setReportType] = useState<ReportType>(initialReportType || 'ticket_summary')
  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom || '')
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo || '')
  const [projectId, setProjectId] = useState(initialFilters?.projectId ? String(initialFilters.projectId) : '')
  const [moduleId, setModuleId] = useState(initialFilters?.moduleId ? String(initialFilters.moduleId) : '')
  // Clients have no Developer filter, so a developerId from a link is never adopted.
  const [developerId, setDeveloperId] = useState(userRole === 'client' ? '' : initialFilters?.developerId || '')
  const [clientId, setClientId] = useState(initialFilters?.clientId || '')
  // For clients, a preset's own status rule (Open/In Process/Resolved) is applied at
  // generate time and must not also seed the advanced Status filter.
  const [status, setStatus] = useState(
    userRole === 'client' && clientPresetFromFilters(initialFilters) !== 'total' ? '' : initialFilters?.status || '',
  )
  const [priority, setPriority] = useState(initialFilters?.priority || '')
  // Client role: the Report Type dropdown offers only the 4 client presets.
  const isClient = userRole === 'client'
  const [clientPreset, setClientPreset] = useState<ClientReportPreset>(clientPresetFromFilters(initialFilters))

  // Apply a client preset on top of the other filters (preset status rules win).
  function withClientPreset(filters: ReportFiltersType, presetValue: ClientReportPreset): ReportFiltersType {
    const preset = CLIENT_REPORT_PRESETS.find(p => p.value === presetValue)
    const result: ReportFiltersType = { ...filters, reportType: 'ticket_summary' }
    if (preset?.status) result.status = preset.status
    if (preset?.excludeStatus) result.excludeStatus = preset.excludeStatus
    return result
  }

  function handleApply(typeOverride?: ReportType, presetOverride?: ClientReportPreset) {
    const filters: ReportFiltersType = { reportType: typeOverride ?? reportType }
    if (dateFrom) filters.dateFrom = dateFrom
    if (dateTo) filters.dateTo = dateTo
    if (projectId && projectId !== ALL_VALUE) filters.projectId = Number(projectId)
    if (moduleId && moduleId !== ALL_VALUE) filters.moduleId = Number(moduleId)
    if (developerId && developerId !== ALL_VALUE) {
      // Clients have no Developer filter — never send developerId for them.
      if (!isClient) filters.developerId = developerId
    }
    if (clientId && clientId !== ALL_VALUE) filters.clientId = clientId
    if (status && status !== ALL_VALUE) filters.status = status as any
    if (priority && priority !== ALL_VALUE) filters.priority = priority as any
    onApply(isClient ? withClientPreset(filters, presetOverride ?? clientPreset) : filters)
  }

  function handleReset() {
    setDateFrom('')
    setDateTo('')
    setProjectId('')
    setModuleId('')
    setDeveloperId('')
    setClientId('')
    setStatus('')
    setPriority('')
    onApply(isClient ? withClientPreset({ reportType }, clientPreset) : { reportType })
  }

  const activeFilterCount = [dateFrom, dateTo, projectId, moduleId, isClient ? '' : developerId, clientId, status, priority].filter(v => v && v !== ALL_VALUE).length

  // The Client field is meaningless (and a real data-exposure risk) for a
  // client-role caller: they can only ever see their own org's data regardless
  // of what they pick (every client-accessible report handler AND-scopes the
  // query to the caller's own org before applying any filter-supplied clientId
  // — see app/actions/reports/ticket-reports.ts/project-reports.ts/
  // wallet-reports.ts), so showing them a picker of every OTHER client
  // company's name and email would leak business-confidential data for zero
  // functional benefit. Hide the field entirely rather than just leaving it
  // inert.
  const showClientFilter = userRole !== 'client'
  // Developer / support-engineer assignment is internal — clients don't filter by it.
  const showDeveloperFilter = userRole !== 'client'

  // Only offer report types this role is actually authorized to run — the
  // server (checkAccess in app/actions/reports/queries.ts) is the real gate,
  // this just keeps the dropdown from advertising reports that will 400/deny
  // (e.g. a client seeing Worklog/Billable Hours, or a developer seeing SLA
  // Compliance). Unknown role (not loaded yet) shows everything briefly.
  const visibleReportOptions = userRole
    ? REPORT_TYPE_OPTIONS.filter(opt => checkAccess(userRole, opt.value))
    : REPORT_TYPE_OPTIONS

  return (
    <div className="space-y-4">
      {/* Report Type + Quick Actions — wraps onto its own row below `sm` so the
          two action buttons never get squeezed against (or overlap) the
          Report Type select on a narrow viewport; unchanged on desktop. */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <div className="w-full sm:flex-1 space-y-1.5 min-w-0">
          <Label htmlFor="report-type">Report Type</Label>
          {isClient ? (
          <Select value={clientPreset} onValueChange={(v) => { setClientPreset(v as ClientReportPreset); handleApply(undefined, v as ClientReportPreset) }}>
            <SelectTrigger id="report-type" className="h-11 rounded-xl bg-white dark:bg-slate-900 border-border">
              <SelectValue placeholder="Select report type" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {CLIENT_REPORT_PRESETS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          ) : (
          <Select value={reportType} onValueChange={(v) => { setReportType(v as ReportType); handleApply(v as ReportType) }}>
            <SelectTrigger id="report-type" className="h-11 rounded-xl bg-white dark:bg-slate-900 border-border">
              <SelectValue placeholder="Select report type" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {Array.from(new Set(visibleReportOptions.map(r => r.category))).map(category => (
                <div key={category}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {category}
                  </div>
                  {visibleReportOptions.filter(r => r.category === category).map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
          )}
        </div>

        <div className="flex items-center gap-3 sm:mt-6 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={`rounded-xl h-11 flex-1 sm:flex-none ${activeFilterCount > 0 ? 'border-primary text-primary' : ''}`}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-2 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center shrink-0">
                {activeFilterCount}
              </span>
            )}
          </Button>

          <Button onClick={() => handleApply()} size="sm" className="rounded-xl h-11 flex-1 sm:flex-none bg-black text-white hover:bg-black/80">
            <Search className="mr-2 h-4 w-4" />
            Generate
          </Button>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white dark:bg-slate-900 border border-border rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">Advanced Filters</h3>
                <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-muted-foreground h-7 shrink-0">
                  <X className="mr-1 h-3 w-3" />
                  Reset
                </Button>
              </div>

              {/* Mobile: one column, full width, no overlap. Tablet: two
                  columns wrap cleanly. Desktop: four columns in a row. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs">Date From</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="pl-9 h-10 rounded-xl bg-white dark:bg-slate-900 border-border w-full" />
                  </div>
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs">Date To</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="pl-9 h-10 rounded-xl bg-white dark:bg-slate-900 border-border w-full" />
                  </div>
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs">Project</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border w-full">
                      <SelectValue placeholder="All projects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All projects</SelectItem>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={String(p.id)} className="truncate">
                          <span className="truncate">{p.projectCode} — {p.projectName}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {showDeveloperFilter && (
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs">Support Engineer / Developer</Label>
                  <Select value={developerId} onValueChange={setDeveloperId}>
                    <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border w-full">
                      <SelectValue placeholder="All support engineers / developers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All support engineers / developers</SelectItem>
                      {developers.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                )}
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs">Module / Service Area</Label>
                  <Select value={moduleId} onValueChange={setModuleId}>
                    <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border w-full">
                      <SelectValue placeholder="All modules / service areas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All modules / service areas</SelectItem>
                      {projects.filter(p => !projectId || String(p.id) === projectId).map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.projectName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {showClientFilter && (
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs">Client</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border w-full">
                      <SelectValue placeholder="All clients" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All clients</SelectItem>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                )}
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border w-full">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All statuses</SelectItem>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border w-full">
                      <SelectValue placeholder="All priorities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All priorities</SelectItem>
                      {PRIORITY_OPTIONS.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
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
  )
})
