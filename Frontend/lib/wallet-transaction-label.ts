// ============================================================================
// Wallet transaction → display type (pure — transaction history UIs + tests)
// ============================================================================
// Hours reserved for an approved ticket estimate are stored as
// transactionType 'Adjustment' with a remark starting "[Reserved]"
// (lib/ticket-wallet.ts). The stored value is left unchanged (reports treat
// only 'Deduct Hours' as consumption); these rows are just DISPLAYED as
// "Reserved". Every other Adjustment keeps displaying as "Adjustment".
// Plain module — no '@/' imports.
// ============================================================================

export const RESERVED_DISPLAY_TYPE = 'Reserved'

export function isReservationTransaction(t: { transactionType: string; remarks?: string | null }): boolean {
  return t.transactionType === 'Adjustment' && (t.remarks ?? '').trimStart().startsWith('[Reserved]')
}

/** The type key a transaction-history badge should render. */
export function transactionDisplayType(t: { transactionType: string; remarks?: string | null }): string {
  return isReservationTransaction(t) ? RESERVED_DISPLAY_TYPE : t.transactionType
}
