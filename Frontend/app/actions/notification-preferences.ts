'use server'

// ============================================================================
// Notification Preferences — server actions (Requirement #14)
// ============================================================================
// Read/write the authenticated user's per-event × per-channel notification
// preferences. Preferences live in the SHARED database (notification_preferences
// table, backend migration 0015) and are owned by the backend (Express), which
// also ENFORCES them on the email/Teams bridge routes. These actions simply
// proxy the settings UI to the backend REST API — the backend re-resolves the
// user from the forwarded session cookie, so a user can only ever read or
// modify their OWN preferences.
// ============================================================================

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'

export interface NotificationPreferenceSetting {
  eventType: string
  label: string
  group: string
  inApp: boolean
  email: boolean
  teams: boolean
}

export interface NotificationPreferencesResponse {
  channels: { channel: 'in_app' | 'email' | 'teams'; label: string }[]
  customerTeamsEnabled: boolean
  preferences: NotificationPreferenceSetting[]
}

async function forwardCookies(): Promise<string> {
  const { headers } = await import('next/headers')
  const cookieHeader = await headers()
  return cookieHeader.get('cookie') || ''
}

/** GET the current user's effective notification settings from the backend. */
export async function getNotificationPreferences(): Promise<NotificationPreferencesResponse> {
  const sessionCookie = await forwardCookies()
  const res = await fetch(`${BACKEND_URL}/api/notifications/preferences`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[NotificationPreferences] GET failed (${res.status}): ${text}`)
    throw new Error('Unable to load notification preferences')
  }
  return (await res.json()) as NotificationPreferencesResponse
}

/** PUT a single toggle change; returns the updated effective settings. */
export async function updateNotificationPreference(
  eventType: string,
  channel: 'in_app' | 'email' | 'teams',
  enabled: boolean,
): Promise<NotificationPreferencesResponse> {
  const sessionCookie = await forwardCookies()
  const res = await fetch(`${BACKEND_URL}/api/notifications/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    cache: 'no-store',
    body: JSON.stringify({ preferences: [{ eventType, channel, enabled }] }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[NotificationPreferences] PUT failed (${res.status}): ${text}`)
    throw new Error('Failed to save notification preference')
  }
  return (await res.json()) as NotificationPreferencesResponse
}
