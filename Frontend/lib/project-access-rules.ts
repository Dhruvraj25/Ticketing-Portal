// ============================================================================
// Project access — pure rules (server checks in lib/client-ticket-permissions)
// ============================================================================
// A CLIENT may open a project when they are one of its client users:
//   - the primary client (project.clientId), OR
//   - linked to it in project_client (Customer Onboarding, New Project, and
//     Project Detail → Add User all write this link).
// The project list (getProjects) and the project detail (getProjectById,
// getModulesByProject) use this SAME rule. It only grants "may view this
// project" — role permissions (Approver/Standard, editing, user management,
// tickets) are decided elsewhere and are unchanged. Wallet ownership is a
// separate concern (company → company wallet, lib/company-wallet.ts).
//
// Plain module (no imports) so it also runs under `node --test`.
// ============================================================================

export const PROJECT_NOT_FOUND_MESSAGE = 'Project not found'
export const PROJECT_ACCESS_DENIED_MESSAGE = 'Access denied'

/** Is `userId` a client user of the project (primary client or linked)? */
export function isProjectClientUser(
  primaryClientId: string | null | undefined,
  linkedUserIds: readonly string[],
  userId: string,
): boolean {
  return primaryClientId === userId || linkedUserIds.includes(userId)
}

export type ProjectLoadFailure = 'not_found' | 'forbidden' | 'error'

/**
 * How the Project Detail page reports a failed load: a missing project is a
 * 404, an authenticated user without access sees "no access", anything else
 * (database/query failure) is a real error — never disguised as "not found".
 */
export function classifyProjectLoadError(error: unknown): ProjectLoadFailure {
  const message = error instanceof Error ? error.message : String(error)
  if (message === PROJECT_NOT_FOUND_MESSAGE) return 'not_found'
  if (message === PROJECT_ACCESS_DENIED_MESSAGE) return 'forbidden'
  return 'error'
}
