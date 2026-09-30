// ============================================================================
// Client account type → display label (pure — profile page + tests)
// ============================================================================
// Source of truth is user.user_type (lib/types ClientUserType). Missing values
// are 'standard' (the column default). Plain module — no '@/' imports.
// ============================================================================

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  approver: 'Approver Account',
  standard: 'Standard Account',
}

export function clientAccountTypeLabel(userType: string | null | undefined): string {
  const key = (userType ?? '').trim().toLowerCase() || 'standard'
  if (ACCOUNT_TYPE_LABELS[key]) return ACCOUNT_TYPE_LABELS[key]
  // Any future type: readable form of its value, e.g. 'read_only' → 'Read Only Account'.
  const words = key.split(/[_\s-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1))
  return `${words.join(' ')} Account`
}
