// ============================================================================
// Client-account permissions on a ticket — SERVER checks (database-backed)
// ============================================================================
// Rules are described in lib/client-ticket-rules.ts. Used by server actions
// only (estimates, ticket close, reviews); never trust the UI.
// ============================================================================

import { db } from '@/lib/db'
import { project, projectClient, user } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { isProjectClientUser } from '@/lib/project-access-rules'

interface TicketRef {
  clientId: string | null
  projectId: number | null
}

/**
 * Is `userId` a client user of the project — its primary client
 * (project.clientId) or linked via project_client? The single project-access
 * check for clients (lib/project-access-rules.ts); false for a missing project.
 */
export async function isClientOfProject(userId: string, projectId: number): Promise<boolean> {
  const [[proj], links] = await Promise.all([
    db.select({ clientId: project.clientId }).from(project).where(eq(project.id, projectId)).limit(1),
    db
      .select({ userId: projectClient.userId })
      .from(projectClient)
      .where(and(eq(projectClient.projectId, projectId), eq(projectClient.userId, userId))),
  ])
  if (!proj) return false
  return isProjectClientUser(proj.clientId, links.map((l) => l.userId), userId)
}

/** Ids of every project the client user belongs to (primary client or linked) — the project list scope. */
export async function clientProjectIds(userId: string): Promise<number[]> {
  const [owned, linked] = await Promise.all([
    db.select({ projectId: project.id }).from(project).where(eq(project.clientId, userId)),
    db.select({ projectId: projectClient.projectId }).from(projectClient).where(eq(projectClient.userId, userId)),
  ])
  return [...new Set([...owned.map((p) => p.projectId), ...linked.map((p) => p.projectId)])]
}

/** Is `userId` a client account of the ticket's project (primary client or linked via project_client)? */
export async function isClientOfTicketProject(userId: string, t: TicketRef): Promise<boolean> {
  if (!t.projectId) return false
  return isClientOfProject(userId, t.projectId)
}

/**
 * Client Approver model (see getClientOrgUserIds in app/actions/tickets/queries.ts):
 * an organization's Approver acts on estimates / additional hours / reviews
 * for tickets raised by the Standard client users of the SAME project — not
 * only on tickets they raised themselves. Callers must already have verified
 * role === 'client' and userType === 'approver'.
 *
 * Deliberately PROJECT-scoped: the approver AND the ticket's client must both
 * be clients of the ticket's own project (primary client or linked via
 * project_client), so an approver can never act on another project's or
 * another organization's tickets.
 */
export async function approverCanActOnTicket(
  approverId: string,
  t: TicketRef,
): Promise<boolean> {
  if (t.clientId === approverId) return true
  if (!t.clientId || !t.projectId) return false

  const [[proj], links] = await Promise.all([
    db.select({ clientId: project.clientId }).from(project).where(eq(project.id, t.projectId)).limit(1),
    db
      .select({ userId: projectClient.userId })
      .from(projectClient)
      .where(and(eq(projectClient.projectId, t.projectId), inArray(projectClient.userId, [approverId, t.clientId]))),
  ])
  if (!proj) return false

  const projectClientIds = new Set<string>([proj.clientId, ...links.map((l) => l.userId)])
  return projectClientIds.has(approverId) && projectClientIds.has(t.clientId)
}

/** Display name of the account that raised the ticket. */
export async function ticketRaiserName(clientId: string | null): Promise<string | null> {
  if (!clientId) return null
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, clientId)).limit(1)
  return row?.name ?? null
}
