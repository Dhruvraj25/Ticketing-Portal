'use server'

import { wrapServerAction } from '@/lib/performance-profiler'

// Root cause fix: this previously read NEXT_PUBLIC_API_URL, defaulting to
// the RELATIVE path '/api'. Called from a server action (Node.js, no
// browser document.baseURI to resolve a relative URL against), fetch() on a
// relative path throws `TypeError: Failed to parse URL from /api/teams/...`
// immediately — every Teams admin call failed this way whenever
// NEXT_PUBLIC_API_URL was unset (confirmed: it is not set anywhere in this
// project's env files). Consolidated onto the SAME BACKEND_URL /
// NEXT_PUBLIC_BACKEND_URL convention already used by lib/email-backend.ts
// (the working email bridge) instead of a second, inconsistent variable —
// and the fallback is now an ABSOLUTE URL so a misconfigured production
// environment fails with a catchable network error, never a URL-parse crash.
const API_BASE = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000') + '/api'

async function fetchFromBackend(path: string, options?: RequestInit) {
  const url = API_BASE + '/teams' + path
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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
  return fetchFromBackend('/test', { method: 'POST' })
})

export const clearTeamsQueue = wrapServerAction('clearTeamsQueue', async function clearTeamsQueue() {
  return fetchFromBackend('/queue/clear', { method: 'POST' })
})

export const resetTeamsMonitor = wrapServerAction('resetTeamsMonitor', async function resetTeamsMonitor() {
  return fetchFromBackend('/monitor/reset', { method: 'POST' })
})
