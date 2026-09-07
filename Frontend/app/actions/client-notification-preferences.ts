'use server'

// ============================================================================
// Client-wise Notification Preferences — server actions (Admin / Manager)
// ============================================================================
// Read/write the notification preferences of a SPECIFIC client (a user with
// role 'client'), on behalf of an Admin or Project Manager.
//
// Storage: the SHARED database's `notification_preferences` table (backend
// migration 0015). The backend (Express) ENFORCES Email/Teams rows at dispatch
// time on its bridge routes and the frontend enforces In-App rows before
// inserting (lib/notification-preferences.ts), so a row written here takes
// effect immediately — no separate backend write path is needed.
//
// Authorization (enforced here, never only hidden in the UI):
//   - Admin           → any client account.
//   - Project Manager → only clients of projects the manager manages
//                       (project.clientId owner OR project_client link).
//   - Anyone else     → denied. Clients can never manage preferences here.
//
// The response shape mirrors the backend self-serve API
// (GET/PUT /api/notifications/preferences) so the UI contract stays identical.
// ============================================================================

import { pool, db } from '@/lib/db'
import { user as userTable, project as projectTable, projectClient as projectClientTable } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth-utils'
import { wrapServerAction } from '@/lib/performance-profiler'
import type { UserRole } from '@/lib/types'
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_LABELS,
  canonicalNotificationEvent,
  indexPreferences,
  buildUserSettings,
  type NotificationChannel,
  type NotificationPreferenceRow,
  type NotificationUserSetting,
} from '@/lib/notification-catalog'

// ─── Types ────────────────────────────────────────────────────────────────

export interface ManageableClient {
  id: string
  name: string
  email: string
  /** Projects the current user can reach this client through (manager view). */
  projectNames: string[]
}

export interface ClientNotificationPreferencesData {
  client: { id: string; name: string; email: string }
  channels: { channel: NotificationChannel; label: string }[]
  /** Legacy customer-level Teams switch (user.enable_teams_notifications). */
  customerTeamsEnabled: boolean
  preferences: NotificationUserSetting[]
}

export interface ClientPreferenceUpdate {
  eventType: string
  channel: string
  enabled: boolean
}

// ─── Internal helpers ─────────────────────────────────────────────────────

interface ClientAccount {
  id: string
  name: string
  email: string
  role: string
  enableTeamsNotifications: boolean
}

async function loadClientAccount(clientId: string): Promise<ClientAccount | null> {
  const [target] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      enableTeamsNotifications: userTable.enableTeamsNotifications,
    })
    .from(userTable)
    .where(eq(userTable.id, clientId))
    .limit(1)
  return target ?? null
}

/** Throw unless `actor` is allowed to manage notification preferences for `target`. */
async function assertCanManageClient(actor: { id: string; role: UserRole }, target: ClientAccount): Promise<void> {
  if (target.role !== 'client') {
    throw new Error('Notification preferences can only be managed for client accounts')
  }
  if (actor.role === 'admin') return

  if (actor.role === 'project_manager') {
    // Managers may only manage clients of projects they manage — either the
    // project owner (project.clientId) or an additional client user linked via
    // project_client on one of their projects.
    const [asOwner] = await db
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(and(eq(projectTable.managerId, actor.id), eq(projectTable.clientId, target.id)))
      .limit(1)
    if (asOwner) return

    const managedProjects = await db
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(eq(projectTable.managerId, actor.id))
    const managedIds = managedProjects.map(p => p.id)
    if (managedIds.length > 0) {
      const [asProjectClient] = await db
        .select({ id: projectClientTable.id })
        .from(projectClientTable)
        .where(and(inArray(projectClientTable.projectId, managedIds), eq(projectClientTable.userId, target.id)))
        .limit(1)
      if (asProjectClient) return
    }
    throw new Error('Access denied: you can only manage notification preferences for clients on projects you manage')
  }

  throw new Error('Access denied')
}

/** Translate a DB error into a useful message (e.g. migration 0015 missing). */
function describePreferenceQueryError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  if (/relation "notification_preferences" does not exist/i.test(message) || /42P01/.test(message)) {
    return new Error(
      'Notification preferences are not configured yet — the notification_preferences table is missing. ' +
      'The backend team must apply migration 0015 (notification_preferences) to the shared database first.',
    )
  }
  return new Error(message)
}

/** Load the effective client preference payload (fresh from the DB). */
async function loadClientPreferences(clientId: string, actor: { id: string; role: UserRole }): Promise<ClientNotificationPreferencesData> {
  const target = await loadClientAccount(clientId)
  if (!target) throw new Error('Client not found')
  await assertCanManageClient(actor, target)

  let rows: NotificationPreferenceRow[]
  try {
    const result = await pool.query<NotificationPreferenceRow>(
      `SELECT "clientId", "channel", "eventType", "enabled"
         FROM notification_preferences
        WHERE "clientId" = $1`,
      [clientId],
    )
    rows = result.rows
  } catch (err) {
    throw describePreferenceQueryError(err)
  }

  const byUser = new Map<string, Map<string, boolean>>()
  byUser.set(clientId, indexPreferences(rows))

  const preferences: NotificationUserSetting[] = buildUserSettings(
    { role: target.role, enableTeamsNotifications: target.enableTeamsNotifications },
    byUser,
    clientId,
  )

  return {
    client: { id: target.id, name: target.name, email: target.email },
    channels: NOTIFICATION_CHANNELS.map(c => ({ channel: c, label: NOTIFICATION_CHANNEL_LABELS[c] })),
    customerTeamsEnabled: target.enableTeamsNotifications === true,
    preferences,
  }
}

// ─── Public server actions ────────────────────────────────────────────────

