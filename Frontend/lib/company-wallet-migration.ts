// ============================================================================
// Company-wallet data migration — PURE planner (no DB access)
// ============================================================================
// Turns the current data (client users, their free-text company fields,
// per-user support wallets) into a plan that links every client user and
// every wallet to a `company` row, with ONE wallet per company.
//
// Company identity (one-time seeding only — afterwards user.companyId is the
// authoritative relationship and company text is never used to relate rows):
//   - a user already linked (companyId set) stays in that company;
//   - otherwise the existing lib/company-directory rule groups client users:
//     companyCode (case-insensitive) first, else the normalized companyName —
//     the same rule the New Project company picker already uses;
//   - a client user with NO company name becomes a company of its own (named
//     after the user, exactly what the UI already shows as their company).
//     It is never merged into another company by guesswork; if such a user
//     shares a project with another company it is reported as AMBIGUOUS.
//
// Wallets: a wallet belongs to the company of its user (support_wallet.clientId).
//   - 1 wallet  → linked as-is (same row id, balances and transactions).
//   - 0 wallets → none created (never invent hours).
//   - 2+ wallets → CONSOLIDATION (deterministic, lossless): the oldest wallet
//     (lowest id) survives; purchased/reserved/consumed/remaining are summed;
//     contract start = earliest, end = latest; every transaction and alert is
//     re-pointed to the survivor and an audit transaction records each merge.
//     Wallets with different contract types are AMBIGUOUS (not merged).
//
// Anything ambiguous stops the migration (the script refuses to apply) and is
// listed for a human decision.
//
// Plain module (relative imports only) so it also runs under `node --test`.
// ============================================================================

import { buildCompanyDirectory, normalizeCompanyName } from './company-directory.ts'

export interface MigrationUser {
  id: string
  name: string
  email?: string | null
  role: string
  userType?: string | null
  companyName?: string | null
  companyCode?: string | null
  companyId?: number | null
  /** Legacy Backend org pointer (an approver's user id) — cross-checked only. */
  accountId?: string | null
  createdAt?: Date | string | null
}

export interface MigrationCompany {
  id: number
  name: string
  code?: string | null
}

export interface MigrationWallet {
  id: number
  clientId: string
  companyId?: number | null
  totalPurchasedHours: number
  reservedHours: number
  consumedHours: number
  remainingHours: number
  contractStartDate?: string | null
  contractEndDate?: string | null
  contractType?: string | null
  status: string
  transactionCount?: number
  alertCount?: number
}

export interface MigrationProject {
  id: number
  projectCode?: string
  /** project.clientId — the owner. */
  ownerId: string
  /** project_client user ids. */
  memberIds: string[]
}

export interface MigrationTicket {
  id: number
  ticketNumber?: string
  clientId: string | null
  projectId: number | null
}

/** `existing:<id>` (an existing company row) or `new:<directory key>` (to create). */
export type CompanyTarget = string

export interface PlannedCompany {
  target: CompanyTarget
  existingCompanyId: number | null
  name: string
  code: string | null
  userIds: string[]
  /** Users that must get user.companyId set (not linked yet). */
  usersToLink: string[]
  wallets: MigrationWallet[]
  /** Surviving wallet id, or null when the company has no wallet. */
  walletId: number | null
  /** Wallets merged INTO walletId (2+ wallets). */
  mergedWalletIds: number[]
  resulting: { totalPurchasedHours: number; reservedHours: number; consumedHours: number; remainingHours: number; contractStartDate: string | null; contractEndDate: string | null; transactions: number } | null
}

export interface Ambiguity {
  kind: 'cross_company_project' | 'nameless_user_shares_project' | 'legacy_account_split' | 'cross_company_ticket' | 'wallet_owner_not_client' | 'conflicting_contract_types' | 'linked_group_split' | 'wallet_company_mismatch'
  message: string
}

export interface CompanyMigrationPlan {
  companies: PlannedCompany[]
  ambiguities: Ambiguity[]
  /** 2+ wallets in one company — applied only with explicit approval. */
  consolidations: { target: CompanyTarget; survivorId: number; mergedIds: number[] }[]
  totals: {
    companiesToCreate: number
    companiesLinked: number
    usersToLink: number
    walletsToLink: number
    walletsConsolidated: number
    transactions: number
  }
}

