// Company-wide Support Wallet: ONE company → ONE wallet → all its client users.
// Pure rules + migration planner are exercised directly; server wiring is
// pinned at source level (repo convention — node:test has no DB/React).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canViewCompanyWallet, ticketCompanyId, walletOwnerLabel } from '../lib/company-wallet-rules.ts'
import { planCompanyWalletMigration, type MigrationUser, type MigrationWallet } from '../lib/company-wallet-migration.ts'
import { planClose, reservationShortfall } from '../lib/wallet-reservation.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const SCHEMA = read('lib/db/schema.ts')
const MIGRATION_SQL = read('lib/db/migrations/0035_add_company_wallet.sql')
const RESOLVER = read('lib/company-wallet.ts')
const TICKET_WALLET = read('lib/ticket-wallet.ts')
const ESTIMATES = read('app/actions/estimates.ts')
const UPDATE = read('app/actions/tickets/update.ts')
const CREATE = read('app/actions/tickets/create.ts')
const QUERIES = read('app/actions/wallet/queries.ts')
const TXNS = read('app/actions/wallet/transactions.ts')
const RENEWALS = read('app/actions/wallet/renewals.ts')
const ASSIGN = read('app/actions/wallet/assign-hours.ts')
const DASHBOARD = read('app/actions/dashboard.ts')
const ONBOARDING = read('app/actions/onboarding.ts')
const PROJECT_USERS = read('app/actions/projects/users.ts')
const REPORTS = read('app/actions/reports/wallet-reports.ts')
const DETAIL_UI = read('app/dashboard/wallets/[id]/wallet-detail-client.tsx')
const CLIENT_UI = read('app/dashboard/support-wallet/support-wallet-client.tsx')

// ── In-memory model of the resolution rules (same functions the server uses) ─
const ABC = 1, XYZ = 2
const users = new Map([
  ['param', { companyId: ABC, userType: 'standard' }],
  ['paramveer', { companyId: ABC, userType: 'approver' }],
  ['john', { companyId: ABC, userType: 'standard' }],
  ['other', { companyId: XYZ, userType: 'approver' }],
])
const projects = new Map([[64, { owner: 'paramveer' }], [90, { owner: 'other' }]])
const wallets = new Map([
  [ABC, { id: 41, purchased: 570, reserved: 20, consumed: 494, remaining: 56 }],
  [XYZ, { id: 77, purchased: 100, reserved: 0, consumed: 0, remaining: 100 }],
])
const walletForUser = (u: string) => wallets.get(users.get(u)!.companyId)!
const walletForTicket = (t: { clientId: string; projectId: number | null }) => {
  const projectCompany = t.projectId ? users.get(projects.get(t.projectId)!.owner)!.companyId : null
  return wallets.get(ticketCompanyId(projectCompany, users.get(t.clientId)?.companyId)!)!
}

test('A. same company, two users: a ticket by user A uses the company wallet; user B sees the same balance', () => {
  const w = walletForTicket({ clientId: 'param', projectId: 64 })
  assert.equal(w.id, 41)
  w.reserved += 5; w.remaining -= 5 // Param's 5h ticket
  assert.equal(walletForUser('paramveer').remaining, 51, 'Paramveersinh immediately sees 51h')
  assert.equal(walletForUser('param'), walletForUser('john'), 'one wallet object for every company user')
  w.reserved -= 5; w.remaining += 5
})

