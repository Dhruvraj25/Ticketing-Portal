'use server'

// ============================================================================
// Admin → Email Management — server actions
// ============================================================================
// Thin proxy to the backend's admin-only /api/email-admin/* routes (the backend
// owns the email provider, queue, templates and sender configuration). Same
// transport as app/actions/teams.ts: absolute BACKEND_URL + the caller's session
// cookie forwarded so the backend can re-verify the ADMIN role on every call.
// Never returns or logs secrets — the backend only ever sends safe values.
// ============================================================================

import { headers } from 'next/headers'
import { wrapServerAction } from '@/lib/performance-profiler'

const API_BASE = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000') + '/api/email-admin'

export interface EmailAdminResult<T> {
  ok: boolean
  data?: T
  error?: string
  /** Extra safe detail from the backend (e.g. why Graph rejected a sender). */
  reason?: string
  /** Field-level validation messages (e.g. template editor). */
  errors?: string[]
}

async function call<T>(path: string, init?: RequestInit): Promise<EmailAdminResult<T>> {
  let cookie = ''
  try {
    cookie = (await headers()).get('cookie') || ''
  } catch {
    cookie = ''
  }
  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Cookie: cookie, ...init?.headers },
      cache: 'no-store',
    })
  } catch {
    return { ok: false, error: 'Could not reach the backend server. Verify BACKEND_URL is configured and the backend is running.' }
  }
  if (res.status === 401) return { ok: false, error: 'Your session could not be verified. Please sign in again.' }
  if (res.status === 403) return { ok: false, error: 'Only administrators can manage email settings.' }
  const body = (await res.json().catch(() => null)) as (T & { error?: string; reason?: string; errors?: unknown }) | null
  if (!res.ok) {
    return {
      ok: false,
      error: (body && typeof body.error === 'string' && body.error) || `The backend returned an unexpected error (HTTP ${res.status}).`,
      reason: body && typeof body.reason === 'string' ? body.reason : undefined,
      errors: body && Array.isArray(body.errors) ? body.errors.filter((e): e is string => typeof e === 'string') : undefined,
    }
  }
  return { ok: true, data: body as T }
}

// ─── Types (mirrors Backend/src/routes/email-admin.ts responses) ────────────

export type EmailPeriod = 'today' | '7d' | '30d' | 'custom'

export interface EmailOverview {
  period: string
  total: number
  delivered: number
  failed: number
  pending: number
  bounced: number | null
  deliveryRate: number | null
  liveQueueDepth: number
}

export interface EmailProviderStatus {
  provider: string
  providerLabel: string
  configured: boolean
  status: 'connected' | 'disconnected' | 'unchecked'
  lastCheckedAt: string | null
  lastError: string | null
}

export interface EmailSenderConfig {
  senderEmail: string | null
  senderName: string | null
  source: 'database' | 'environment' | 'none'
  environmentSenderEmail: string | null
  provider: string
  providerLabel: string
  status: 'verified' | 'verification_required' | 'disconnected'
  lastVerifiedAt: string | null
  lastAttempt: { email: string | null; at: string; error: string | null } | null
}

export interface EmailLogItem {
  id: number
  eventType: string
  recipient: string
  cc: string[]
  subject: string
  ticketNumber: string | null
  projectName: string | null
  status: 'pending' | 'sending' | 'sent' | 'failed'
  fromAddress: string | null
  attempts: number
  maxAttempts: number
  error: string | null
  createdAt: string
  sentAt: string | null
}

