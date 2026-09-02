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
import { TicketStatus } from '@/lib/types'
import type { ReportFilters as ReportFiltersType } from '@/app/actions/reports'
import type { ReportType } from '@/lib/report-types'
import { REPORT_TYPE_OPTIONS } from '@/lib/report-types'

interface ReportFiltersProps {
  projects: { id: number; projectName: string; projectCode: string }[]
  developers: { id: string; name: string }[]
  clients: { id: string; name: string }[]
  onApply: (filters: ReportFiltersType) => void
  initialReportType?: ReportType
  initialFilters?: Partial<ReportFiltersType>
}

const STATUS_OPTIONS = [
  { value: TicketStatus.NEW, label: 'New Request' },
  { value: TicketStatus.MANAGER_REVIEW, label: 'Under Review' },
  { value: TicketStatus.ESTIMATE_PENDING, label: 'Awaiting Estimate Approval' },
  { value: TicketStatus.ESTIMATE_APPROVED, label: 'Estimate Approved' },
  { value: TicketStatus.ASSIGNED, label: 'Assigned to Resource' },
  { value: TicketStatus.IN_PROGRESS, label: 'Work in Progress' },
  { value: TicketStatus.RESOLVED, label: 'Ready for Client Review' },
  { value: TicketStatus.CLIENT_REVIEW, label: 'Awaiting Client Review' },
  { value: TicketStatus.CLOSED, label: 'Completed' },
  { value: TicketStatus.REQUEST_FOR_REVISION, label: 'Revision Requested' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'LOW' },
  { value: 'medium', label: 'MEDIUM' },
  { value: 'high', label: 'HIGH' },
  { value: 'urgent', label: 'URGENT' },
  { value: 'critical', label: 'CRITICAL' },
]

export const ReportFilters = memo(function ReportFilters({ projects, developers, clients, onApply, initialReportType, initialFilters }: ReportFiltersProps) {
  const [showFilters, setShowFilters] = useState(false)
  const [reportType, setReportType] = useState<ReportType>(initialReportType || 'ticket_summary')
  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom || '')
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo || '')
  const [projectId, setProjectId] = useState(initialFilters?.projectId ? String(initialFilters.projectId) : '')
  const [moduleId, setModuleId] = useState(initialFilters?.moduleId ? String(initialFilters.moduleId) : '')
  const [developerId, setDeveloperId] = useState(initialFilters?.developerId || '')
  const [clientId, setClientId] = useState(initialFilters?.clientId || '')
  const [status, setStatus] = useState(initialFilters?.status || '')
  const [priority, setPriority] = useState(initialFilters?.priority || '')

  function handleApply(typeOverride?: ReportType) {
    const filters: ReportFiltersType = { reportType: typeOverride ?? reportType }
    if (dateFrom) filters.dateFrom = dateFrom
    if (dateTo) filters.dateTo = dateTo
    if (projectId) filters.projectId = Number(projectId)
    if (moduleId) filters.moduleId = Number(moduleId)
    if (developerId) filters.developerId = developerId
    if (clientId) filters.clientId = clientId
    if (status) filters.status = status as any
    if (priority) filters.priority = priority as any
    onApply(filters)
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
    onApply({ reportType })
  }

  const activeFilterCount = [dateFrom, dateTo, projectId, moduleId, developerId, clientId, status, priority].filter(Boolean).length

  return (
    <div className="space-y-4">
      {/* Report Type + Quick Actions */}
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="report-type">Report Type</Label>
          <Select value={reportType} onValueChange={(v) => { setReportType(v as ReportType); handleApply(v as ReportType) }}>
            <SelectTrigger id="report-type" className="h-11 rounded-xl bg-white dark:bg-slate-900 border-border">
              <SelectValue placeholder="Select report type" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {Array.from(new Set(REPORT_TYPE_OPTIONS.map(r => r.category))).map(category => (
                <div key={category}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {category}
                  </div>
                  {REPORT_TYPE_OPTIONS.filter(r => r.category === category).map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className={`mt-6 rounded-xl h-11 ${activeFilterCount > 0 ? 'border-primary text-primary' : ''}`}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-2 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>

        <div className="mt-6">
          <Button onClick={() => handleApply()} size="sm" className="rounded-xl h-11 bg-black text-white hover:bg-black/80">
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
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Advanced Filters</h3>
                <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-muted-foreground h-7">
                  <X className="mr-1 h-3 w-3" />
                  Reset
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
                  <Label className="text-xs">Project</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border">
                      <SelectValue placeholder="All projects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All projects</SelectItem>
                      {projects.map(p => (                          <SelectItem key={p.id} value={String(p.id)} className="truncate">
                            <span className="truncate">{p.projectCode} — {p.projectName}</span>
                          </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Developer</Label>
                  <Select value={developerId} onValueChange={setDeveloperId}>
                    <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border">
                      <SelectValue placeholder="All developers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All developers</SelectItem>
                      {developers.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
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
                      {projects.filter(p => !projectId || String(p.id) === projectId).map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.projectName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Client</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border">
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
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border">
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
                <div className="space-y-1.5">
                  <Label className="text-xs">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-border">
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
