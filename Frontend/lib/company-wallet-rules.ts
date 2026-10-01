// ============================================================================
// Company Support Wallet — pure rules (shared by server code and tests)
// ============================================================================
// ONE company → ONE support wallet → every client user of the company.
//   - A client user's wallet is the wallet of user.companyId.
//   - A ticket's wallet is the wallet of the ticket's company:
//       1. the company of the ticket's PROJECT (project.clientId → its company);
//       2. else (no project) the company of the client who raised it.
//     Never a personal wallet of the raiser or of the project owner.
//   - Roles (Approver / Standard) never create separate wallets.
//
// Plain module (no imports) so it also runs under `node --test`.
// ============================================================================

export type CompanyId = number

/** ticket → project → company (fallback: the raiser's company). */
export function ticketCompanyId(projectCompanyId: CompanyId | null | undefined, raiserCompanyId: CompanyId | null | undefined): CompanyId | null {
  return projectCompanyId ?? raiserCompanyId ?? null
}

export interface WalletViewer {
  role: string
  /** The viewer's own company (client users). */
  companyId?: CompanyId | null
  /** Companies of the projects this manager manages. */
  managedCompanyIds?: CompanyId[]
}

/**
 * Who may see a company's wallet:
 *   admin → any; client → only their own company's; project manager → the
 *   companies of projects they manage; everyone else → none.
 */
export function canViewCompanyWallet(viewer: WalletViewer, walletCompanyId: CompanyId | null | undefined): boolean {
  if (viewer.role === 'admin') return true
  if (walletCompanyId == null) return false
  if (viewer.role === 'client') return viewer.companyId != null && viewer.companyId === walletCompanyId
  if (viewer.role === 'project_manager') return (viewer.managedCompanyIds ?? []).includes(walletCompanyId)
  return false
}

/** Wallet heading: "<Company> — Support Wallet" (company first, contact as fallback). */
export function walletOwnerLabel(companyName: string | null | undefined, contactName?: string | null): string {
  return (companyName ?? '').trim() || (contactName ?? '').trim() || 'Unknown company'
}
