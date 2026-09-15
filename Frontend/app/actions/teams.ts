'use server'

import { headers } from 'next/headers'
import { wrapServerAction } from '@/lib/performance-profiler'

// Fix #1 (prior turn): this previously read NEXT_PUBLIC_API_URL, defaulting
// to the RELATIVE path '/api'. Called from a server action (Node.js, no
// browser document.baseURI to resolve a relative URL against), fetch() on a
// relative path throws `TypeError: Failed to parse URL from /api/teams/...`
// immediately. Consolidated onto the SAME BACKEND_URL / NEXT_PUBLIC_BACKEND_URL
// convention already used by lib/email-backend.ts, with an ABSOLUTE fallback.
const API_BASE = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000') + '/api'

// Fix #2 (THE ACTUAL root cause — traced end-to-end against a real running
// backend, see the diagnostic report): every /api/teams/* route is gated by
// requireAuth, which validates the session via
// auth.api.getSession({ headers: req.headers }) — Better Auth reads the
// session token from the request's Cookie header. This file's fetch() call
// NEVER forwarded the browser's session cookie (unlike lib/email-backend.ts's
// sendNotification(), which does), so EVERY call — status, config validation,
// queue, monitor, and the test-send — was unconditionally rejected with 401
// Unauthorized, independent of whether API_BASE pointed at the right host.
// Confirmed directly: `curl http://localhost:4000/api/teams/status` (no
// cookie) → 401 {"error":"Unauthorized"}. This alone explains all three
// reported symptoms: the queue stats always read zero (the 4 status calls
// each 401 and silently fall back to their catch() defaults in page.tsx),
// "Delivery failed"/"Webhook Error" (sendTeamsTestMessage's 401 surfaces as a
// generic thrown error), and is a strong contributor to the intermittent
// generic Server Components error in production.
/** Cookie NAMES only, never values — safe to log. */
function extractCookieNames(cookieHeader: string): string[] {
  if (!cookieHeader) return []
  return cookieHeader
    .split(';')
    .map((pair) => pair.split('=')[0]?.trim())
    .filter((name): name is string => !!name)
}

async function getSessionCookie(context: string): Promise<string> {
  try {
    const h = await headers()
    const cookie = h.get('cookie') || ''
    const names = extractCookieNames(cookie)
    // Safe diagnostic — cookie NAMES and counts only, never values.
    console.log(
      `[TeamsAuthBridge] path=${context} incomingCookiePresent=${!!cookie} ` +
      `incomingCookieCount=${names.length} forwardedCookiePresent=${!!cookie} ` +
      `forwardedCookieNames=[${names.join(',')}]`,
    )
    return cookie
  } catch (err) {
    console.warn(`[TeamsAuthBridge] path=${context} could not read incoming request headers: ${err instanceof Error ? err.message : 'unknown'}`)
    return ''
  }
}

/** Structured, sanitized result shape — see fetchFromBackendSafe(). */
export interface BackendCallResult<T = unknown> {
  ok: boolean
  data?: T
  stage?: 'network' | 'authentication' | 'authorization' | 'backend' | 'config'
  code?: string
  message?: string
  statusCode?: number
}

async function fetchFromBackend(path: string, options?: RequestInit) {
  const cookie = await getSessionCookie(path)
  const url = API_BASE + '/teams' + path
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
      ...options?.headers,
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error('Backend API error (' + res.status + '): ' + errorText)
  }
  return res.json()
}

/**
 * Same request as fetchFromBackend, but NEVER throws — returns a structured,
 * sanitized result so the caller (the interactive "Send Test Message" flow)
 * can distinguish the exact failure stage instead of a generic thrown string.
 * Never includes secrets, cookies, or stack traces in the returned message.
 */
async function fetchFromBackendSafe<T = unknown>(path: string, options?: RequestInit): Promise<BackendCallResult<T>> {
  const cookie = await getSessionCookie(path)
  const url = API_BASE + '/teams' + path
  let res: Response
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        ...options?.headers,
      },
      cache: 'no-store',
    })
  } catch (err) {
    return {
      ok: false,
      stage: 'network',
      code: 'BACKEND_UNREACHABLE',
      message: 'Could not reach the backend server. Verify BACKEND_URL is configured and the backend is running.',
    }
  }

  if (res.status === 401) {
    return { ok: false, stage: 'authentication', code: 'UNAUTHENTICATED', statusCode: 401, message: 'Your session could not be verified by the backend. Please sign in again.' }
  }
  if (res.status === 403) {
    return { ok: false, stage: 'authorization', code: 'FORBIDDEN', statusCode: 403, message: 'Your account does not have permission to perform this action.' }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // The backend returns a structured { error, code } body for channel
    // configuration failures. Surface its exact (already sanitized) error
    // message/code so the admin sees a useful reason — never a secret.
    let code = 'BACKEND_ERROR_' + res.status
    let message = 'The backend returned an unexpected error (HTTP ' + res.status + ').'
    let parsed: { error?: unknown; code?: unknown } | null = null
    try {
      parsed = JSON.parse(text) as { error?: unknown; code?: unknown }
    } catch {
      parsed = null
    }
    if (parsed && typeof parsed.code === 'string' && parsed.code) code = parsed.code
    if (parsed && typeof parsed.error === 'string' && parsed.error) message = parsed.error
    else if (!parsed && text) message = message + ' ' + text.slice(0, 300)
    return { ok: false, stage: 'backend', code, statusCode: res.status, message: message }
  }

  const data = await res.json().catch(() => undefined)
  return { ok: true, data: data as T, statusCode: res.status }
}