export interface EmailLogQuery {
  status?: string
  eventType?: string
  search?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

export interface EmailQueueEntry {
  id: string
  eventType: string
  recipient: string
  subject: string
  attempts: number
  maxRetries: number
  createdAt: string
}

export type EmailTemplateStatus = 'default' | 'customized' | 'customized_inactive'

export interface EmailTemplateItem {
  eventType: string
  label: string
  defaultLabel: string
  recipient: string
  status: EmailTemplateStatus
  updatedAt: string | null
  lastSubject: string | null
  lastSentAt: string | null
}

export interface EmailTemplateContent {
  name: string
  subject: string
  htmlBody: string
  textBody: string | null
}

export interface EmailTemplateEditorData {
  eventType: string
  label: string
  recipient: string
  status: EmailTemplateStatus
  /** The only placeholders this template supports (derived from the real template). */
  variables: string[]
  limits: { name: number; subject: number; htmlBody: number; textBody: number }
  default: EmailTemplateContent
  customized: (EmailTemplateContent & { isActive: boolean; updatedAt: string }) | null
}

export interface EmailTemplatePreview {
  eventType: string
  label: string
  recipient: string
  subject: string
  html: string
  variables: string[]
  customized?: boolean
}

// ─── Actions ────────────────────────────────────────────────────────────────

export const getEmailOverview = wrapServerAction('getEmailOverview', async function getEmailOverview(
  period: EmailPeriod,
  from?: string,
  to?: string,
) {
  const qs = new URLSearchParams({ period })
  if (period === 'custom') {
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
  }
  return call<EmailOverview>('/overview?' + qs.toString())
})

export const getEmailProviderStatus = wrapServerAction('getEmailProviderStatus', async function getEmailProviderStatus() {
  return call<EmailProviderStatus>('/provider')
})

export const testEmailProviderConnection = wrapServerAction('testEmailProviderConnection', async function testEmailProviderConnection() {
  return call<{ status: 'connected' | 'disconnected'; lastCheckedAt: string; error: string | null }>('/provider/test', { method: 'POST' })
})

export const getEmailSenderConfig = wrapServerAction('getEmailSenderConfig', async function getEmailSenderConfig() {
  return call<EmailSenderConfig>('/sender')
})

export const saveAndVerifyEmailSender = wrapServerAction('saveAndVerifyEmailSender', async function saveAndVerifyEmailSender(
  senderEmail: string,
  senderName: string,
) {
  return call<{ success: true; senderEmail: string; senderName: string | null; status: 'verified'; lastVerifiedAt: string }>('/sender', {
    method: 'PUT',
    body: JSON.stringify({ senderEmail, senderName }),
  })
})

export const sendEmailAdminTest = wrapServerAction('sendEmailAdminTest', async function sendEmailAdminTest(to: string) {
  return call<{ accepted: boolean; from?: string | null; error?: string }>('/test-email', {
    method: 'POST',
    body: JSON.stringify({ to }),
  })
})

export const getEmailLogsAdmin = wrapServerAction('getEmailLogsAdmin', async function getEmailLogsAdmin(query: EmailLogQuery = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  }
  return call<{ logs: EmailLogItem[]; total: number; page: number; limit: number }>('/logs?' + qs.toString())
})

export const getEmailLogDetail = wrapServerAction('getEmailLogDetail', async function getEmailLogDetail(id: number) {
  return call<EmailLogItem>('/logs/' + encodeURIComponent(String(id)))
})

export const getEmailLiveQueue = wrapServerAction('getEmailLiveQueue', async function getEmailLiveQueue() {
  return call<{ depth: number; entries: EmailQueueEntry[] }>('/queue')
})

export const getEmailEventTypes = wrapServerAction('getEmailEventTypes', async function getEmailEventTypes() {
  return call<{ eventTypes: string[] }>('/event-types')
})

export const getEmailTemplates = wrapServerAction('getEmailTemplates', async function getEmailTemplates() {
  return call<{ editable: boolean; templates: EmailTemplateItem[] }>('/templates')
})

export const getEmailTemplatePreview = wrapServerAction('getEmailTemplatePreview', async function getEmailTemplatePreview(eventType: string) {
  return call<EmailTemplatePreview>('/templates/' + encodeURIComponent(eventType) + '/preview')
})

// ─── Template editing (admin-customized overrides; code templates stay the default) ──

export const getEmailTemplateForEdit = wrapServerAction('getEmailTemplateForEdit', async function getEmailTemplateForEdit(eventType: string) {
  return call<EmailTemplateEditorData>('/templates/' + encodeURIComponent(eventType))
})

export const saveEmailTemplate = wrapServerAction('saveEmailTemplate', async function saveEmailTemplate(
  eventType: string,
  template: EmailTemplateContent & { isActive: boolean },
) {
  return call<{ success: true; eventType: string; status: EmailTemplateStatus; updatedAt: string }>(
    '/templates/' + encodeURIComponent(eventType),
    { method: 'PUT', body: JSON.stringify(template) },
  )
})

export const resetEmailTemplate = wrapServerAction('resetEmailTemplate', async function resetEmailTemplate(eventType: string) {
  return call<{ success: true; eventType: string; status: 'default'; removed: boolean }>(
    '/templates/' + encodeURIComponent(eventType),
    { method: 'DELETE' },
  )
})

export const previewEmailTemplateDraft = wrapServerAction('previewEmailTemplateDraft', async function previewEmailTemplateDraft(
  eventType: string,
  draft: { subject: string; htmlBody: string; textBody: string | null },
) {
  return call<{ subject: string; html: string; text: string | null }>(
    '/templates/' + encodeURIComponent(eventType) + '/preview',
    { method: 'POST', body: JSON.stringify(draft) },
  )
})