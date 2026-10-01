// ============================================================================
// Company Support Wallet — the ONE place wallets are resolved (server only)
// ============================================================================
// Company → one wallet (support_wallet.companyId, unique) → all client users
// of that company (user.companyId). Every wallet read/write in the app
// resolves through here; support_wallet.clientId is only the wallet's primary
// contact and never decides access. Rules: lib/company-wallet-rules.ts.
// ============================================================================

import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { company, project, supportWallet, user } from '@/lib/db/schema'
import { canViewCompanyWallet, ticketCompanyId, type WalletViewer } from '@/lib/company-wallet-rules'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type DbHandle = typeof db | Tx
export type WalletRow = typeof supportWallet.$inferSelect

export const COMPANY_SCHEMA_MISSING_MESSAGE =
  'Company wallet schema is missing: apply migration 0035_add_company_wallet and run scripts/migrate-company-wallets.ts --apply.'

/**
 * Re-throws "undefined column / table" errors (Postgres 42703 / 42P01) on the
 * company schema with an actionable message — the raw Drizzle "Failed query"
 * hides that the migration was never applied. Never swallows the error.
 */
async function requireCompanySchema<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    const pg = (err as { cause?: { code?: string } })?.cause ?? (err as { code?: string })
    if (pg?.code === '42703' || pg?.code === '42P01') throw new Error(COMPANY_SCHEMA_MISSING_MESSAGE, { cause: err })
    throw err
  }
}

export async function companyIdOfUser(handle: DbHandle, userId: string | null | undefined): Promise<number | null> {
  if (!userId) return null
  const [u] = await requireCompanySchema(() =>
    handle.select({ companyId: user.companyId }).from(user).where(eq(user.id, userId)).limit(1))
  return u?.companyId ?? null
}

/**
 * A project's company = the company of its owner (project.clientId → user →
 * user.companyId). null when the project, its owner or the owner's company is
 * missing — callers then fall back to the raiser's company (never a guess).
 */
export async function companyIdOfProject(handle: DbHandle, projectId: number | null | undefined): Promise<number | null> {
  if (!projectId) return null
  const [p] = await requireCompanySchema(() => handle
    .select({ companyId: user.companyId })
    .from(project)
    .innerJoin(user, eq(user.id, project.clientId))
    .where(eq(project.id, projectId))
    .limit(1))
  return p?.companyId ?? null
}

/** ticket → project → company (else the raiser's company). */
export async function companyIdForTicket(handle: DbHandle, t: { clientId: string | null; projectId: number | null }): Promise<number | null> {
  const projectCompany = await companyIdOfProject(handle, t.projectId)
  return ticketCompanyId(projectCompany, projectCompany ? null : await companyIdOfUser(handle, t.clientId))
}

export async function walletOfCompany(handle: DbHandle, companyId: number | null | undefined): Promise<WalletRow | null> {
  if (!companyId) return null
  const [w] = await requireCompanySchema(() =>
    handle.select().from(supportWallet).where(eq(supportWallet.companyId, companyId)).limit(1))
  return w ?? null
}

/** The wallet a client user sees and uses — their company's. */
export async function walletOfUser(handle: DbHandle, userId: string): Promise<WalletRow | null> {
  return walletOfCompany(handle, await companyIdOfUser(handle, userId))
}

/** Companies of the projects a manager manages. */
export async function companyIdsManagedBy(handle: DbHandle, managerId: string): Promise<number[]> {
  const rows = await handle
    .selectDistinct({ companyId: user.companyId })
    .from(project)
    .innerJoin(user, eq(user.id, project.clientId))
    .where(eq(project.managerId, managerId))
  return rows.map((r) => r.companyId).filter((id): id is number => id != null)
}

/**
 * Wallet visibility for the current user: `null` = all wallets (admin);
 * otherwise the company ids whose wallet they may see (empty = none).
 */
export async function visibleCompanyIds(handle: DbHandle, currentUser: { id: string; role: string }): Promise<number[] | null> {
  if (currentUser.role === 'admin') return null
  if (currentUser.role === 'client') {
    const own = await companyIdOfUser(handle, currentUser.id)
    return own ? [own] : []
  }
  if (currentUser.role === 'project_manager') return companyIdsManagedBy(handle, currentUser.id)
  return []
}

