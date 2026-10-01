// Regressions after the company-wide wallet: Standard client "No Wallet Yet"
// and ticket #1995 Approve & Complete failing on `user.companyId`.
// Root cause: migration 0035 was not applied to the database. These tests pin
// the resolution using the REAL shape of those records (users, project 64,
// wallet 41) so the code path is proven once the schema exists, and pin that a
// missing schema surfaces as an actionable error instead of a raw query dump.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canViewCompanyWallet, ticketCompanyId } from '../lib/company-wallet-rules.ts'
import { planCompanyWalletMigration, type MigrationUser, type MigrationWallet } from '../lib/company-wallet-migration.ts'
import { planClose } from '../lib/wallet-reservation.ts'
import { canCloseTicket } from '../lib/client-ticket-rules.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const RESOLVER = read('lib/company-wallet.ts')
const QUERIES = read('app/actions/wallet/queries.ts')
const SUPPORT_PAGE = read('app/dashboard/support-wallet/page.tsx')
const UPDATE = read('app/actions/tickets/update.ts')

// Records as they exist today (ids shortened).
const PARAM = 'param-kher'          // Standard, no personal wallet, raised #1995
const PARAMVEER = 'paramveersinh'   // Approver, owns project 64 and wallet #41
const OTHER = 'john-doe'            // a different company
const users: MigrationUser[] = [
  { id: PARAM, name: 'Param kher', role: 'client', userType: 'standard', companyName: 'The Mevrick Technologies' },
  { id: PARAMVEER, name: 'Paramveersinh Kher', role: 'client', userType: 'approver', companyName: 'The Mevrick Technologies' },
  { id: OTHER, name: 'John Doe', role: 'client', userType: 'approver' },
]
const wallets: MigrationWallet[] = [
  { id: 41, clientId: PARAMVEER, totalPurchasedHours: 570, reservedHours: 0, consumedHours: 514, remainingHours: 56, status: 'active', transactionCount: 6 },
  { id: 33, clientId: OTHER, totalPurchasedHours: 500, reservedHours: 0, consumedHours: 50, remainingHours: 450, status: 'active', transactionCount: 7 },
]
const plan = planCompanyWalletMigration({
  users, companies: [], wallets,
  projects: [{ id: 64, projectCode: 'PROMAN', ownerId: PARAMVEER, memberIds: [PARAMVEER, PARAM] }],
  tickets: [{ id: 1995, ticketNumber: 'TKT-MUFKAQNW-46Y1', clientId: PARAM, projectId: 64 }],
})
const companyOf = (userId: string) => plan.companies.find((c) => c.userIds.includes(userId))!
const walletOfUser = (userId: string) => companyOf(userId).walletId

test('migration links Param kher and Paramveersinh to ONE company owning wallet #41 (no new wallet)', () => {
  assert.deepEqual(plan.ambiguities, [])
  assert.equal(companyOf(PARAM), companyOf(PARAMVEER))
  assert.equal(plan.totals.walletsConsolidated, 0)
  assert.equal(plan.companies.reduce((n, c) => n + (c.walletId ? 1 : 0), 0), 2, 'still exactly the two existing wallets')
})

test('A/B/C/G. Standard and Approver of the same company get the same wallet id — a missing personal wallet is irrelevant', () => {
  assert.equal(wallets.some((w) => w.clientId === PARAM), false, 'Param kher has no personal wallet')
  assert.equal(walletOfUser(PARAM), 41)
  assert.equal(walletOfUser(PARAMVEER), 41)
})

test('D. a different company gets a different wallet', () => {
  assert.equal(walletOfUser(OTHER), 33)
  assert.notEqual(walletOfUser(OTHER), walletOfUser(PARAM))
})

