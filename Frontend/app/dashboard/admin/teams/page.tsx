import { getCurrentUser } from '@/app/actions/tickets'
import { redirect } from 'next/navigation'
import { getTeamsStatus, getTeamsConfigValidation, getTeamsQueueStatus, getTeamsMonitorEvents } from '@/app/actions/teams'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Layers,
  Zap,
  BarChart3,
  Shield,
} from 'lucide-react'
import { TeamsStatusClient } from './teams-status-client'

interface TeamsStatusData {
  provider?: string
  configured?: boolean
  mockMode?: boolean
  ready?: boolean
  status?: string
  teamConfigured?: boolean
  channelConfigured?: boolean
  queueDepth?: number
  messagesSent?: number
  messagesFailed?: number
  lastTestAt?: string | null
  lastTestResult?: string | null
  message?: string
}

interface ValidationResult {
  key?: string
  label?: string
  severity?: string
  message?: string
  passed?: boolean
  value?: string
}

interface ValidationData {
  valid?: boolean
  mockMode?: boolean
  results?: ValidationResult[]
  timestamp?: string
}

interface QueueEntry {
  id?: string
  eventType?: string
  retryCount?: number
  maxRetries?: number
  createdAt?: string
  lastError?: string | null
}

interface QueueStats {
  totalProcessed?: number
  totalFailed?: number
  totalRetried?: number
  currentDepth?: number
  averageProcessingTimeMs?: number
}

interface QueueStatusData {
  stats?: QueueStats
  entries?: QueueEntry[]
}

interface MonitorEvent {
  id?: string
  type?: string
  eventType?: string
  message?: string
  durationMs?: number
  timestamp?: number
}

