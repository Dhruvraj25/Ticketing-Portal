// ============================================================================
// Resource assignment — when may a manager assign a ticket?
// ============================================================================
// Lifecycle: new → (estimate) estimate_pending → client approves (or
// auto-approval) → estimate_approved → [manager assigns a resource] → assigned.
//
// The standard "Assign Resource" action is available ONLY once the estimate is
// approved and while no resource is assigned yet. The separate "Assign
// Directly" choice on a NEW ticket (skip the estimate workflow) is the only
// other entry point. Changing an existing assignee is Reassign, not Assign.
// The server (assignTicket in app/actions/tickets/update.ts) enforces the same
// rule atomically; this module keeps the UI in step with it.
//
// Plain relative imports only, so it also runs under `node --test`.
// ============================================================================

export const ASSIGNABLE_STATUS = 'estimate_approved'
/** Status from which "Assign Directly" (skip the estimate workflow) is allowed. */
export const DIRECT_ASSIGNABLE_STATUS = 'new'

export interface AssignableTicket {
  status: string
  assignedToId?: string | null
}

/** True when the standard manager "Assign Resource" action applies. */
export function isReadyForResourceAssignment(ticket: AssignableTicket): boolean {
  return ticket.status === ASSIGNABLE_STATUS && !ticket.assignedToId
}

/** Server-side rule, including the "Assign Directly" (skip-estimate) path. */
export function canAssignResource(ticket: AssignableTicket, skipEstimateWorkflow: boolean): boolean {
  if (ticket.assignedToId) return false
  return ticket.status === (skipEstimateWorkflow ? DIRECT_ASSIGNABLE_STATUS : ASSIGNABLE_STATUS)
}

// ============================================================================
// Who can be the assigned resource — developers, and managers on their projects
// ============================================================================
// A Project Manager can be assigned (incl. assigning themselves) only to a
// ticket in a project they manage (project.managerId) — the same scope their
// manager rights already cover. Developers keep the existing behaviour. The
// server (assignTicket) enforces this; the UI lists only eligible resources.

export interface AssignableResource {
  id: string
  name: string
  email: string
  activeTickets: number
  role?: 'developer' | 'project_manager'
  /** Projects this manager manages (managers only). */
  managedProjectIds?: number[]
}

export function canBeAssignee(
  resource: { role?: string | null; managedProjectIds?: number[] | null },
  projectId: number | null | undefined,
): boolean {
  if (!resource.role || resource.role === 'developer') return true
  if (resource.role === 'project_manager') return projectId != null && (resource.managedProjectIds ?? []).includes(projectId)
  return false
}

/** Resources that may be assigned to a ticket of `projectId`. */
export function assignableResourcesFor<T extends { role?: string | null; managedProjectIds?: number[] | null }>(
  resources: T[],
  projectId: number | null | undefined,
): T[] {
  return resources.filter((r) => canBeAssignee(r, projectId))
}

/** Dropdown label: managers are marked, and "you" when it is the current user. */
export function resourceLabel(r: { id: string; name: string; role?: string | null }, currentUserId?: string | null): string {
  if (r.role !== 'project_manager') return r.name
  return r.id === currentUserId ? `${r.name} (Me — Manager)` : `${r.name} (Manager)`
}

/**
 * May this user use the resource work actions (Start / Pause / Resume / Stop /
 * Mark Completed, time tracking) on a ticket? Developers as before; a manager
 * only on a ticket assigned to THEM — no other developer permissions.
 */
export function canWorkOnTicket(role: string, userId: string, assignedToId: string | null | undefined): boolean {
  if (role === 'developer') return true
  return role === 'project_manager' && !!assignedToId && assignedToId === userId
}
