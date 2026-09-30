// ============================================================================
// Outside-press / Escape dismissal handlers (pure — hook + tests)
// ============================================================================
// Used by hooks/use-dismiss-on-outside.ts. Kept free of React/DOM globals so
// the decision logic can be unit-tested under `node --test`.
// ============================================================================

export interface ContainsNode {
  contains(node: unknown): boolean
}

export function createDismissHandlers(getContainer: () => ContainsNode | null, onDismiss: () => void) {
  return {
    /** A press whose target is outside the container dismisses. */
    onPointerDown(e: { target: unknown }) {
      const el = getContainer()
      if (el && !el.contains(e.target)) onDismiss()
    },
    /** Escape dismisses. */
    onKeyDown(e: { key: string }) {
      if (e.key === 'Escape') onDismiss()
    },
  }
}
