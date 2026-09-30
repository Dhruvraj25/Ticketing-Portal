// ============================================================================
// Company directory — unique customer companies from client users
// ============================================================================
// There is no Company table: a customer's company is stored on its CLIENT
// users (user.companyName / user.companyCode, set by Customer Onboarding).
// This module derives the unique companies from those users.
//
// Identity:
//   - companyCode (trimmed, case-insensitive) is the stable identifier when set;
//   - otherwise the normalized companyName (trimmed, inner whitespace
//     collapsed, case-insensitive).
//   A name-only group is folded into a coded group ONLY when exactly one coded
//   company has that same name — two different codes sharing a name stay
//   separate (never silently merge genuinely different companies).
//   Users without a company name, and non-client users, belong to no company.
//
// Plain module (no '@/' imports) so it also runs under `node --test`.
// ============================================================================

export interface CompanyDirectoryUser {
  id: string
  role: string
  companyName?: string | null
  companyCode?: string | null
  userType?: string | null
  createdAt?: Date | string | null
}

export interface CompanyEntry {
  /** Stable identifier sent by the UI and resolved again on the server. */
  key: string
  companyName: string
  companyCode: string | null
  /** Every CLIENT user of this company. */
  clientUserIds: string[]
  /** Saved as project.clientId (the project owner): the company's Approver, else its earliest client. */
  representativeId: string
}

/** Trim and collapse inner whitespace: " Nirka  Business " → "Nirka Business". */
export function normalizeCompanyName(name: string | null | undefined): string {
  return (name ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeCode(code: string | null | undefined): string {
  return (code ?? '').trim()
}

function time(value: Date | string | null | undefined): number {
  const t = value ? new Date(value).getTime() : NaN
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER
}

export function buildCompanyDirectory(users: CompanyDirectoryUser[]): CompanyEntry[] {
  const clients = users.filter((u) => u.role === 'client' && normalizeCompanyName(u.companyName))
  const groups = new Map<string, CompanyDirectoryUser[]>()

  for (const u of clients) {
    const code = normalizeCode(u.companyCode)
    const key = code ? `code:${code.toLowerCase()}` : `name:${normalizeCompanyName(u.companyName).toLowerCase()}`
    groups.set(key, [...(groups.get(key) ?? []), u])
  }

  // Fold name-only groups into the single coded group with the same name.
  for (const [key, members] of [...groups]) {
    if (!key.startsWith('name:')) continue
    const name = key.slice('name:'.length)
    const coded = [...groups.entries()].filter(
      ([k, m]) => k.startsWith('code:') && m.some((u) => normalizeCompanyName(u.companyName).toLowerCase() === name),
    )
    if (coded.length === 1) {
      coded[0][1].push(...members)
      groups.delete(key)
    }
  }

  const entries: CompanyEntry[] = []
  for (const [key, members] of groups) {
    const byAge = [...members].sort((a, b) => time(a.createdAt) - time(b.createdAt))
    const representative = byAge.find((u) => u.userType === 'approver') ?? byAge[0]
    const codeHolder = members.find((u) => normalizeCode(u.companyCode))
    entries.push({
      key,
      companyName: normalizeCompanyName(representative.companyName) || normalizeCompanyName(members[0].companyName),
      companyCode: codeHolder ? normalizeCode(codeHolder.companyCode) : null,
      clientUserIds: byAge.map((u) => u.id),
      representativeId: representative.id,
    })
  }
  return entries.sort((a, b) => a.companyName.localeCompare(b.companyName) || (a.companyCode ?? '').localeCompare(b.companyCode ?? ''))
}

/** Resolve one company by its key from the CURRENT users (server-side, authoritative). */
export function resolveCompany(users: CompanyDirectoryUser[], key: string): CompanyEntry | null {
  return buildCompanyDirectory(users).find((c) => c.key === key) ?? null
}
