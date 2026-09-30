'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { startTimer, stopTimer, pauseTimer, resumeTimer, getMyTimerState, getMyTimeEntriesForExport } from '@/app/actions/tickets'
import Link from 'next/link'
import { buildXlsx, XLSX_MIME } from '@/lib/office-export'
import { downloadFile } from '@/lib/download-file'
import { TIME_ENTRY_EXPORT_HEADERS, timeEntryExportFilename, timeEntryExportRows } from '@/lib/time-entry-export'
import { sessionElapsedSeconds, TIMER_STATE_LABEL, type MyTimerState, type TimerTicketOption } from '@/lib/timer-rules'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  Play,
  Square,
  Pause,
  RefreshCw,
  Loader2,
  Clock,
  Ticket,
  Timer,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatCard } from '@/components/dashboard/stat-card'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { stripHtml } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { TicketWithRelations, TimeLogWithUser } from '@/lib/types'

interface TicketTimeLogs {
  ticketId: number
  ticketNumber: string
  ticketTitle: string
  projectName?: string
  projectCode?: string
  moduleName?: string
  logs: TimeLogWithUser[]
}

interface DaySummary {
  date: string
  totalMinutes: number
  billableMinutes: number
}

interface TicketSummary {
  ticketId: number
  ticketNumber: string
  title: string
  totalMinutes: number
  billableMinutes: number
  entries: number
}

interface TimeTrackingClientProps {
  tickets: TicketWithRelations[]
  /** Timer dropdown options — server-filtered (getTimerTickets). */
  timerTickets: TimerTicketOption[]
  /** Current timer — server state (getMyTimerState). */
  timer: MyTimerState
  allTimeLogs: TicketTimeLogs[]
  worklogData: {
    dailySummary: DaySummary[]
    byTicket: TicketSummary[]
    totalMinutes: number
    billableMinutes: number
  }
}

/** Entries shown in the (internally scrolling) Recent Entries list. */
const RECENT_ENTRIES_LIMIT = 50
/** Full list of this developer's entries: the Worklog report (server-scoped to them). */
export const VIEW_ALL_ENTRIES_HREF = '/dashboard/reports/view?report=worklog'

function fmtMins(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-900 border border-border rounded-lg p-3 text-sm shadow-md">
      {label && <p className="font-medium text-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="text-xs">
          {p.name}: {fmtMins(p.value)}
        </p>
      ))}
    </div>
  )
}

