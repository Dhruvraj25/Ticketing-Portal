'use server'

import { wrapServerAction } from '@/lib/performance-profiler'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'

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