test('B/14. Standard and Approver resolve the SAME wallet — roles never create separate wallets', () => {
  assert.equal(walletForUser('param').id, walletForUser('paramveer').id)
  // Estimate approval (Approver) and creation (Standard) both go through findTicketWallet.
  assert.ok((ESTIMATES.match(/findTicketWallet\(db, t\)/g) ?? []).length >= 3)
  assert.ok((ESTIMATES.match(/reserveHoursForTicket\(tx, t,/g) ?? []).length >= 4)
  assert.match(CREATE, /findTicketWallet\(db, \{ clientId: actualClientId, projectId: data\.projectId \?\? null \}\)/)
})

test('6/7. ticket → project → company → wallet (raiser company only when there is no project company)', () => {
  assert.equal(ticketCompanyId(ABC, XYZ), ABC, 'the project decides, deterministically')
  assert.equal(ticketCompanyId(null, XYZ), XYZ)
  assert.equal(ticketCompanyId(null, null), null)
  assert.match(TICKET_WALLET, /return walletOfCompany\(handle, await companyIdForTicket\(handle, t\)\)/)
  assert.doesNotMatch(TICKET_WALLET, /supportWallet\.clientId|ownerId/, 'no personal / project-owner wallet fallback')
  assert.match(RESOLVER, /\.innerJoin\(user, eq\(user\.id, project\.clientId\)\)/, 'project company = its owner user\'s companyId')
})

test('C/15. a user added to an existing company inherits its wallet — no second wallet is created', () => {
  // Onboarding → existing project: users get the project company; no wallet insert in that flow.
  const addUsers = ONBOARDING.slice(ONBOARDING.indexOf('export const addClientUsersToExistingProject'))
  assert.match(addUsers, /const companyId = projectInfo\.clientCompanyId \?\? \(await ensureUserCompany\(tx, projectInfo\.clientId\)\)/)
  assert.match(addUsers, /companyCode,\s*\n\s*companyId,\s*\n\s*\}\)\.returning\(\)/)
  assert.doesNotMatch(addUsers, /insert\(supportWallet\)/)
  // Project → Add user: joins the project's company; ensure* returns the existing wallet.
  assert.match(PROJECT_USERS, /companyId: projectCompanyId,/)
  assert.match(ASSIGN, /return ensureCompanyWallet\(db, companyId, clientId\)/)
  assert.match(RESOLVER, /const existing = await walletOfCompany\(handle, companyId\)\s*\n\s*if \(existing\) return existing/)
  assert.match(RESOLVER, /\.onConflictDoNothing\(\)/, 'the unique index backs it up under concurrency')
})

