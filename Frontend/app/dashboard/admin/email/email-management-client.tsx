'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  Activity, AlertTriangle, CheckCircle2, Eye, Inbox, ListChecks, Loader2, Mail,
  RefreshCw, Search, Send, Server, ShieldCheck, XCircle,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatCard } from '@/components/dashboard/stat-card'
import { cn } from '@/lib/utils'
import {
  getEmailLogDetail,
  getEmailLogsAdmin,
  getEmailOverview,
  getEmailProviderStatus,
  getEmailSenderConfig,
  saveAndVerifyEmailSender,
  sendEmailAdminTest,
  testEmailProviderConnection,
  type EmailAdminResult,
  type EmailLogItem,
  type EmailOverview,
  type EmailPeriod,
  type EmailProviderStatus,
  type EmailQueueEntry,
  type EmailSenderConfig,
  type EmailTemplateItem,
} from '@/app/actions/email-admin'
import { EmailTemplatesSection } from './email-templates-section'

type LogsPayload = { logs: EmailLogItem[]; total: number; page: number; limit: number }

interface InitialData {
  overview: EmailAdminResult<EmailOverview>
  provider: EmailAdminResult<EmailProviderStatus>
  sender: EmailAdminResult<EmailSenderConfig>
  recent: EmailAdminResult<LogsPayload>
  templates: EmailAdminResult<{ editable: boolean; templates: EmailTemplateItem[] }>
  eventTypes: EmailAdminResult<{ eventTypes: string[] }>
  liveQueue: EmailAdminResult<{ depth: number; entries: EmailQueueEntry[] }>
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Same internal-scroll pattern as the Ticket List / Teams Recent Events.
const SCROLL_BOX = 'max-h-[420px] overflow-y-auto overscroll-contain'

// ─── Small presentational helpers ───────────────────────────────────────────

function humanize(eventType: string): string {
  return eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function timeAgo(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return isNaN(d.getTime()) ? '—' : formatDistanceToNow(d, { addSuffix: true })
}

function dateTime(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  sent: { label: 'Delivered', className: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30' },
  failed: { label: 'Failed', className: 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30' },
  pending: { label: 'Pending', className: 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30' },
  sending: { label: 'Sending', className: 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30' },
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, className: 'bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-800' }
  return <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap', s.className)}>{s.label}</span>
}

function ConnectionStatus({ status }: { status: 'connected' | 'verified' | 'verification_required' | 'disconnected' | 'unchecked' }) {
  if (status === 'connected' || status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-500" /> {status === 'verified' ? 'Verified' : 'Connected'}
      </span>
    )
  }
  if (status === 'verification_required' || status === 'unchecked') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" /> {status === 'unchecked' ? 'Not checked yet' : 'Verification Required'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
      <span className="h-2 w-2 rounded-full bg-red-500" /> Disconnected
    </span>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right min-w-0 break-words">{children}</span>
    </div>
  )
}

function LoadError({ message }: { message?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
      <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{message || 'Unable to load this section.'}</span>
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export function EmailManagementClient({ initial }: { initial: InitialData }) {
  // Kept in sync by EmailTemplatesSection after edits/resets (labels + Email Events table).
  const [templates, setTemplates] = useState<EmailTemplateItem[]>(initial.templates.data?.templates ?? [])
  const labelFor = useCallback(
    (eventType: string) => {
      if (eventType === 'test_email') return 'Test Email'
      if (eventType === 'sender_verification') return 'Sender Verification'
      return templates.find((t) => t.eventType === eventType)?.label ?? humanize(eventType)
    },
    [templates],
  )

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const [period, setPeriod] = useState<EmailPeriod>('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [overview, setOverview] = useState(initial.overview)
  const [overviewLoading, setOverviewLoading] = useState(false)

  const loadOverview = useCallback(async (p: EmailPeriod, from?: string, to?: string) => {
    setOverviewLoading(true)
    try {
      setOverview(await getEmailOverview(p, from, to))
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  function changePeriod(p: EmailPeriod) {
    setPeriod(p)
    if (p !== 'custom') loadOverview(p)
  }

  // ── Provider ──────────────────────────────────────────────────────────────
  const [provider, setProvider] = useState(initial.provider)
  const [testingConnection, setTestingConnection] = useState(false)

  async function handleTestConnection() {
    setTestingConnection(true)
    try {
      const res = await testEmailProviderConnection()
      if (res.ok && res.data?.status === 'connected') toast.success('Microsoft Graph connection verified')
      else toast.error(res.data?.error || res.error || 'Connection test failed')
      setProvider(await getEmailProviderStatus())
    } finally {
      setTestingConnection(false)
    }
  }

  // ── Sender ────────────────────────────────────────────────────────────────
  const [sender, setSender] = useState(initial.sender)
  const [senderDialogOpen, setSenderDialogOpen] = useState(false)
  const [formEmail, setFormEmail] = useState('')
  const [formName, setFormName] = useState('')
  const [formError, setFormError] = useState<{ message: string; reason?: string } | null>(null)
  const [savingSender, setSavingSender] = useState(false)

  function openSenderDialog() {
    setFormEmail(sender.data?.senderEmail ?? '')
    setFormName(sender.data?.senderName ?? '')
    setFormError(null)
    setSenderDialogOpen(true)
  }

  async function handleSaveSender() {
    const email = formEmail.trim()
    if (!EMAIL_RE.test(email)) {
      setFormError({ message: 'Enter a valid sender email address.' })
      return
    }
    setSavingSender(true)
    setFormError(null)
    try {
      const res = await saveAndVerifyEmailSender(email, formName.trim())
      if (res.ok) {
        toast.success('Sender verified with Microsoft Graph and activated')
        setSenderDialogOpen(false)
      } else {
        setFormError({ message: res.error || 'Unable to verify this sender email with Microsoft Graph.', reason: res.reason })
      }
      setSender(await getEmailSenderConfig())
    } finally {
      setSavingSender(false)
    }
  }

  // ── Test email ────────────────────────────────────────────────────────────
  const [testRecipient, setTestRecipient] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleSendTest() {
    const to = testRecipient.trim()
    if (!EMAIL_RE.test(to)) {
      setTestResult({ ok: false, message: 'Enter a valid test recipient email address.' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await sendEmailAdminTest(to)
      if (res.ok && res.data?.accepted) {
        setTestResult({ ok: true, message: `Test email accepted${res.data.from ? ` (sent as ${res.data.from})` : ''}` })
      } else {
        setTestResult({ ok: false, message: `Test email failed: ${res.data?.error || res.error || 'unknown error'}` })
      }
      refreshRecent()
    } finally {
      setTesting(false)
    }
  }

  // ── Recent activity ───────────────────────────────────────────────────────
  const [recent, setRecent] = useState(initial.recent)
  const refreshRecent = useCallback(async () => {
    setRecent(await getEmailLogsAdmin({ limit: 30 }))
  }, [])

  // ── Details dialog (shared by queue / failed / logs) ──────────────────────
  const [detail, setDetail] = useState<EmailLogItem | null>(null)
  async function openDetail(id: number) {
    const res = await getEmailLogDetail(id)
    if (res.ok && res.data) setDetail(res.data)
    else toast.error(res.error || 'Unable to load the email')
  }

  const ov = overview.data
  const senderData = sender.data
  const providerData = provider.data

  return (
    <div className="space-y-6">
      {/* ── Statistics ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-end gap-2">
          {period === 'custom' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-40" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-40" />
              </div>
              <Button size="sm" className="h-9" onClick={() => loadOverview('custom', customFrom, customTo)} disabled={overviewLoading}>
                Apply
              </Button>
            </>
          )}
          <Select value={period} onValueChange={(v) => changePeriod(v as EmailPeriod)}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {overviewLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mb-2.5" />}
        </div>

        {!overview.ok || !ov ? (
          <LoadError message={overview.error} />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <StatCard title="Emails Sent" value={ov.total} iconName="Mail" colorTheme="blue" />
              <StatCard title="Delivered" value={ov.delivered} colorTheme="emerald" />
              <StatCard title="Failed" value={ov.failed} colorTheme="red" />
              <StatCard title="Pending" value={ov.pending} colorTheme="amber" />
              <StatCard title="Bounced" value={ov.bounced ?? 'N/A'} colorTheme="gray" />
              <StatCard title="Delivery Rate" value={ov.deliveryRate == null ? '—' : `${ov.deliveryRate}%`} colorTheme="indigo" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              &ldquo;Delivered&rdquo; means accepted by the email provider. Microsoft Graph does not report mailbox delivery or bounces,
              so Bounced is not available. Delivery rate = delivered ÷ (delivered + failed).
            </p>
          </>
        )}
      </div>

      {/* ── Provider / Sender / Recent activity ────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Provider */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Server className="h-4 w-4" /> Email Provider Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!provider.ok || !providerData ? (
              <LoadError message={provider.error} />
            ) : (
              <>
                <InfoRow label="Provider">{providerData.providerLabel}</InfoRow>
                <InfoRow label="Status"><ConnectionStatus status={providerData.status} /></InfoRow>
                <InfoRow label="Last Checked">{dateTime(providerData.lastCheckedAt)}</InfoRow>
                {providerData.lastError && providerData.status !== 'connected' && (
                  <p className="text-xs text-red-600 dark:text-red-400">{providerData.lastError}</p>
                )}
                <Button variant="outline" size="sm" className="w-full" onClick={handleTestConnection} disabled={testingConnection || providerData.provider !== 'microsoft-graph'}>
                  {testingConnection ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Test Connection
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Sender */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Sender Email Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!sender.ok || !senderData ? (
              <LoadError message={sender.error} />
            ) : (
              <>
                <InfoRow label="Current Sender Email">{senderData.senderEmail ?? 'Not configured'}</InfoRow>
                <InfoRow label="Sender Name">{senderData.senderName ?? '—'}</InfoRow>
                <InfoRow label="Provider">{senderData.providerLabel}</InfoRow>
                <InfoRow label="Status"><ConnectionStatus status={senderData.status} /></InfoRow>
                <InfoRow label="Last Verified">{dateTime(senderData.lastVerifiedAt)}</InfoRow>
                {senderData.source === 'environment' && (
                  <p className="text-[11px] text-muted-foreground">
                    Using the server default sender. Use Change Sender Email to verify it (or another mailbox) with Microsoft Graph.
                  </p>
                )}
                {senderData.lastAttempt?.error && (
                  <p className="text-[11px] text-red-600 dark:text-red-400">
                    Last verification of {senderData.lastAttempt.email} failed ({timeAgo(senderData.lastAttempt.at)}): {senderData.lastAttempt.error}
                  </p>
                )}
                <Button size="sm" className="w-full" onClick={openSenderDialog}>
                  <Mail className="h-4 w-4 mr-2" /> Change Sender Email
                </Button>

                <div className="pt-3 border-t border-border space-y-2">
                  <Label htmlFor="test-recipient" className="text-xs">Test Recipient</Label>
                  <div className="flex gap-2">
                    <Input id="test-recipient" type="email" placeholder="name@example.com" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} className="h-9" />
                    <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={handleSendTest} disabled={testing}>
                      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      <span className="ml-2">Send Test Email</span>
                    </Button>
                  </div>
                  {testResult && (
                    <p className={cn('text-xs flex items-start gap-1.5', testResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0" /> : <XCircle className="h-3.5 w-3.5 mt-px shrink-0" />}
                      {testResult.message}
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4" /> Recent Email Activity
              <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={refreshRecent} aria-label="Refresh recent activity">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!recent.ok || !recent.data ? (
              <div className="p-4"><LoadError message={recent.error} /></div>
            ) : recent.data.logs.length === 0 ? (
              <p className="text-center py-8 text-xs text-muted-foreground">No email activity recorded yet.</p>
            ) : (
              <ul className={cn(SCROLL_BOX, 'divide-y divide-border')}>
                {recent.data.logs.map((log) => (
                  <li key={log.id}>
                    <button type="button" onClick={() => openDetail(log.id)} className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{labelFor(log.eventType)}</p>
                        <StatusPill status={log.status} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">To: {log.recipient}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.ticketNumber ? `Ticket #${log.ticketNumber} · ` : log.projectName ? `Project: ${log.projectName} · ` : ''}
                        {timeAgo(log.createdAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <EmailQueueSection labelFor={labelFor} onView={openDetail} liveQueue={initial.liveQueue.data} />

      <FailedEmailsSection labelFor={labelFor} onView={openDetail} />

      <EmailTemplatesSection initial={initial.templates} onTemplatesChange={setTemplates} />

      {/* ── Email events ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><ListChecks className="h-4 w-4" /> Email Events</CardTitle>
          <CardDescription className="text-xs">
            Platform events that send email. There is no platform-wide on/off switch per event; whether a given client receives an
            email is controlled by Client Notification Preferences (per project).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className={cn(SCROLL_BOX, 'overflow-x-auto')}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2">Event</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2">Email</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2">Recipient</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.eventType} className="border-b border-border/50">
                    <td className="px-4 py-2 font-medium text-foreground">{t.label}</td>
                    <td className="px-4 py-2">Enabled</td>
                    <td className="px-4 py-2 text-muted-foreground">{t.recipient}</td>
                    <td className="px-4 py-2 text-muted-foreground">{t.lastSentAt ? `Last sent ${timeAgo(t.lastSentAt)}` : 'No emails yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <EmailLogsSection labelFor={labelFor} onView={openDetail} eventTypes={initial.eventTypes.data?.eventTypes ?? []} providerLabel={providerData?.providerLabel ?? '—'} />

      {/* ── Change sender dialog ───────────────────────────────────────── */}
      <Dialog open={senderDialogOpen} onOpenChange={(o) => { if (!savingSender) setSenderDialogOpen(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Sender Email</DialogTitle>
            <DialogDescription>
              The mailbox must belong to your Microsoft 365 tenant and be one this app is allowed to send as. A verification email is
              sent from it; the sender only becomes active if Microsoft Graph accepts it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sender-email">Sender Email</Label>
              <Input id="sender-email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="support@yourcompany.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sender-name">Sender Name</Label>
              <Input id="sender-name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Support Hero" maxLength={100} />
            </div>
            {formError && (
              <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300 space-y-1">
                <p className="font-medium">{formError.message}</p>
                {formError.reason && <p>{formError.reason}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSenderDialogOpen(false)} disabled={savingSender}>Cancel</Button>
            <Button onClick={handleSaveSender} disabled={savingSender}>
              {savingSender && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save &amp; Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Email detail dialog ────────────────────────────────────────── */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Email Details</DialogTitle>
            <DialogDescription>{detail ? labelFor(detail.eventType) : ''}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-2">
              <InfoRow label="Email ID">{detail.id}</InfoRow>
              <InfoRow label="Event"><span className="font-mono text-xs">{detail.eventType}</span></InfoRow>
              <InfoRow label="Recipient">{detail.recipient}</InfoRow>
              <InfoRow label="CC">{detail.cc.length > 0 ? detail.cc.join(', ') : '—'}</InfoRow>
              <InfoRow label="Subject">{detail.subject}</InfoRow>
              <InfoRow label="Ticket">{detail.ticketNumber ?? '—'}</InfoRow>
              <InfoRow label="Project">{detail.projectName ?? '—'}</InfoRow>
              <InfoRow label="Sent As">{detail.fromAddress ?? '—'}</InfoRow>
              <InfoRow label="Created At">{dateTime(detail.createdAt)}</InfoRow>
              <InfoRow label="Sent At">{dateTime(detail.sentAt)}</InfoRow>
              <InfoRow label="Status"><StatusPill status={detail.status} /></InfoRow>
              <InfoRow label="Attempts">{detail.attempts} / {detail.maxAttempts}</InfoRow>
              {detail.error && <InfoRow label="Error"><span className="text-red-600 dark:text-red-400">{detail.error}</span></InfoRow>}
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}

// ─── Email Queue ────────────────────────────────────────────────────────────

const QUEUE_TABS: { key: string; label: string; status?: string; unsupported?: boolean }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending', status: 'pending' },
  { key: 'sending', label: 'Sending', status: 'sending' },
  { key: 'sent', label: 'Delivered', status: 'sent' },
  { key: 'failed', label: 'Failed', status: 'failed' },
  { key: 'bounced', label: 'Bounced', unsupported: true },
]

function EmailQueueSection({
  labelFor,
  onView,
  liveQueue,
}: {
  labelFor: (e: string) => string
  onView: (id: number) => void
  liveQueue?: { depth: number; entries: EmailQueueEntry[] }
}) {
  const [tab, setTab] = useState('all')
  const [result, setResult] = useState<EmailAdminResult<LogsPayload> | null>(null)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  const load = useCallback(async (key: string) => {
    const t = QUEUE_TABS.find((q) => q.key === key)
    if (t?.unsupported) {
      setResult(null)
      return
    }
    const id = ++requestId.current
    setLoading(true)
    try {
      const res = await getEmailLogsAdmin({ status: t?.status, limit: 50 })
      if (id === requestId.current) setResult(res)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(tab)
  }, [tab, load])

  const current = QUEUE_TABS.find((q) => q.key === tab)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Inbox className="h-4 w-4" /> Email Queue
          <Badge variant="outline" className="ml-auto text-xs">{liveQueue?.depth ?? 0} in live queue</Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          Failed sends are retried automatically (up to 3 attempts with backoff). Manual retry is not supported by the current queue.
        </CardDescription>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {QUEUE_TABS.map((q) => (
            <Button key={q.key} size="sm" variant={tab === q.key ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setTab(q.key)}>
              {q.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {current?.unsupported ? (
          <p className="text-center py-8 text-xs text-muted-foreground px-4">
            Bounce information is not available: Microsoft Graph accepts messages for delivery but does not report bounces to this application.
          </p>
        ) : loading && !result ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !result?.ok || !result.data ? (
          <div className="p-4"><LoadError message={result?.error} /></div>
        ) : result.data.logs.length === 0 ? (
          <p className="text-center py-8 text-xs text-muted-foreground">No emails in this view.</p>
        ) : (
          <div className={cn(SCROLL_BOX, 'overflow-x-auto')}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2">Event</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2">Recipient</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2">Subject</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2">Status</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2">Created</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2">Attempts</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.data.logs.map((log) => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-2 whitespace-nowrap">{labelFor(log.eventType)}</td>
                    <td className="px-4 py-2 max-w-[200px] truncate" title={log.recipient}>{log.recipient}</td>
                    <td className="px-4 py-2 max-w-[260px] truncate" title={log.subject}>{log.subject}</td>
                    <td className="px-4 py-2"><StatusPill status={log.status} /></td>
                    <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{timeAgo(log.createdAt)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{log.attempts}</td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="sm" className="h-7" onClick={() => onView(log.id)}><Eye className="h-3.5 w-3.5 mr-1" />View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Failed emails ──────────────────────────────────────────────────────────

function FailedEmailsSection({ labelFor, onView }: { labelFor: (e: string) => string; onView: (id: number) => void }) {
  const [result, setResult] = useState<EmailAdminResult<LogsPayload> | null>(null)

  useEffect(() => {
    let cancelled = false
    getEmailLogsAdmin({ status: 'failed', limit: 50 }).then((r) => { if (!cancelled) setResult(r) })
    return () => { cancelled = true }
  }, [])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-500" /> Failed Emails
          {result?.data && <Badge variant="outline" className="ml-auto text-xs">{result.data.total} failed</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!result ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !result.ok || !result.data ? (
          <div className="p-4"><LoadError message={result.error} /></div>
        ) : result.data.logs.length === 0 ? (
          <p className="text-center py-6 text-xs text-muted-foreground">No failed emails.</p>
        ) : (
          <ul className={cn(SCROLL_BOX, 'divide-y divide-border')}>
            {result.data.logs.map((log) => (
              <li key={log.id}>
                <button type="button" onClick={() => onView(log.id)} className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{labelFor(log.eventType)}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{log.attempts} attempt{log.attempts === 1 ? '' : 's'} · {timeAgo(log.createdAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{log.recipient}</p>
                  <p className="text-xs text-red-600 dark:text-red-400">{log.error ?? 'Failed'}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Email logs ─────────────────────────────────────────────────────────────

function EmailLogsSection({
  labelFor,
  onView,
  eventTypes,
  providerLabel,
}: {
  labelFor: (e: string) => string
  onView: (id: number) => void
  eventTypes: string[]
  providerLabel: string
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [eventType, setEventType] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<EmailAdminResult<LogsPayload> | null>(null)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  const load = useCallback(async (p: number) => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const res = await getEmailLogsAdmin({ search: search.trim() || undefined, status, eventType, from: from || undefined, to: to || undefined, page: p, limit: 50 })
      if (id === requestId.current) {
        setResult(res)
        setPage(p)
      }
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [search, status, eventType, from, to])

  useEffect(() => {
    load(1)
    // Filters apply on change; search applies on Enter / button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, eventType, from, to])

  const totalPages = result?.data ? Math.max(1, Math.ceil(result.data.total / result.data.limit)) : 1

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2"><Search className="h-4 w-4" /> Email Logs</CardTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-2">
          <div className="lg:col-span-2 flex gap-2">
            <Input placeholder="Search recipient, subject, ticket…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(1) }} className="h-9" />
            <Button size="sm" variant="outline" className="h-9" onClick={() => load(1)} aria-label="Search logs"><Search className="h-4 w-4" /></Button>
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="sending">Sending</SelectItem>
              <SelectItem value="sent">Delivered</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Event" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All events</SelectItem>
              {eventTypes.map((e) => <SelectItem key={e} value={e}>{labelFor(e)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" aria-label="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" aria-label="To date" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!result ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !result.ok || !result.data ? (
          <div className="p-4"><LoadError message={result.error} /></div>
        ) : result.data.logs.length === 0 ? (
          <p className="text-center py-8 text-xs text-muted-foreground">No emails match these filters.</p>
        ) : (
          <>
            <div className={cn(SCROLL_BOX, 'overflow-x-auto', loading && 'opacity-60')}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border">
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">Timestamp</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">Event</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">Recipient</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">Ticket</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">Project</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">Status</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.logs.map((log) => (
                    <tr key={log.id} onClick={() => onView(log.id)} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer">
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{dateTime(log.createdAt)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{labelFor(log.eventType)}</td>
                      <td className="px-4 py-2 max-w-[200px] truncate" title={log.recipient}>{log.recipient}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{log.ticketNumber ?? '—'}</td>
                      <td className="px-4 py-2 max-w-[160px] truncate">{log.projectName ?? '—'}</td>
                      <td className="px-4 py-2"><StatusPill status={log.status} /></td>
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{providerLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground border-t border-border">
              <span>{result.data.total} email{result.data.total === 1 ? '' : 's'}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>Previous</Button>
                <span>Page {page} of {totalPages}</span>
                <Button size="sm" variant="outline" className="h-7" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