export function TimeTrackingClient({
  tickets,
  timerTickets,
  timer: initialTimer,
  allTimeLogs,
  worklogData,
}: TimeTrackingClientProps) {
  const router = useRouter()
  // Timer ticket list comes from the server (getTimerTickets — assigned to
  // this developer, workable status, not already running; lib/timer-rules.ts).
  // `tickets` keeps every ticket for the log history and for resolving the
  // active timer's ticket.
  const [selectedTicket, setSelectedTicket] = useState('')
  const selectedOption = timerTickets.find((t) => String(t.id) === selectedTicket) ?? null
  const isResume = selectedOption?.state === 'paused' && selectedOption.resumeLogId !== null
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Timer state comes ONLY from the server (getMyTimerState — the same
  // derivation Ticket Detail uses): RUNNING / PAUSED / none. It is re-read
  // after every action; the interval below only redraws the elapsed time.
  const [timer, setTimer] = useState<MyTimerState>(initialTimer)
  const [elapsedTime, setElapsedTime] = useState(() => sessionElapsedSeconds(initialTimer))
  const isRunning = timer.state === 'running'
  const isPaused = timer.state === 'paused'

  useEffect(() => {
    setElapsedTime(sessionElapsedSeconds(timer))
    if (timer.state !== 'running') return
    const interval = setInterval(() => setElapsedTime(sessionElapsedSeconds(timer)), 1000)
    return () => clearInterval(interval)
  }, [timer])

  const reloadTimer = async () => {
    try {
      setTimer(await getMyTimerState())
    } catch {}
    router.refresh()
  }

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const runAction = async (name: string, fallback: string, fn: () => Promise<unknown>) => {
    setError(null)
    setLoading(name)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback)
    } finally {
      await reloadTimer()
      setLoading(null)
    }
  }

  const handleStart = () => {
    if (!selectedOption) return
    return runAction('start', 'Failed to start timer', async () => {
      // Paused ticket → continue that paused entry (existing resumeTimer);
      // new / previously stopped ticket → a new session (existing startTimer).
      if (isResume) await resumeTimer(selectedOption.resumeLogId!, selectedOption.id, description || undefined)
      else await startTimer(selectedOption.id, description || undefined)
      setSelectedTicket('')
      setDescription('')
    })
  }

  const handleStop = () => {
    if (!timer.entryId) return
    return runAction('stop', 'Failed to stop timer', () => stopTimer(timer.entryId!))
  }

  const handlePause = () => {
    if (!timer.entryId || !isRunning) return
    return runAction('pause', 'Failed to pause timer', () => pauseTimer(timer.entryId!))
  }

  const handleResume = () => {
    if (!timer.entryId || !timer.ticketId || !isPaused) return
    return runAction('resume', 'Failed to resume timer', async () => {
      await resumeTimer(timer.entryId!, timer.ticketId!, description || undefined)
      setDescription('')
    })
  }

  // ── Export (developer's own entries; server-scoped, shared billing rule) ──
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const handleExport = async () => {
    setExportMessage(null)
    setExporting(true)
    try {
      const entries = await getMyTimeEntriesForExport()
      if (entries.length === 0) {
        setExportMessage({ kind: 'info', text: 'There are no time entries to export yet.' })
        return
      }
      const xlsx = buildXlsx([{
        name: 'Time Entries',
        rows: [[...TIME_ENTRY_EXPORT_HEADERS], ...timeEntryExportRows(entries)],
        boldRows: [0],
      }])
      downloadFile(xlsx, timeEntryExportFilename(), XLSX_MIME)
    } catch {
      setExportMessage({ kind: 'error', text: 'Export failed. Please try again.' })
    } finally {
      setExporting(false)
    }
  }

  const activeTicketInfo = timer.ticketId
    ? { ticketNumber: timer.ticketNumber, title: timer.ticketTitle }
    : null

  const { dailySummary, byTicket, totalMinutes, billableMinutes } = worklogData
  const nonBillableMinutes = totalMinutes - billableMinutes
  const billablePct = totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0
  const chartData = dailySummary.map((d) => ({
    date: d.date,
    Billable: d.billableMinutes,
    'Non-billable': d.totalMinutes - d.billableMinutes,
  }))

  // All time entries sorted by date
  const recentEntries = allTimeLogs
    .flatMap(t => t.logs.map(log => ({ ...log, ticketNumber: t.ticketNumber, ticketTitle: t.ticketTitle })))
    .filter(log => log.endTime)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECENT_ENTRIES_LIMIT)

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
       <div data-tour="time-tracking-header" className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
   
      <PageHeader
          title="Time Tracking"
          subtitle="Track and review time spent on your assigned tickets"
          icon={<Timer className="h-5 w-5" />}
          iconVariant="indigo"
        />