/**
 * List clients the current user may manage notification preferences for.
 * Admin → all clients. Project Manager → clients of projects they manage.
 */
export const getManageableClients = wrapServerAction('getManageableClients', async function getManageableClients(): Promise<ManageableClient[]> {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'admin' && currentUser.role !== 'project_manager') {
    throw new Error('Access denied')
  }

  // clientId → project names through which the actor reaches the client.
  const projectNamesByClient = new Map<string, string[]>()

  if (currentUser.role === 'project_manager') {
    const managedProjects = await db
      .select({ id: projectTable.id, projectName: projectTable.projectName, clientId: projectTable.clientId })
      .from(projectTable)
      .where(eq(projectTable.managerId, currentUser.id))
    if (managedProjects.length === 0) return []

    const projectNameById = new Map<number, string>()
    for (const p of managedProjects) {
      projectNameById.set(p.id, p.projectName)
      if (p.clientId) {
        const list = projectNamesByClient.get(p.clientId) ?? []
        list.push(p.projectName)
        projectNamesByClient.set(p.clientId, list)
      }
    }

    // Additional client users linked to managed projects (project_client).
    const linked = await db
      .select({ projectId: projectClientTable.projectId, userId: projectClientTable.userId })
      .from(projectClientTable)
      .where(inArray(projectClientTable.projectId, managedProjects.map(p => p.id)))

    for (const row of linked) {
      const pname = projectNameById.get(row.projectId)
      if (!pname) continue
      const list = projectNamesByClient.get(row.userId) ?? []
      if (!list.includes(pname)) list.push(pname)
      projectNamesByClient.set(row.userId, list)
    }
  }

  const clientIds = Array.from(projectNamesByClient.keys())
  const users = await db
    .select({ id: userTable.id, name: userTable.name, email: userTable.email, role: userTable.role })
    .from(userTable)
    .where(
      currentUser.role === 'admin'
        ? eq(userTable.role, 'client')
        : and(eq(userTable.role, 'client'), inArray(userTable.id, clientIds)),
    )
    .orderBy(userTable.name)

  // Admins have no project scoping — every client is manageable.
  if (currentUser.role === 'admin') {
    return users.map(u => ({ id: u.id, name: u.name, email: u.email, projectNames: [] }))
  }

  return users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    projectNames: projectNamesByClient.get(u.id) ?? [],
  }))
})

/**
 * GET a client's current effective notification settings.
 * Always re-reads from the DB — never serves stale per-client state.
 */
export const getClientNotificationPreferences = wrapServerAction(
  'getClientNotificationPreferences',
  async function getClientNotificationPreferences(clientId: string): Promise<ClientNotificationPreferencesData> {
    const currentUser = await getCurrentUser()
    if (currentUser.role !== 'admin' && currentUser.role !== 'project_manager') {
      throw new Error('Access denied')
    }
    if (!clientId) throw new Error('Client is required')
    return loadClientPreferences(clientId, { id: currentUser.id, role: currentUser.role })
  },
)

/**
 * PUT a client's preference toggles (one or many). Body entries mirror the
 * backend self-serve contract: [{ eventType, channel, enabled }] — eventType
 * may be canonical or an alias; channel is in_app | email | teams.
 * Returns the updated effective settings.
 */
export const updateClientNotificationPreferences = wrapServerAction(
  'updateClientNotificationPreferences',
  async function updateClientNotificationPreferences(
    clientId: string,
    updates: ClientPreferenceUpdate[],
  ): Promise<ClientNotificationPreferencesData> {
    const currentUser = await getCurrentUser()
    if (currentUser.role !== 'admin' && currentUser.role !== 'project_manager') {
      throw new Error('Access denied')
    }
    if (!clientId) throw new Error('Client is required')
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new Error('preferences must be a non-empty array of { eventType, channel, enabled }')
    }
    if (updates.length > 200) {
      throw new Error('Too many preference updates')
    }

    const target = await loadClientAccount(clientId)
    if (!target) throw new Error('Client not found')
    await assertCanManageClient({ id: currentUser.id, role: currentUser.role }, target)

    const seen = new Set<string>()
    const validated: { channel: NotificationChannel; eventType: string; enabled: boolean }[] = []
    for (const u of updates) {
      if (!u || typeof u !== 'object') throw new Error('Each preference update must be an object')
      const canonical = canonicalNotificationEvent(u.eventType)
      if (!canonical) {
        throw new Error(`Unknown notification event: ${u.eventType}`)
      }
      if (!NOTIFICATION_CHANNELS.includes(u.channel as NotificationChannel)) {
        throw new Error(`Unknown notification channel: ${u.channel}`)
      }
      if (typeof u.enabled !== 'boolean') {
        throw new Error('enabled must be a boolean')
      }
      const dedupeKey = `${u.channel}:${canonical}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      validated.push({ channel: u.channel as NotificationChannel, eventType: canonical, enabled: u.enabled })
    }

    if (validated.length === 0) {
      // Nothing to persist — return the current state unchanged.
      return loadClientPreferences(clientId, { id: currentUser.id, role: currentUser.role })
    }

    try {
      for (const v of validated) {
        await pool.query(
          `INSERT INTO notification_preferences ("clientId", "channel", "eventType", "enabled", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, now(), now())
           ON CONFLICT ("clientId", "channel", "eventType")
           DO UPDATE SET "enabled" = EXCLUDED."enabled", "updatedAt" = now()`,
          [clientId, v.channel, v.eventType, v.enabled],
        )
      }
    } catch (err) {
      throw describePreferenceQueryError(err)
    }

    // Reload so the caller always receives the persisted state.
    return loadClientPreferences(clientId, { id: currentUser.id, role: currentUser.role })
  },
)