test('15. a new customer = one company + one company wallet; re-onboarding an existing company is refused', () => {
  const create = ONBOARDING.slice(ONBOARDING.indexOf('export const createCustomerOnboarding'), ONBOARDING.indexOf('export const getOnboardingClients'))
  assert.match(create, /const companyId = await createCompany\(tx, \{ name: companyName, code: companyCode \}\)/)
  assert.equal((create.match(/insert\(supportWallet\)\.values\(\{\s*\n\s*clientId: primaryUser\.id,\s*\n\s*companyId,/g) ?? []).length, 2, 'hypercare + standard wallet both owned by the company')
  assert.match(create, /const existingCompany = await findCompanyByName\(db, companyName\)/)
  assert.ok(create.indexOf('findCompanyByName(db, companyName)') < create.indexOf('db.transaction('), 'checked before anything is written')
})

test('D/13. a user of Company A can never see Company B\'s wallet', () => {
  assert.equal(canViewCompanyWallet({ role: 'client', companyId: ABC }, ABC), true)
  assert.equal(canViewCompanyWallet({ role: 'client', companyId: ABC }, XYZ), false)
  assert.equal(canViewCompanyWallet({ role: 'client', companyId: null }, ABC), false, 'no company → no wallet')
  assert.equal(canViewCompanyWallet({ role: 'client', companyId: ABC }, null), false)
  assert.equal(canViewCompanyWallet({ role: 'project_manager', managedCompanyIds: [XYZ] }, ABC), false)
  assert.equal(canViewCompanyWallet({ role: 'project_manager', managedCompanyIds: [ABC] }, ABC), true)
  assert.equal(canViewCompanyWallet({ role: 'admin' }, ABC), true)
  assert.equal(canViewCompanyWallet({ role: 'developer' }, ABC), false)
  // Every client-facing read is company-checked server side.
  assert.match(QUERIES, /if \(currentUser\.role === 'client' && \(w\.companyId == null \|\| w\.companyId !== await companyIdOfUser\(db, currentUser\.id\)\)\)/)
  assert.equal((TXNS.match(/await assertClientWalletAccess\(db, currentUser, w\)/g) ?? []).length, 2, 'transactions + consumption')
  assert.match(REPORTS, /conditions\.push\(inArray\(supportWallet\.companyId, companyIds\)\)/)
})

test('E. admin adds hours → the company wallet grows for every company user', () => {
  const w = walletForUser('john')
  const before = w.remaining
  w.purchased += 100; w.remaining += 100
  assert.equal(walletForUser('param').remaining, before + 100)
  assert.equal(walletForUser('paramveer').remaining, 156)
  // addWalletHours updates the wallet row by id — the company wallet; no per-user wallet is created.
  const add = ASSIGN.slice(ASSIGN.indexOf('export const addWalletHours'), ASSIGN.indexOf('export const deductWalletHours'))
  assert.match(add, /\.where\(eq\(supportWallet\.id, data\.walletId\)\)/)
  assert.doesNotMatch(add, /insert\(supportWallet\)/)
  w.purchased -= 100; w.remaining -= 100
})

test('F/G/H. reservation and completion run against the ticket\'s company wallet (rules unchanged)', () => {
  assert.equal(reservationShortfall(5, 0), 5)
  const close = planClose(5, 5)
  assert.equal(close.releaseReserved, 5)
  assert.equal(close.consume, 5)
  assert.match(TICKET_WALLET, /const wallet = await findTicketWallet\(tx, t\)\s*\n\s*if \(!wallet\) return null\s*\n\s*\n\s*const updated = await reserveWalletHoursAtomic\(tx, wallet\.id, h\)/)
  assert.match(UPDATE, /wallet = \(await findTicketWallet\(db, t\)\) \?\? undefined/, 'close/consume uses the same company wallet')
})

test('9/8. dashboard card, renewal banner and ticket-create checks read the COMPANY wallet', () => {
  assert.match(DASHBOARD, /const wallet = await walletOfUser\(db, currentUser\.id\)/)
  assert.match(RENEWALS, /const wallet = await walletOfUser\(db, clientId\)/)
  assert.match(RENEWALS, /const wallet = await walletOfUser\(db, currentUser\.id\)/)
  assert.match(RENEWALS, /const wallet = await findTicketWallet\(db, \{ clientId, projectId: projectId \?\? null \}\)/)
  assert.doesNotMatch(RENEWALS + DASHBOARD, /eq\(supportWallet\.clientId/)
  assert.match(RESOLVER, /return walletOfCompany\(handle, await companyIdOfUser\(handle, userId\)\)/)
})

test('10. renewal requests reference the company', () => {
  assert.match(RENEWALS, /customerCompanyName: \(companyId \? companies\.get\(companyId\)\?\.name : null\) \|\| client\?\.companyName \|\| undefined/)
})

test('8. wallet pages are titled by the company', () => {
  assert.equal(walletOwnerLabel('ABC Technologies', 'Paramveersinh Kher'), 'ABC Technologies')
  assert.equal(walletOwnerLabel(null, 'Solo Client'), 'Solo Client')
  assert.match(DETAIL_UI, /\{wallet\.companyName \|\| wallet\.clientName\} — Support Wallet/)
  assert.match(CLIENT_UI, /\$\{wallet\.companyName\} — Support Wallet/)
})

test('3. schema: company table, user.companyId, ONE wallet per company (unique), clientId kept', () => {
  assert.match(SCHEMA, /export const company = pgTable\('company', \{/)
  assert.match(SCHEMA, /companyId: integer\('companyId'\)\.references\(\(\) => company\.id, \{ onDelete: 'restrict' \}\)/)
  assert.match(SCHEMA, /companyIdUnique: uniqueIndex\('support_wallet_company_id_unique_idx'\)\.on\(table\.companyId\)/)
  assert.match(MIGRATION_SQL, /CREATE UNIQUE INDEX IF NOT EXISTS "support_wallet_company_id_unique_idx" ON "support_wallet" \("companyId"\)/)
  assert.match(MIGRATION_SQL, /ADD COLUMN IF NOT EXISTS "companyId"/)
  assert.doesNotMatch(MIGRATION_SQL.replace(/^--.*$/gm, ''), /\bDROP\s|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\s+"/i, 'schema migration is additive only')
})

// ── Migration planner ───────────────────────────────────────────────────────
const u = (id: string, extra: Partial<MigrationUser> = {}): MigrationUser => ({ id, name: id, role: 'client', userType: 'standard', ...extra })
const w = (id: number, clientId: string, p: number, r: number, c: number, rem: number, extra: Partial<MigrationWallet> = {}): MigrationWallet =>
  ({ id, clientId, totalPurchasedHours: p, reservedHours: r, consumedHours: c, remainingHours: rem, status: 'active', transactionCount: 3, ...extra })

test('I. existing data: each company keeps its wallet row, balances and transactions untouched', () => {
  const plan = planCompanyWalletMigration({
    users: [
      u('pk', { companyName: 'The Mevrick Technologies' }),
      u('pvk', { companyName: 'The Mevrick Technologies', userType: 'approver' }),
      u('john', { name: 'John Doe', userType: 'approver' }),
      u('admin', { role: 'admin', companyName: 'The Mevrick Technologies' }),
    ],
    companies: [],
    wallets: [w(41, 'pvk', 570, 0, 514, 56, { transactionCount: 6 }), w(33, 'john', 500, 0, 50, 450, { transactionCount: 7 })],
    projects: [{ id: 64, ownerId: 'pvk', memberIds: ['pvk', 'pk'] }],
  })
  assert.deepEqual(plan.ambiguities, [])
  const mevrick = plan.companies.find((c) => c.name === 'The Mevrick Technologies')!
  assert.deepEqual([...mevrick.userIds].sort(), ['pk', 'pvk'], 'both users, never the admin')
  assert.equal(mevrick.walletId, 41)
  assert.deepEqual(mevrick.resulting, { totalPurchasedHours: 570, reservedHours: 0, consumedHours: 514, remainingHours: 56, contractStartDate: null, contractEndDate: null, transactions: 6 })
  const john = plan.companies.find((c) => c.name === 'John Doe')!
  assert.equal(john.walletId, 33, 'a client without a company name becomes its own company')
  assert.equal(plan.totals.walletsConsolidated, 0)
  assert.equal(plan.totals.transactions, 13)
})

test('J. multiple wallets in one company: deterministic, lossless consolidation into the oldest wallet', () => {
  const plan = planCompanyWalletMigration({
    users: [u('a', { companyName: 'ABC', companyCode: 'ABC-1' }), u('b', { companyName: 'abc ', companyCode: 'abc-1' })],
    companies: [],
    wallets: [
      w(9, 'b', 100, 10, 40, 50, { contractStartDate: '2026-02-01', contractEndDate: '2026-12-31', transactionCount: 4 }),
      w(5, 'a', 200, 0, 150, 50, { contractStartDate: '2026-01-01', contractEndDate: '2026-06-30', transactionCount: 2 }),
    ],
  })
  assert.deepEqual(plan.ambiguities, [])
  assert.deepEqual(plan.consolidations, [{ target: 'new:code:abc-1', survivorId: 5, mergedIds: [9] }])
  const c = plan.companies[0]
  assert.deepEqual(c.resulting, { totalPurchasedHours: 300, reservedHours: 10, consumedHours: 190, remainingHours: 100, contractStartDate: '2026-01-01', contractEndDate: '2026-12-31', transactions: 6 })
  const script = read('scripts/migrate-company-wallets.ts')
  assert.match(script, /UPDATE wallet_transaction SET "walletId" = \$1 WHERE "walletId" = \$2/, 'transactions are moved, never deleted')
  assert.match(script, /if \(plan\.consolidations\.length && !CONSOLIDATE\)/, 'merging needs explicit approval')
})

test('ambiguous data stops the migration instead of guessing', () => {
  const nameless = planCompanyWalletMigration({
    users: [u('owner', { companyName: 'ABC' }), u('mystery')],
    companies: [],
    wallets: [],
    projects: [{ id: 1, projectCode: 'P1', ownerId: 'owner', memberIds: ['mystery'] }],
  })
  assert.equal(nameless.ambiguities[0]?.kind, 'nameless_user_shares_project')

  const conflicting = planCompanyWalletMigration({
    users: [u('a', { companyName: 'ABC' }), u('b', { companyName: 'ABC' })],
    companies: [],
    wallets: [w(1, 'a', 10, 0, 0, 10, { contractType: 'standard' }), w(2, 'b', 0, 0, 0, 0, { contractType: 'hypercare' })],
  })
  assert.equal(conflicting.ambiguities[0]?.kind, 'conflicting_contract_types')

  const legacy = planCompanyWalletMigration({
    users: [u('a', { companyName: 'ABC', accountId: 'org1' }), u('b', { companyName: 'XYZ', accountId: 'org1' })],
    companies: [],
    wallets: [],
  })
  assert.equal(legacy.ambiguities[0]?.kind, 'legacy_account_split')

  const script = read('scripts/migrate-company-wallets.ts')
  assert.match(script, /if \(plan\.ambiguities\.length\) \{ process\.exitCode = 2; return \}/)
})

test('re-running the migration is idempotent: linked users and wallets are left alone', () => {
  const plan = planCompanyWalletMigration({
    users: [u('a', { companyName: 'ABC', companyId: 7 }), u('new', { companyName: 'ABC' })],
    companies: [{ id: 7, name: 'ABC' }],
    wallets: [w(1, 'a', 10, 0, 0, 10, { companyId: 7 })],
  })
  assert.equal(plan.totals.companiesToCreate, 0)
  assert.deepEqual(plan.companies[0].usersToLink, ['new'], 'a straggler joins the existing company')
  assert.equal(plan.totals.walletsToLink, 0)
})
