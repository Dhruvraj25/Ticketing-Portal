// ============================================================================
// Create Ticket — "Save Draft" persistence
// ============================================================================
// Single source of truth for the draft storage key/shape and the dropdown-
// restoration rule, so every read/write site (initial load, save, re-save,
// clear-on-submit) in app/dashboard/tickets/new/page.tsx agrees on exactly
// the same contract instead of re-implementing localStorage access and
// "is this saved id still valid" checks in multiple places.
//
// This is a client-side draft only (no server/database round-trip exists for
// tickets — see app/actions/tickets, which has no draft-related action).
// ============================================================================

export const TICKET_DRAFT_STORAGE_KEY = 'ticket-draft'

export interface TicketDraft {
  title?: string
  description?: string
  priority?: string
  category?: string
  environment?: string
  additionalInfo?: string
  clientId?: string
  projectId?: string
  moduleId?: string
}

/** Read and parse the saved draft. Never throws — returns null on any failure. */
export function loadTicketDraft(): TicketDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(TICKET_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as TicketDraft) : null
  } catch {
    return null
  }
}

/** Persist the given draft, replacing any previous one. Never throws. */
export function saveTicketDraft(draft: TicketDraft): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TICKET_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  } catch {}
}

/** Remove the saved draft (called after a successful ticket submission). */
export function clearTicketDraft(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(TICKET_DRAFT_STORAGE_KEY)
  } catch {}
}

/**
 * Resolve a draft-saved dropdown selection against a freshly-loaded option
 * list (clients / projects / modules — each fetched async and scoped to the
 * current user/selection). Returns the saved value ONLY when it still
 * exists in the current list — never a stale or no-longer-authorized id —
 * and, critically, never falls back to the caller's own default when the
 * saved value IS still valid: the caller must use this result as-is before
 * trying any other fallback (URL param, "Support" auto-select, etc.).
 */
export function resolveDraftSelection<T>(
  draftValue: string | undefined | null,
  options: readonly T[],
  getId: (item: T) => string | number,
): string | null {
  if (!draftValue) return null
  const stillValid = options.some((item) => String(getId(item)) === String(draftValue))
  return stillValid ? String(draftValue) : null
}
