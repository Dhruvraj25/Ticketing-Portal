// ────────────────────────────────────────────────────────────────────────────
// module-selection — pure, DB-free validation for Phase 4 (ticket-creation
// Module / Service Area selection).
//
// Kept separate from app/actions/tickets/create.ts (a 'use server' module, not
// importable under plain node:test) so the cross-client/cross-project rule
// can be unit-tested directly. createTicket() resolves the module row and the
// client's allowed project ids via DB queries, then calls this function.
// ────────────────────────────────────────────────────────────────────────────

export interface ModuleSelectionInput {
  /** The projectId column of the module row the caller submitted, or null if no module was submitted. */
  moduleProjectId: number | null
  /** The projectId the caller explicitly selected on the ticket, if any. */
  selectedProjectId: number | null
  /** Every active project id associated with the resolved target client (direct + project_client junction). */
  allowedProjectIdsForClient: readonly number[]
}

export type ModuleSelectionResult = { valid: true } | { valid: false; error: string }

/**
 * A module is never required (Phase 4 requirement 1) — omitting one is
 * always valid. When one IS submitted:
 *  - if a project was also selected, the module must belong to THAT exact
 *    project (not just any project of the client);
 *  - if no project was selected, the module must belong to one of the
 *    client's projects (direct ownership or project_client junction).
 */
export function validateModuleSelection(input: ModuleSelectionInput): ModuleSelectionResult {
  if (input.moduleProjectId === null) return { valid: true }

  if (input.selectedProjectId !== null) {
    if (input.moduleProjectId !== input.selectedProjectId) {
      return { valid: false, error: 'Selected module does not belong to the selected project' }
    }
    return { valid: true }
  }

  if (!input.allowedProjectIdsForClient.includes(input.moduleProjectId)) {
    return { valid: false, error: 'Selected module does not belong to the selected client' }
  }
  return { valid: true }
}