interface MonitorData {
  stats?: { messagesSent?: number; messagesFailed?: number; totalEvents?: number; logLines?: number }
  recentEvents?: MonitorEvent[]
  messageLog?: string[]
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; class: string }> = {
    ready: { label: 'Ready', class: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30' },
    partial: { label: 'Partial', class: 'bg-yellow-50 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-500/30' },
    disabled: { label: 'Disabled', class: 'bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-800' },
  }
  const c = config[status] || { label: status, class: 'bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-800' }
  return <span className={'text-xs font-medium px-2 py-0.5 rounded-full border ' + c.class}>{c.label}</span>
}

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { label: string; class: string }> = {
    error: { label: 'Error', class: 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30' },
    warning: { label: 'Warning', class: 'bg-yellow-50 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-500/30' },
    info: { label: 'Info', class: 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30' },
  }
  const c = config[severity] || { label: severity, class: 'bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-800' }
  return <span className={'text-xs font-medium px-2 py-0.5 rounded-full border ' + c.class}>{c.label}</span>
}

function TimestampDisplay({ ts }: { ts: number }) {
  return <span className="text-xs text-muted-foreground">{new Date(ts).toLocaleString()}</span>
}

export default async function AdminTeamsPage() {
  const user = await getCurrentUser()
  if (user.role !== 'admin') redirect('/dashboard')

  const [statusData, validationData, queueData, monitorData] = await Promise.all([
    getTeamsStatus().catch(() => ({ status: 'disabled', message: 'Backend not reachable' })),
    getTeamsConfigValidation().catch(() => ({ valid: false, mockMode: true, results: [] })),
    getTeamsQueueStatus().catch(() => ({ stats: { totalProcessed: 0, totalFailed: 0, totalRetried: 0, currentDepth: 0, averageProcessingTimeMs: 0 }, entries: [] })),
    getTeamsMonitorEvents().catch(() => ({ stats: { messagesSent: 0, messagesFailed: 0, totalEvents: 0, logLines: 0 }, recentEvents: [] })),
  ])

  const status = statusData as TeamsStatusData
  const validation = validationData as ValidationData
  const queue = queueData as QueueStatusData
  const monitor = monitorData as MonitorData

  return (
    <div className="space-y-6" data-tour="teams-integration">
      <div data-tour="teams-header">
      <PageHeader
          title="Microsoft Teams Integration"
          subtitle="Configure and monitor Teams notification delivery"
          icon={<MessageSquare className="h-5 w-5" />}
          iconVariant="purple"
        />
      </div>

      <div className="space-y-6">
        {/* Status Overview */}
        <Card data-tour="teams-status">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Integration Status
              <div className="ml-auto">
                <StatusBadge status={status.status || 'disabled'} />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="text-sm font-semibold mt-1">{status.provider || 'microsoft-teams'}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Mode</p>
                <p className="text-sm font-semibold mt-1">
                  {status.mockMode ? (
                    <span className="text-amber-600 dark:text-amber-400">Mock (Dev Mode)</span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400">Live</span>
                  )}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Messages Sent</p>
                <p className="text-lg font-bold mt-1">{status.messagesSent || 0}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Messages Failed</p>
                <p className="text-lg font-bold mt-1 text-red-500 dark:text-red-400">{status.messagesFailed || 0}</p>
              </div>
            </div>
            <div className="mt-3 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              {status.message || 'Teams integration status unknown'}
            </div>
          </CardContent>
        </Card>

        {/* Configuration Validation */}
        <Card data-tour="teams-validation">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Configuration Validation
              <Badge variant="outline" className="ml-auto text-xs">
                {validation.valid ? (validation.mockMode ? 'Mock Mode' : 'All Checks Passed') : 'Issues Found'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(validation.results || []).map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center gap-3">
                    {r.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />
                    )}
                    <div>
                      <p className="text-xs font-medium">{r.label}</p>
                      <p className="text-xs text-muted-foreground">{r.message}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.value && <code className="text-xs bg-muted px-2 py-0.5 rounded">{r.value}</code>}
                    <SeverityBadge severity={r.severity || 'info'} />
                  </div>
                </div>
              ))}
              {(!validation.results || validation.results.length === 0) && (
                <p className="text-xs text-muted-foreground text-center py-4">No validation results available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Queue Status */}
        <Card data-tour="teams-queue">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Queue Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Current Depth</p>
                <p className="text-lg font-bold mt-1">{(queue.stats?.currentDepth || 0)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Processed</p>
                <p className="text-lg font-bold mt-1">{(queue.stats?.totalProcessed || 0)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-lg font-bold mt-1 text-red-500 dark:text-red-400">{(queue.stats?.totalFailed || 0)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Retried</p>
                <p className="text-lg font-bold mt-1 text-amber-500 dark:text-amber-400">{(queue.stats?.totalRetried || 0)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Avg Processing</p>
                <p className="text-lg font-bold mt-1">{(queue.stats?.averageProcessingTimeMs || 0)}ms</p>
              </div>
            </div>

            {queue.entries && queue.entries.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Pending Entries ({queue.entries.length})</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left font-medium text-muted-foreground px-2 py-1">Event</th>
                        <th className="text-right font-medium text-muted-foreground px-2 py-1">Retries</th>
                        <th className="text-right font-medium text-muted-foreground px-2 py-1">Max</th>
                        <th className="text-right font-medium text-muted-foreground px-2 py-1">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.entries.map((e, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-2 py-1.5 font-mono">{e.eventType}</td>
                          <td className="px-2 py-1.5 text-right">{e.retryCount}</td>
                          <td className="px-2 py-1.5 text-right">{e.maxRetries}</td>
                          <td className="px-2 py-1.5 text-right text-muted-foreground">
                            {e.createdAt ? new Date(e.createdAt).toLocaleTimeString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client-side Actions */}
        <TeamsStatusClient />

        {/* Recent Monitor Events */}
        <Card data-tour="teams-monitor">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Recent Events
              <Badge variant="outline" className="ml-auto text-xs">
                {(monitor.stats?.totalEvents || 0)} events
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(monitor.recentEvents && monitor.recentEvents.length > 0) ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-medium text-muted-foreground px-4 py-2">Type</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2">Event</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2">Message</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-2">Duration</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-2">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitor.recentEvents.slice(0, 20).map((evt) => (
                      <tr key={evt.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-4 py-2">
                          <Badge variant="outline" className="text-[11px]">{evt.type}</Badge>
                        </td>
                        <td className="px-4 py-2 font-mono text-muted-foreground">{evt.eventType || '-'}</td>
                        <td className="px-4 py-2 max-w-[300px] truncate" title={evt.message}>{evt.message}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {evt.durationMs ? evt.durationMs + 'ms' : '-'}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          <TimestampDisplay ts={evt.timestamp || 0} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No events recorded yet. Use the test button above to send a test message.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Environment Variables Reference */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Environment Variables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { key: 'TEAMS_WEBHOOK_URL', desc: 'Power Automate Workflow Webhook URL for Teams notifications', required: true },
              ].map((env) => (
                <div key={env.key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center gap-3">
                    <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{env.key}</code>
                    <span className="text-xs text-muted-foreground">{env.desc}</span>
                  </div>
                  {env.required ? (
                    <Badge variant="outline" className="text-[11px] text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15">Required</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px] text-muted-foreground">Optional</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
