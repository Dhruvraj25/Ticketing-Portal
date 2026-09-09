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
async function getSessionCookie(): Promise<string> {
  try {
    const h = await headers()
    return h.get('cookie') || ''
  } catch {
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
  const cookie = await getSessionCookie()
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
  const cookie = await getSessionCookie()
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
    return { ok: false, stage: 'backend', code: 'BACKEND_ERROR_' + res.status, statusCode: res.status, message: 'The backend returned an unexpected error (HTTP ' + res.status + ').' + (text ? ' ' + text.slice(0, 300) : '') }
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
