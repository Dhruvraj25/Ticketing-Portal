'use server'

// ============================================================================
// Project-wise Notification Preferences — server actions (Admin / Manager)
// ============================================================================
// Thin proxy to the backend's existing PROJECT preference API
// (Backend/src/routes/project-notification-preferences.ts +
// services/notification-preference.service.ts) — no parallel notification
// system, no duplicated authorization logic. The backend re-resolves the
// caller's role/session from the forwarded cookie and re-verifies the
// project exists on every call:
//   - Admin           → any project
//   - Project Manager → only projects they manage (project.managerId)
//   - Anyone else     → 403 (enforced server-side, never only hidden in the UI)
//
// These PROJECT preferences are authoritative for CLIENT recipients of
// events tied to this project (see notify-all.ts / the backend email+Teams
// bridge routes). They do NOT affect Admin/Manager/Project Manager/Developer
// notification behavior — internal staff keep using their own existing
// self-serve preferences (app/actions/notification-preferences.ts),
// completely unaffected by a project's client-facing toggle.
// ============================================================================

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'

export interface ProjectNotificationPreferenceSetting {
  eventType: string
  label: string
  group: string
  inApp: boolean
  email: boolean
  teams: boolean
}

export interface ProjectNotificationPreferencesResponse {
  projectId: number
  projectName: string
  clientId: string
  channels: { channel: 'in_app' | 'email' | 'teams'; label: string }[]
  preferences: ProjectNotificationPreferenceSetting[]
}

async function forwardCookies(): Promise<string> {
  const { headers } = await import('next/headers')
  const cookieHeader = await headers()
  return cookieHeader.get('cookie') || ''
}

/** GET a project's current effective notification settings from the backend. */
export async function getProjectNotificationPreferences(projectId: number): Promise<ProjectNotificationPreferencesResponse> {
  const sessionCookie = await forwardCookies()
  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/notification-preferences`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    cache: 'no-store',
  })
  if (!res.ok) {
    // Never surface the backend's raw error body (may include internal
    // details) — a safe, role-appropriate message is enough for the UI.
    let message = 'Unable to load notification preferences for this project.'
    if (res.status === 403) message = 'You do not have permission to manage this project\'s notification preferences.'
    else if (res.status === 404) message = 'Project not found.'
    console.error(`[ProjectNotificationPreferences] GET failed (${res.status}) for project ${projectId}`)
    throw new Error(message)
  }
  return (await res.json()) as ProjectNotificationPreferencesResponse
}

/** PUT a single toggle change for a project; returns the updated effective settings. */
export async function updateProjectNotificationPreference(
  projectId: number,
  eventType: string,
  channel: 'in_app' | 'email' | 'teams',
  enabled: boolean,
): Promise<ProjectNotificationPreferencesResponse> {
  const sessionCookie = await forwardCookies()
  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/notification-preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    cache: 'no-store',
    body: JSON.stringify({ preferences: [{ eventType, channel, enabled }] }),
  })
  if (!res.ok) {
    let message = 'Failed to save this project\'s notification preference.'
    if (res.status === 403) message = 'You do not have permission to manage this project\'s notification preferences.'
    else if (res.status === 404) message = 'Project not found.'
    console.error(`[ProjectNotificationPreferences] PUT failed (${res.status}) for project ${projectId}`)
    throw new Error(message)
  }
  return (await res.json()) as ProjectNotificationPreferencesResponse
}