test('A/G. Support Wallet page: current user → companyId → company wallet (never clientId = currentUser.id)', () => {
  assert.match(SUPPORT_PAGE, /const wallets = await getWallets\(\)/)
  assert.match(QUERIES, /const companyIds = await visibleCompanyIds\(db, currentUser\)/)
  assert.match(QUERIES, /\.where\(inArray\(supportWallet\.companyId, companyIds\)\)/)
  assert.doesNotMatch(QUERIES, /supportWallet\.clientId, currentUser\.id/)
  assert.match(RESOLVER, /const own = await companyIdOfUser\(handle, currentUser\.id\)\s*\n\s*return own \? \[own\] : \[\]/)
})

test('E/J. ticket #1995: ticket → project 64 → owner\'s company → wallet #41', () => {
  // Company ids as the migration would assign them (1-based, in plan order).
  const companyId = (userId: string) => plan.companies.indexOf(companyOf(userId)) + 1
  const resolved = ticketCompanyId(companyId(PARAMVEER), companyId(PARAM)) // project owner's, raiser's
  assert.equal(plan.companies[resolved! - 1].walletId, 41)
  assert.match(RESOLVER, /\.innerJoin\(user, eq\(user\.id, project\.clientId\)\)/, 'project.clientId only decides the company')
})

test('F/11. completion settles against the company wallet with the existing atomic rule (no double deduction)', () => {
  // #1995: 90h estimate, nothing reserved, wallet #41 has 56h available.
  const close = planClose(90, 0)
  assert.equal(close.consume, 90)
  assert.equal(close.extraRequired, 90)
  assert.ok(close.extraRequired > 56, 'the existing guard refuses the close — the wallet never goes negative')
  const fn = UPDATE.slice(UPDATE.indexOf('async function closeTicketAsClient'), UPDATE.indexOf('export const clientReopenTicket'))
  assert.match(fn, /\.where\(and\(eq\(ticket\.id, ticketId\), eq\(ticket\.status, 'client_review'\)\)\)/, 'claimed once — a double click cannot settle twice')
  assert.match(fn, /const settled = await consumeReservedHoursAtomic\(tx, wallet\.id, totalDeduction, reservedOnTicket\)/)
  assert.match(fn, /throw buildWalletInsufficientError\(/, 'insufficient balance rolls back the whole close')
})

test('I. approval authorization is unchanged: only the client who raised the ticket may close it, checked before any wallet work', () => {
  assert.equal(canCloseTicket({ id: PARAM, role: 'client' } as never, PARAM), true, 'Param kher raised #1995')
  assert.equal(canCloseTicket({ id: PARAMVEER, role: 'client' } as never, PARAM), false, 'a colleague (even the Approver) may not')
  const fn = UPDATE.slice(UPDATE.indexOf('async function closeTicketAsClient'), UPDATE.indexOf('export const clientReopenTicket'))
  assert.match(fn, /if \(currentUser\.role !== 'client'\) return \{ success: false, error: 'Only clients can approve tickets\.' \}/, 'managers/admins cannot client-approve')
  assert.ok(fn.indexOf('canCloseTicket(currentUser, t.clientId)') < fn.indexOf('findTicketWallet(db, t)'))
})

test('H. company wallet access is company-bound', () => {
  assert.equal(canViewCompanyWallet({ role: 'client', companyId: 1 }, 1), true)
  assert.equal(canViewCompanyWallet({ role: 'client', companyId: 1 }, 2), false)
  assert.equal(canViewCompanyWallet({ role: 'client', companyId: null }, 1), false)
})

test('J. a missing company schema fails loudly with the actual cause (never hidden or ignored)', () => {
  assert.match(RESOLVER, /if \(pg\?\.code === '42703' \|\| pg\?\.code === '42P01'\) throw new Error\(COMPANY_SCHEMA_MISSING_MESSAGE, \{ cause: err \}\)/)
  assert.match(RESOLVER, /throw err\n/, 'any other error is re-thrown unchanged')
  for (const fn of ['companyIdOfUser', 'companyIdOfProject', 'walletOfCompany']) {
    const body = RESOLVER.slice(RESOLVER.indexOf(`export async function ${fn}`))
    assert.match(body.slice(0, body.indexOf('\n}')), /requireCompanySchema\(/, `${fn} is guarded`)
  }
})