const sum = (ws: MigrationWallet[], k: keyof Pick<MigrationWallet, 'totalPurchasedHours' | 'reservedHours' | 'consumedHours' | 'remainingHours'>) =>
  ws.reduce((n, w) => n + (Number(w[k]) || 0), 0)

const minDate = (xs: (string | null | undefined)[]) => xs.filter(Boolean).sort()[0] ?? null
const maxDate = (xs: (string | null | undefined)[]) => xs.filter(Boolean).sort().at(-1) ?? null

export function planCompanyWalletMigration(input: {
  users: MigrationUser[]
  companies: MigrationCompany[]
  wallets: MigrationWallet[]
  projects?: MigrationProject[]
  tickets?: MigrationTicket[]
}): CompanyMigrationPlan {
  const ambiguities: Ambiguity[] = []
  const clients = input.users.filter((u) => u.role === 'client')
  const userById = new Map(input.users.map((u) => [u.id, u]))
  const companyById = new Map(input.companies.map((c) => [c.id, c]))

  // ── 1. Target company of every client user ──────────────────────────────
  const targetOf = new Map<string, CompanyTarget>()
  for (const u of clients) if (u.companyId) targetOf.set(u.id, `existing:${u.companyId}`)

  const directory = buildCompanyDirectory(clients)
  const dirMeta = new Map<CompanyTarget, { name: string; code: string | null }>()
  for (const entry of directory) {
    const linked = [...new Set(entry.clientUserIds.map((id) => userById.get(id)?.companyId).filter((x): x is number => !!x))]
    const unlinked = entry.clientUserIds.filter((id) => !userById.get(id)?.companyId)
    if (unlinked.length === 0) continue
    if (linked.length > 1) {
      ambiguities.push({
        kind: 'linked_group_split',
        message: `Company "${entry.companyName}": users are already linked to ${linked.length} different companies (${linked.join(', ')}); cannot tell which one ${unlinked.length} unlinked user(s) belong to.`,
      })
      continue
    }
    const target: CompanyTarget = linked.length === 1 ? `existing:${linked[0]}` : `new:${entry.key}`
    if (linked.length === 0) dirMeta.set(target, { name: entry.companyName, code: entry.companyCode })
    for (const id of unlinked) targetOf.set(id, target)
  }
  // Users without a company name → their own company.
  for (const u of clients) {
    if (targetOf.has(u.id) || normalizeCompanyName(u.companyName)) continue
    const target: CompanyTarget = `new:user:${u.id}`
    targetOf.set(u.id, target)
    dirMeta.set(target, { name: normalizeCompanyName(u.name) || u.email || u.id, code: null })
  }
  const namelessUnlinked = new Set(clients.filter((u) => !u.companyId && !normalizeCompanyName(u.companyName)).map((u) => u.id))

  // ── 2. Cross-checks: projects, tickets and the legacy Backend org pointer
  //       (user.accountId) must all stay within one company ──────────────
  const byAccount = new Map<string, string[]>()
  for (const u of clients) if (u.accountId) byAccount.set(u.accountId, [...(byAccount.get(u.accountId) ?? []), u.id])
  for (const [accountId, ids] of byAccount) {
    const targets = new Set(ids.map((id) => targetOf.get(id)))
    if (targets.size > 1) {
      ambiguities.push({
        kind: 'legacy_account_split',
        message: `Legacy organisation ${accountId}: its users (${ids.map((id) => userById.get(id)?.name ?? id).join(', ')}) would land in different companies.`,
      })
    }
  }
  for (const p of input.projects ?? []) {
    const ownerTarget = targetOf.get(p.ownerId)
    for (const m of p.memberIds) {
      const mt = targetOf.get(m)
      if (!ownerTarget || !mt || mt === ownerTarget) continue
      const label = p.projectCode ?? `#${p.id}`
      if (namelessUnlinked.has(m) || namelessUnlinked.has(p.ownerId)) {
        ambiguities.push({ kind: 'nameless_user_shares_project', message: `Project ${label}: ${userById.get(m)?.name ?? m} and owner ${userById.get(p.ownerId)?.name ?? p.ownerId} — one has no company name, so their company cannot be inferred.` })
      } else {
        ambiguities.push({ kind: 'cross_company_project', message: `Project ${label}: member ${userById.get(m)?.name ?? m} belongs to a different company than owner ${userById.get(p.ownerId)?.name ?? p.ownerId}.` })
      }
    }
  }
  const projectOwner = new Map((input.projects ?? []).map((p) => [p.id, p.ownerId]))
  for (const t of input.tickets ?? []) {
    if (!t.clientId || !t.projectId) continue
    const owner = projectOwner.get(t.projectId)
    const a = targetOf.get(t.clientId), b = owner ? targetOf.get(owner) : undefined
    if (a && b && a !== b) {
      ambiguities.push({ kind: 'cross_company_ticket', message: `Ticket ${t.ticketNumber ?? `#${t.id}`}: raised by a user of a different company than the project owner.` })
    }
  }

  // ── 3. Wallets → companies ──────────────────────────────────────────────
  const walletsByTarget = new Map<CompanyTarget, MigrationWallet[]>()
  for (const w of input.wallets) {
    const ownerTarget = targetOf.get(w.clientId)
    if (w.companyId) {
      if (ownerTarget && ownerTarget !== `existing:${w.companyId}`) {
        ambiguities.push({ kind: 'wallet_company_mismatch', message: `Wallet #${w.id} is linked to company ${w.companyId} but its user belongs to another company.` })
      }
      const t = `existing:${w.companyId}`
      walletsByTarget.set(t, [...(walletsByTarget.get(t) ?? []), w])
      continue
    }
    if (!ownerTarget) {
      ambiguities.push({ kind: 'wallet_owner_not_client', message: `Wallet #${w.id}: its user (${w.clientId}) is not a client user — no company can be derived.` })
      continue
    }
    walletsByTarget.set(ownerTarget, [...(walletsByTarget.get(ownerTarget) ?? []), w])
  }

  // ── 4. Build the per-company plan ───────────────────────────────────────
  const targets = new Set<CompanyTarget>([...targetOf.values(), ...walletsByTarget.keys()])
  const companies: PlannedCompany[] = []
  const consolidations: CompanyMigrationPlan['consolidations'] = []
  for (const target of [...targets].sort()) {
    const existingId = target.startsWith('existing:') ? Number(target.slice('existing:'.length)) : null
    const existing = existingId ? companyById.get(existingId) : undefined
    const meta = dirMeta.get(target)
    const userIds = clients.filter((u) => targetOf.get(u.id) === target).map((u) => u.id)
    const wallets = [...(walletsByTarget.get(target) ?? [])].sort((a, b) => a.id - b.id)
    const types = [...new Set(wallets.map((w) => w.contractType ?? null).filter(Boolean))]
    if (wallets.length > 1 && types.length > 1) {
      ambiguities.push({ kind: 'conflicting_contract_types', message: `Company "${existing?.name ?? meta?.name}": wallets ${wallets.map((w) => `#${w.id}`).join(', ')} have different contract types (${types.join(', ')}).` })
    }
    const survivor = wallets[0] ?? null
    const merged = wallets.slice(1)
    if (survivor && merged.length) consolidations.push({ target, survivorId: survivor.id, mergedIds: merged.map((w) => w.id) })
    companies.push({
      target,
      existingCompanyId: existingId,
      name: existing?.name ?? meta?.name ?? target,
      code: existing ? existing.code ?? null : meta?.code ?? null,
      userIds,
      usersToLink: userIds.filter((id) => !userById.get(id)?.companyId),
      wallets,
      walletId: survivor?.id ?? null,
      mergedWalletIds: merged.map((w) => w.id),
      resulting: survivor ? {
        totalPurchasedHours: sum(wallets, 'totalPurchasedHours'),
        reservedHours: sum(wallets, 'reservedHours'),
        consumedHours: sum(wallets, 'consumedHours'),
        remainingHours: sum(wallets, 'remainingHours'),
        contractStartDate: minDate(wallets.map((w) => w.contractStartDate)),
        contractEndDate: maxDate(wallets.map((w) => w.contractEndDate)),
        transactions: wallets.reduce((n, w) => n + (w.transactionCount ?? 0), 0),
      } : null,
    })
  }

  return {
    companies,
    ambiguities,
    consolidations,
    totals: {
      companiesToCreate: companies.filter((c) => c.existingCompanyId === null).length,
      companiesLinked: companies.length,
      usersToLink: companies.reduce((n, c) => n + c.usersToLink.length, 0),
      walletsToLink: input.wallets.filter((w) => !w.companyId && targetOf.has(w.clientId)).length,
      walletsConsolidated: consolidations.reduce((n, c) => n + c.mergedIds.length, 0),
      transactions: input.wallets.reduce((n, w) => n + (w.transactionCount ?? 0), 0),
    },
  }
}