export async function walletViewerFor(handle: DbHandle, currentUser: { id: string; role: string }): Promise<WalletViewer> {
  if (currentUser.role === 'client') return { role: 'client', companyId: await companyIdOfUser(handle, currentUser.id) }
  if (currentUser.role === 'project_manager') return { role: 'project_manager', managedCompanyIds: await companyIdsManagedBy(handle, currentUser.id) }
  return { role: currentUser.role }
}

/** Throws 'Access denied' unless a CLIENT viewer belongs to the wallet's company. */
export async function assertClientWalletAccess(handle: DbHandle, currentUser: { id: string; role: string }, wallet: Pick<WalletRow, 'companyId'>): Promise<void> {
  if (currentUser.role !== 'client') return
  if (!canViewCompanyWallet(await walletViewerFor(handle, currentUser), wallet.companyId)) throw new Error('Access denied')
}

export interface CompanyInfo { id: number; name: string; code: string | null }

export async function companiesByIds(handle: DbHandle, ids: (number | null | undefined)[]): Promise<Map<number, CompanyInfo>> {
  const unique = [...new Set(ids.filter((id): id is number => id != null))]
  if (unique.length === 0) return new Map()
  const rows = await handle.select({ id: company.id, name: company.name, code: company.code }).from(company).where(inArray(company.id, unique))
  return new Map(rows.map((r) => [r.id, r]))
}

/** All CLIENT users of a company (oldest first). */
export async function companyClientUsers(handle: DbHandle, companyId: number) {
  return handle
    .select({ id: user.id, name: user.name, email: user.email, userType: user.userType, createdAt: user.createdAt })
    .from(user)
    .where(and(eq(user.companyId, companyId), eq(user.role, 'client')))
    .orderBy(asc(user.createdAt), asc(user.id))
}

/**
 * Create a company. A code, when given, must be unique (case-insensitive).
 * Company NAMES are not identities — onboarding separately refuses a name that
 * already exists so an existing customer is not duplicated by mistake.
 */
export async function createCompany(handle: DbHandle, data: { name: string; code?: string | null }): Promise<number> {
  const name = data.name.trim()
  const code = data.code?.trim() || null
  if (!name) throw new Error('Company name is required.')
  if (code) {
    const [dup] = await handle.select({ id: company.id }).from(company).where(sql`lower(${company.code}) = lower(${code})`).limit(1)
    if (dup) throw new Error(`Company code "${code}" is already used by another company.`)
  }
  const [row] = await handle.insert(company).values({ name, code }).returning({ id: company.id })
  return row.id
}

/** Existing company with this exact name (trimmed, case-insensitive) — for duplicate-customer validation only. */
export async function findCompanyByName(handle: DbHandle, name: string): Promise<CompanyInfo | null> {
  const [row] = await handle
    .select({ id: company.id, name: company.name, code: company.code })
    .from(company)
    .where(sql`lower(btrim(${company.name})) = lower(btrim(${name}))`)
    .limit(1)
  return row ?? null
}

/**
 * The user's company, creating a company of their own when the user has none
 * (a client created outside Customer Onboarding, e.g. Admin → Create User).
 * Named after the user's company name, else the user — never matched to an
 * existing company by name.
 */
export async function ensureUserCompany(handle: DbHandle, userId: string): Promise<number> {
  const [u] = await handle
    .select({ name: user.name, companyId: user.companyId, companyName: user.companyName })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!u) throw new Error('User not found')
  if (u.companyId) return u.companyId
  const companyId = await createCompany(handle, { name: u.companyName?.trim() || u.name })
  await handle.update(user).set({ companyId, updatedAt: new Date() }).where(eq(user.id, userId))
  return companyId
}

/**
 * The company's wallet, creating an EMPTY inactive one (0 hours) only when the
 * company has none. Never a second wallet: the unique index on
 * support_wallet.companyId backs this up under concurrency.
 */
export async function ensureCompanyWallet(handle: DbHandle, companyId: number, primaryContactId: string): Promise<WalletRow> {
  const existing = await walletOfCompany(handle, companyId)
  if (existing) return existing
  const [created] = await handle
    .insert(supportWallet)
    .values({
      clientId: primaryContactId, companyId, projectId: null,
      totalPurchasedHours: 0, reservedHours: 0, consumedHours: 0, remainingHours: 0,
      status: 'inactive',
    })
    .onConflictDoNothing()
    .returning()
  return created ?? (await walletOfCompany(handle, companyId))!
}