</div>
      {/* ── KPI Cards ── */}
      <div data-tour="time-tracking-kpis" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Logged"
          value={fmtMins(totalMinutes)}
          iconName="Timer"
          delay={0}
        />
        <StatCard
          title="Billable"
          value={fmtMins(billableMinutes)}
          iconName="CheckCircle2"
          delay={1}
        />
        <StatCard
          title="Non-Billable"
          value={fmtMins(nonBillableMinutes)}
          iconName="Clock"
          delay={2}
        />
        <StatCard
          title="Billable Rate"
          value={`${billablePct}%`}
          iconName="BarChart3"
          delay={3}
        />
      </div>

      {/* ── 2-Column Layout: Timer + Recent Entries ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Timer Card (Left 2/3) ── */}
        <div className="lg:col-span-2">
          <div data-tour="time-tracker" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
            {/* Timer Card Header */}
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800">
                  <Timer className="h-4 w-4 text-slate-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Timer</h3>
                  <p className="text-xs text-slate-500 mt-px">
                    {isRunning ? 'Timer is running' : isPaused ? 'Timer is paused' : 'Select a ticket and start tracking'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {isRunning || isPaused ? (
                <div className="space-y-6">
                  {/* Active Timer Display */}
                  <div className="text-center py-4">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{isPaused ? 'Paused' : 'Working on'}</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-6">
                      {activeTicketInfo?.ticketNumber}: {activeTicketInfo?.title}
                    </p>
                    <motion.div
                      key={elapsedTime}
                      initial={{ scale: 1 }}
                      animate={{ scale: [1, 1.02, 1] }}
                      transition={{ duration: 0.3 }}
                      className="text-5xl font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums tracking-tight"
                    >
                      {formatElapsed(elapsedTime)}
                    </motion.div>
                    {timer.description && (
                      <p className="text-sm text-slate-500 mt-4 max-w-md mx-auto">{timer.description}</p>
                    )}
                  </div>

                  {/* Timer Controls */}
                  <div className="flex items-center justify-center gap-3">
                    {isRunning && (
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button
                        onClick={handlePause}
                        disabled={loading !== null}
                        variant="outline"
                        className="rounded-lg h-11 px-6 border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                      >
                        {loading === 'pause' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                        <span className="ml-2 text-sm">Pause</span>
                      </Button>
                    </motion.div>
                    )}
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button
                        onClick={handleStop}
                        disabled={loading !== null}
                        variant="destructive"
                        className="rounded-lg h-11 px-6"
                      >
                        {loading === 'stop' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                        <span className="ml-2 text-sm">Stop</span>
                      </Button>
                    </motion.div>
                    {isPaused && (
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button
                        onClick={handleResume}
                        disabled={loading !== null}
                        className="rounded-lg h-11 px-6 bg-[#111827] hover:bg-[#1f2937] text-white shadow-sm"
                      >
                        {loading === 'resume' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        <span className="ml-2 text-sm">Resume</span>
                      </Button>
                    </motion.div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {/* Ticket Dropdown */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1.5 block">Ticket</label>
                      <Select value={selectedTicket} onValueChange={(v) => setSelectedTicket(v)}>
                        <SelectTrigger className="w-full h-10 rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm">
                          <SelectValue placeholder="Select a ticket to work on..." />
                        </SelectTrigger>
                        <SelectContent>
                          {timerTickets.length === 0 && (
                            <SelectItem value="__none__" disabled>No tickets are currently available for time tracking.</SelectItem>
                          )}
                          {timerTickets.map((t) => (
                            <SelectItem key={t.id} value={t.id.toString()}>
                              <div className="flex items-center gap-2 min-w-0">
                                <Ticket className="h-3.5 w-3.5 text-[#9CA3AF] shrink-0" />
                                <span className="truncate text-sm">{t.ticketNumber}: {t.title}</span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">· {TIMER_STATE_LABEL[t.state]}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Work Description */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1.5 block">Work Description</label>
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What are you working on?"
                        className="h-10 rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
                      />
                    </div>
                  </div>

                  {/* Start Timer Button - Full Width, Black */}
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <Button
                      onClick={handleStart}
                      disabled={loading !== null || !selectedOption}
                      className="w-full rounded-lg h-11 bg-[#111827] hover:bg-[#1f2937] text-white shadow-sm text-sm font-medium"
                    >
                      {loading === 'start' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : isResume ? (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      {isResume ? 'Resume Timer' : 'Start Timer'}
                    </Button>
                  </motion.div>
                </div>
              )}

              {error && <p className="text-sm text-destructive mt-4 text-center">{error}</p>}
            </div>
          </div>
        </div>

        {/* ── Recent Entries Card (Right 1/3) ──
            On desktop the card is taken out of the row's height calculation
            (absolute inset-0 inside a relative grid cell), so the row is as
            tall as the Timer card and this card fills exactly that height; on
            small screens it has a max height. Header (with Export) and footer
            (View all) stay fixed — only the entries list scrolls. */}
        <div className="relative min-h-0">
          <div data-tour="time-tracker-entries" className="flex flex-col max-h-[28rem] lg:max-h-none lg:absolute lg:inset-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="shrink-0 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent Entries</h3>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={exporting}
                  aria-busy={exporting}
                  className="rounded-lg h-7 text-xs border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-[#F9FAFB]"
                >
                  {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                  {exporting ? 'Exporting…' : 'Export'}
                </Button>
              </div>
              {exportMessage && (
                <p className={cn('mt-2 text-xs', exportMessage.kind === 'error' ? 'text-destructive' : 'text-slate-500')} role="status">
                  {exportMessage.text}
                </p>
              )}
            </div>

            <div data-testid="recent-entries-scroll" className="flex-1 min-h-0 overflow-y-auto divide-y divide-[#E5E7EB]/60">
              {recentEntries.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <Clock className="h-8 w-8 text-[#D1D5DB] mx-auto mb-3" />
                  <p className="text-sm text-[#9CA3AF]">No time entries yet.</p>
                  <p className="text-xs text-[#D1D5DB] mt-1">Start the timer to begin tracking.</p>
                </div>
              ) : (
                recentEntries.map((log, idx) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                    className="flex items-center justify-between px-5 py-3 hover:bg-[#F9FAFB] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-[#D1D5DB] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate leading-snug">
                          {log.ticketTitle}
                        </p>
                        <p className="text-xs text-[#9CA3AF] mt-0.5 font-mono">
                          {log.ticketNumber}
                        </p>
                        {log.description && (
                          <p className="text-xs text-[#9CA3AF] truncate mt-0.5">{stripHtml(log.description)}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {Math.floor((log.durationMinutes || 0) / 60)}h {(log.durationMinutes || 0) % 60}m
                      </p>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">
                        {format(new Date(log.startTime), 'MMM d')}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            <div className="shrink-0 px-5 py-2.5 text-center border-t border-slate-200 dark:border-slate-800">
              {/* Full list: the Worklog report, scoped server-side to this developer's own entries. */}
              <Link
                href={VIEW_ALL_ENTRIES_HREF}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
              >
                View all entries
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts Row (side by side) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Daily Hours Chart ── */}
        <div data-tour="time-chart-daily" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Daily Hours (Last 30 Days)</h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#111827]" />
                <span className="text-xs text-slate-500">Billable</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#D1D5DB]" />
                <span className="text-xs text-slate-500">Non-billable</span>
              </div>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center">
              <p className="text-sm text-[#9CA3AF]">No entries in this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barSize={10} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => format(new Date(v), 'MMM d')}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `${v}h`}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Billable" stackId="a" fill="#111827" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Non-billable" stackId="a" fill="#D1D5DB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Time by Ticket (Progress Bars) ── */}
        <div data-tour="time-chart-by-ticket" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Time by Ticket</h3>
            <span className="text-xs text-[#9CA3AF]">Top 7 tickets</span>
          </div>

          {byTicket.length === 0 ? (
            <div className="h-32 flex items-center justify-center">
              <p className="text-sm text-[#9CA3AF]">No time entries found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {byTicket.slice(0, 7).map((t, idx) => {
                const max = Math.max(...byTicket.slice(0, 7).map(t => t.totalMinutes), 1)
                const pct = (t.totalMinutes / max) * 100
                const billablePct = t.totalMinutes > 0 ? Math.round((t.billableMinutes / t.totalMinutes) * 100) : 0
                return (
                  <div key={t.ticketId}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-xs font-mono text-[#9CA3AF] shrink-0 w-16 truncate">{t.ticketNumber}</span>
                        <span className="text-sm text-slate-900 dark:text-slate-100 truncate font-medium">{t.title}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        {billablePct >= 50 ? (
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Billable
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-[#9CA3AF] flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#D1D5DB]" />
                            {billablePct}% billable
                          </span>
                        )}
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums w-16 text-right">{fmtMins(t.totalMinutes)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, delay: idx * 0.04, ease: 'easeOut' }}
                        className="h-full rounded-full bg-[#111827]"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
