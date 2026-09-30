// ============================================================================
// Client-account permissions on a ticket (pure rules — UI + tests)
// ============================================================================
// A company can have several client accounts on a project:
//   - the RAISER: the account that raised the ticket (ticket.clientId);
//   - APPROVER accounts (user_type = 'approver') of the ticket's project;
//   - other STANDARD accounts of the same company.
//
//   Close the ticket (Approve & Complete) → the raiser only.
//   Approve / reject an estimate          → approver accounts only.
//   Submit a review                       → the raiser OR an approver account.
//
// The server re-checks every rule (lib/client-ticket-permissions.ts, which
// also verifies an approver belongs to the ticket's PROJECT); these pure
// functions keep the UI in step. Plain module — no '@/' imports.
// ============================================================================

export interface ClientActor {
  id: string
  userType?: string | null
}

export function isTicketRaiser(actor: ClientActor, ticketClientId: string | null | undefined): boolean {
  return !!ticketClientId && actor.id === ticketClientId
}

export function canCloseTicket(actor: ClientActor, ticketClientId: string | null | undefined): boolean {
  return isTicketRaiser(actor, ticketClientId)
}

export function canSubmitTicketReview(actor: ClientActor, ticketClientId: string | null | undefined): boolean {
  return isTicketRaiser(actor, ticketClientId) || actor.userType === 'approver'
}

/** Real creator name, or the generic fallback — never "undefined"/"null"/"Unknown". */
function creatorLabel(raiserName: string | null | undefined): string {
  const name = typeof raiserName === 'string' ? raiserName.trim() : ''
  return name && !/^(undefined|null|unknown|\[object object\])$/i.test(name) ? name : 'another client user'
}

export function closeTicketDeniedMessage(raiserName: string | null | undefined): string {
  return `This ticket was created by ${creatorLabel(raiserName)}, so you cannot close this ticket.`
}

export function revisionDeniedMessage(raiserName: string | null | undefined): string {
  return `This ticket was created by ${creatorLabel(raiserName)}, so you cannot request a revision for this ticket.`
}

export const NO_TICKET_ACCESS_MESSAGE = 'You do not have access to this ticket.'

/** Structured result for client ticket actions — refusals are returned, never thrown to React. */
export type ClientActionResult = { success: true } | { success: false; error: string }

/** The user-facing error if an action RETURNED a structured failure, else null. */
export function actionFailure(result: unknown): string | null {
  if (result && typeof result === 'object' && (result as { success?: unknown }).success === false) {
    const error = (result as { error?: unknown }).error
    return typeof error === 'string' && error ? error : 'Something went wrong. Please try again.'
  }
  return null
}

/**
 * Decide whether a client may close (Approve & Complete) or request a revision
 * on a ticket. Returns null when allowed, else the user-facing message.
 * `actorOnProject`: the caller is a client account of the ticket's project —
 * only those are told who created the ticket; anyone else gets no details.
 */
export function clientTicketActionDenial(input: {
  actorId: string
  ticketClientId: string | null | undefined
  raiserName: string | null | undefined
  actorOnProject: boolean
  action: 'close' | 'revision'
}): string | null {
  if (isTicketRaiser({ id: input.actorId }, input.ticketClientId)) return null
  if (!input.actorOnProject) return NO_TICKET_ACCESS_MESSAGE
  return input.action === 'close' ? closeTicketDeniedMessage(input.raiserName) : revisionDeniedMessage(input.raiserName)
}

export const REVIEW_NOT_ALLOWED_MESSAGE =
  "Only the client account that raised this ticket or your company's approver account can submit a review."