export const getTeamsStatus = wrapServerAction('getTeamsStatus', async function getTeamsStatus() {
  return fetchFromBackend('/status')
})

export const getTeamsConfigValidation = wrapServerAction('getTeamsConfigValidation', async function getTeamsConfigValidation() {
  return fetchFromBackend('/config/validate')
})

export const getTeamsQueueStatus = wrapServerAction('getTeamsQueueStatus', async function getTeamsQueueStatus() {
  return fetchFromBackend('/queue')
})

export const getTeamsMonitorEvents = wrapServerAction('getTeamsMonitorEvents', async function getTeamsMonitorEvents() {
  return fetchFromBackend('/monitor')
})

export const sendTeamsTestMessage = wrapServerAction('sendTeamsTestMessage', async function sendTeamsTestMessage() {
  const result = await fetchFromBackendSafe<Record<string, unknown>>('/test', { method: 'POST' })
  if (!result.ok) {
    // Sanitized structured failure — never a raw thrown string, never a
    // stack trace, never a secret. Matches the backend's own success shape
    // so TeamsStatusClient can render either uniformly.
    return {
      success: false,
      provider: 'teams',
      stage: result.stage,
      code: result.code,
      statusCode: result.statusCode,
      message: result.message,
      error: result.message,
    }
  }
  // Backend's /test route already returns its own rich { success, message,
  // statusCode, responseBody, error, mockMode, durationMs } shape — pass it
  // through unchanged (this is the real Teams webhook result, not the
  // bridge-layer result).
  return { provider: 'teams', ...result.data }
})

export const clearTeamsQueue = wrapServerAction('clearTeamsQueue', async function clearTeamsQueue() {
  return fetchFromBackend('/queue/clear', { method: 'POST' })
})

export const resetTeamsMonitor = wrapServerAction('resetTeamsMonitor', async function resetTeamsMonitor() {
  return fetchFromBackend('/monitor/reset', { method: 'POST' })
})

// ─── Per-Project Teams Channels (Phase 7) ──────────────────────────────────
// SECURITY: the backend NEVER returns the stored webhook URL — only status
// fields (configured / enabled / updatedAt). The admin can replace a link but
// can never read the existing one back.

export interface ProjectTeamsChannelStatus {
  projectId: number
  projectName: string
  projectCode: string
  projectStatus: string
  configured: boolean
  enabled: boolean
  updatedAt: string | null
}

export interface TeamsChannelMutationResult {
  success: boolean
  projectId?: number
  configured?: boolean
  enabled?: boolean
  updatedAt?: string
  removed?: boolean
  routing?: string
  statusCode?: number
  message?: string
  error?: string
  code?: string
  stage?: BackendCallResult['stage']
}

/** Project list with Teams channel status — admin only (backend enforces it). */
export const getTeamsProjectChannels = wrapServerAction('getTeamsProjectChannels', async function getTeamsProjectChannels() {
  return fetchFromBackend('/projects') as Promise<{ projects: ProjectTeamsChannelStatus[] }>
})

/**
 * Create or update a project's Teams channel.
 * Pass `webhookUrl` to set/replace the link; pass only `enabled` to toggle an
 * existing channel without re-entering the link.
 */
export const saveTeamsProjectChannel = wrapServerAction('saveTeamsProjectChannel', async function saveTeamsProjectChannel(
  projectId: number,
  input: { webhookUrl?: string; enabled?: boolean },
): Promise<TeamsChannelMutationResult> {
  const result = await fetchFromBackendSafe<Record<string, unknown>>('/projects/' + projectId + '/channel', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  if (!result.ok) {
    return {
      success: false,
      projectId,
      code: result.code ?? 'TEAMS_CHANNEL_SAVE_FAILED',
      message: result.message ?? 'Could not save the Teams channel configuration.',
      stage: result.stage,
    }
  }
  return { success: true, projectId, ...(result.data as Record<string, unknown>) } as TeamsChannelMutationResult
})

/** Remove a project's Teams channel configuration. */
export const removeTeamsProjectChannel = wrapServerAction('removeTeamsProjectChannel', async function removeTeamsProjectChannel(
  projectId: number,
): Promise<TeamsChannelMutationResult> {
  const result = await fetchFromBackendSafe<Record<string, unknown>>('/projects/' + projectId + '/channel', {
    method: 'DELETE',
  })
  if (!result.ok) {
    return {
      success: false,
      projectId,
      code: result.code ?? 'TEAMS_CHANNEL_REMOVE_FAILED',
      message: result.message ?? 'Could not remove the Teams channel configuration.',
      stage: result.stage,
    }
  }
  return { success: true, projectId, removed: true, ...(result.data as Record<string, unknown>) } as TeamsChannelMutationResult
})

/** Send a test message to one project's configured Teams channel. */
export const sendTeamsProjectTestMessage = wrapServerAction('sendTeamsProjectTestMessage', async function sendTeamsProjectTestMessage(
  projectId: number,
): Promise<TeamsChannelMutationResult> {
  const result = await fetchFromBackendSafe<Record<string, unknown>>('/projects/' + projectId + '/test', {
    method: 'POST',
  })
  if (!result.ok) {
    return {
      success: false,
      projectId,
      code: result.code ?? 'TEAMS_CHANNEL_TEST_FAILED',
      message: result.message ?? 'Could not send the test message.',
      stage: result.stage,
    }
  }
  return { success: true, projectId, ...(result.data as Record<string, unknown>) } as TeamsChannelMutationResult
})
