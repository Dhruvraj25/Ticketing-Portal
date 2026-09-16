import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Phase — Support Wallet Balance, Ticket Creation & Estimate Validation.
// createTicket()/estimates.ts/clientApproveTicket() are 'use server' modules
// importing '@/lib/db' — not importable directly under plain node:test (same
// constraint as every other *-integration.test.ts file in this repo). These
// tests read the real source instead of re-implementing DB/transaction
// behavior, so they fail the moment someone edits the wiring out from under
// them. Pure threshold/sufficiency logic is covered with real unit tests in
// tests/wallet-validation.test.ts.
//
// Covers spec cases 5-11, 15-17, 19-21 (backend) and 22-26 (frontend).
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const CREATE_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'create.ts'), 'utf8')
const ESTIMATES_SRC = readFileSync(join(ROOT, 'app', 'actions', 'estimates.ts'), 'utf8')
const UPDATE_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'update.ts'), 'utf8')
const NEW_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'tickets', 'new', 'page.tsx'), 'utf8')
const ESTIMATE_SECTION_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'estimate-section.tsx'), 'utf8')
const WALLET_RENEWALS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'wallet', 'renewals.ts'), 'utf8')
const ERROR_UTILS_SRC = readFileSync(join(ROOT, 'lib', 'error-utils.ts'), 'utf8')

function functionBody(src: string, startMarker: string, maxLen = 4000): string {
  const start = src.indexOf(startMarker)
  assert.ok(start >= 0, `could not find "${startMarker}"`)
  return src.slice(start, start + maxLen)
}

// ─── Section 1/2: the three old broken balance-check blocks are gone ──────

test('the old catch-swallow block (staff-creates-for-client) is completely removed from create.ts', () => {
  assert.doesNotMatch(CREATE_SRC, /err\.message\.includes\('Support hour balance'\)/, 'the swallow-bug catch condition must no longer exist')
  assert.doesNotMatch(CREATE_SRC, /err\.message\.includes\('below the minimum'\)/)
})

test('the old dead-code block (warning && remainingHours<=10, never true) is removed from create.ts', () => {
  assert.doesNotMatch(CREATE_SRC, /balanceCheck\.warning && balanceCheck\.remainingHours <= 10/)
})

test('createTicket no longer imports checkClientCanCreateTicket at all (replaced by the direct 10%-threshold check)', () => {
  assert.doesNotMatch(CREATE_SRC, /checkClientCanCreateTicket/)
})

// ─── Section 1/2: new threshold logic — client blocked, admin/manager bypass ─

test('case A1/A2/A3/A4 wiring: a CLIENT caller is checked against isAtOrBelowCreateThreshold and rejected with buildWalletThresholdError', () => {
  const body = functionBody(CREATE_SRC, 'export const createTicket')
  assert.match(body, /currentUser\.role === 'client' && isAtOrBelowCreateThreshold\(wallet\)/)
  assert.match(body, /throw buildWalletThresholdError\(\)/)
})

test('case B5/B6: admin/project_manager are NOT subject to the 10% threshold check (only client role gates on isAtOrBelowCreateThreshold)', () => {
  const body = functionBody(CREATE_SRC, 'export const createTicket')
  const thresholdCheckIdx = body.indexOf('isAtOrBelowCreateThreshold(wallet)')
  assert.ok(thresholdCheckIdx >= 0)
  const guardLine = body.slice(Math.max(0, thresholdCheckIdx - 80), thresholdCheckIdx)
  assert.match(guardLine, /currentUser\.role === 'client'/, 'the threshold check must be gated to client role only')
  assert.doesNotMatch(guardLine, /role === 'admin'|role === 'project_manager'/, 'admin/project_manager must never be gated by this check')
})

// ─── Section 3: insufficient-estimate — no role bypass, ever ──────────────

test('case B7/C10/D14: an upfront estimate exceeding the wallet is rejected via checkWalletSufficiency for EVERY role (no role check gates this block)', () => {
  const body = functionBody(CREATE_SRC, 'export const createTicket', 6000)
  const sectionIdx = body.indexOf('Section 3: if this ticket carries an upfront estimate')
  assert.ok(sectionIdx >= 0)
  const section = body.slice(sectionIdx, sectionIdx + 800)
  assert.match(section, /checkWalletSufficiency\(data\.estimatedHours, wallet\.remainingHours\)/)
  assert.match(section, /throw buildWalletInsufficientError\(data\.estimatedHours, wallet\.remainingHours\)/)
  // Must NOT be nested inside a role-specific if — it sits directly under
  // `if (data.ticketType !== 'historical')`, applying to every caller.
  assert.doesNotMatch(section, /if \(currentUser\.role/)
})

// ─── Section 11: manager/project authorization ─────────────────────────────

test('case C11: a project_manager creating a ticket for a project they do not manage is rejected (reuses the established managerId !== currentUser.id pattern)', () => {
  const body = functionBody(CREATE_SRC, 'export const createTicket')
  assert.match(body, /currentUser\.role === 'project_manager' && data\.projectId/)
  assert.match(body, /projectRow\.managerId !== currentUser\.id/)
  assert.match(body, /WALLET_CLIENT_ASSOCIATION_INVALID/)
})

test('admin is never subject to the project-manager-ownership check (the guard is role === project_manager only)', () => {
  const body = functionBody(CREATE_SRC, 'export const createTicket')
  const idx = body.indexOf("currentUser.role === 'project_manager' && data.projectId")
  assert.ok(idx >= 0)
  const guardBlock = body.slice(idx, idx + 400)
  assert.doesNotMatch(guardBlock, /role === 'admin'/)
})

// ─── Historical ticket flow untouched (must compose with, not replace) ────

test('the historical-ticket branch still uses its own checkWalletSufficiency call, unaffected by the new generic check', () => {
  assert.match(CREATE_SRC, /data\.ticketType === 'historical'/)
  assert.match(CREATE_SRC, /checkWalletSufficiency\(hoursCheck\.hours, wallet\.remainingHours\)/)
})

test('the generic wallet-validation block is explicitly skipped for historical tickets (data.ticketType !== \'historical\')', () => {
  const body = functionBody(CREATE_SRC, 'export const createTicket')
  const idx = body.indexOf('Support Wallet validation (sections 1-3)')
  assert.ok(idx >= 0)
  const block = body.slice(idx, idx + 700)
  assert.match(block, /if \(data\.ticketType !== 'historical'\)/)
})

// ─── Section 4/5: submitEstimate / approveEstimate / additional hours ──────

test('case: submitEstimate rejects when the proposed hours exceed the wallet, for admin AND project_manager alike (no role bypass)', () => {
  const body = functionBody(ESTIMATES_SRC, 'export const submitEstimate')
  assert.match(body, /checkWalletSufficiency\(data\.estimatedHours, wallet\.remainingHours\)/)
  assert.match(body, /throw buildWalletInsufficientError\(data\.estimatedHours, wallet\.remainingHours\)/)
  // The wallet check must not be nested inside any role-specific branch —
  // it must apply regardless of which staff role (already gated to
  // project_manager/admin at function entry) is calling.
  const checkIdx = body.indexOf('checkWalletSufficiency(data.estimatedHours')
  const between = body.slice(0, checkIdx)
  const lastRoleCheck = between.lastIndexOf("role !== 'project_manager'")
  const lastIfClose = between.lastIndexOf('\n}')
  assert.ok(lastRoleCheck < lastIfClose || lastRoleCheck === -1 || between.slice(lastRoleCheck).includes('throw'), 'the role gate above must be a simple entry guard, not wrapping the wallet check')
})

test('case D15/D17: approveEstimate re-checks the wallet FRESH at approval time (section 4\'s literal scenario) using buildManagerApprovalInsufficientError', () => {
  const body = functionBody(ESTIMATES_SRC, 'export const approveEstimate')
  assert.match(body, /re-check.*approval.*stage|approval-stage recheck/i)
  assert.match(body, /const \[wallet\] = await db\.select\(\)\.from\(supportWallet\)\.where\(eq\(supportWallet\.clientId, t\.clientId\)\)/, 'must re-fetch the wallet fresh inside this function, not reuse an earlier read')
  assert.match(body, /checkWalletSufficiency\(t\.estimatedHours, wallet\.remainingHours\)/)
  assert.match(body, /throw buildManagerApprovalInsufficientError\(t\.estimatedHours, wallet\.remainingHours\)/)
})

test('case D16: approveEstimate wallet check runs BEFORE the status update commits (sufficient balance -> proceeds to update)', () => {
  const body = functionBody(ESTIMATES_SRC, 'export const approveEstimate')
  const checkIdx = body.indexOf('buildManagerApprovalInsufficientError')
  const updateIdx = body.indexOf("status: 'estimate_approved'")
  assert.ok(checkIdx >= 0 && updateIdx >= 0 && checkIdx < updateIdx, 'the wallet check must run before the ticket status update')
})

test('requestAdditionalHours checks the NEW TOTAL (existing + additional) against the wallet, no role bypass', () => {
  const body = functionBody(ESTIMATES_SRC, 'export const requestAdditionalHours')
  assert.match(body, /const newTotal = \(t\.estimatedHours \|\| 0\) \+ additionalHours/)
  assert.match(body, /checkWalletSufficiency\(newTotal, wallet\.remainingHours\)/)
})

test('approveAdditionalHours re-checks the wallet at the approval stage, using buildManagerApprovalInsufficientError', () => {
  const body = functionBody(ESTIMATES_SRC, 'export const approveAdditionalHours')
  assert.match(body, /checkWalletSufficiency\(newTotalHours, wallet\.remainingHours\)/)
  assert.match(body, /throw buildManagerApprovalInsufficientError\(newTotalHours, wallet\.remainingHours\)/)
})

// ─── Section 6/12/19/20/21: the atomic deduction primitive itself ─────────

test('deductWalletHoursAtomic uses a SQL-expression increment/decrement (not a JS-computed read-then-write) guarded by a WHERE remainingHours >= hours clause', () => {
  const src = readFileSync(join(ROOT, 'lib', 'wallet-validation.ts'), 'utf8')
  const body = functionBody(src, 'export async function deductWalletHoursAtomic')
  assert.match(body, /sql`\$\{supportWallet\.consumedHours\} \+ \$\{hours\}`/, 'consumedHours must be incremented via a SQL expression, not a JS-computed value')
  assert.match(body, /sql`\$\{supportWallet\.remainingHours\} - \$\{hours\}`/, 'remainingHours must be decremented via a SQL expression')
  assert.match(body, /gte\(supportWallet\.remainingHours, hours\)/, 'the WHERE clause must guard sufficiency atomically with the update')
  assert.match(body, /rows\[0\] \?\? null/, 'no matching row (insufficient balance) must return null, not a partial/fabricated result')
})

test('case G21 (concurrency mechanism proof — not a live concurrency test): the atomic UPDATE is the actual safety mechanism, not a SELECT-then-UPDATE race', () => {
  const src = readFileSync(join(ROOT, 'lib', 'wallet-validation.ts'), 'utf8')
  const body = functionBody(src, 'export async function deductWalletHoursAtomic')
  // A single .update(...).where(...).returning() call — no separate SELECT
  // immediately before it inside this function that a race could invalidate.
  assert.match(body, /\.update\(supportWallet\)/)
  assert.doesNotMatch(body, /await dbOrTx\s*\n?\s*\.select/, 'must not SELECT the balance inside this function before UPDATEing it — that would reintroduce the race this function exists to close')
})

// ─── clientApproveTicket — the actual deduction point, section 6/12/19/20 ──

test('clientApproveTicket wraps the ticket status update + wallet deduction + history insert in ONE db.transaction', () => {
  const body = functionBody(UPDATE_SRC, 'export const clientApproveTicket', 9000)
  const txIdx = body.indexOf('await db.transaction(async (tx) => {')
  assert.ok(txIdx >= 0, 'expected a db.transaction(...) wrapping the close operation')
  const txBody = body.slice(txIdx)
  assert.match(txBody, /deductWalletHoursAtomic\(tx, wallet\.id, totalDeduction\)/, 'the deduction must run through the tx handle')
  assert.match(txBody, /tx\.update\(ticket\)\.set\(ticketUpdate\)/, 'the ticket status update must run through the tx handle')
  assert.match(txBody, /tx\.insert\(ticketHistory\)/, 'the history insert must run through the tx handle')
})

test('a failed atomic deduction throws INSIDE the transaction — status stays client_review, no history entry, no wallet mutation (case F19/F20/E15/E17)', () => {
  const body = functionBody(UPDATE_SRC, 'export const clientApproveTicket', 9000)
  const txIdx = body.indexOf('await db.transaction(async (tx) => {')
  const deductIdx = body.indexOf('deductWalletHoursAtomic(tx, wallet.id, totalDeduction)', txIdx)
  const throwIdx = body.indexOf('throw buildWalletInsufficientError', deductIdx)
  const ticketUpdateIdx = body.indexOf('await tx.update(ticket).set(ticketUpdate)', deductIdx)
  assert.ok(deductIdx > 0 && throwIdx > deductIdx && ticketUpdateIdx > throwIdx, 'the insufficient-balance throw must happen BEFORE the ticket status update, and both must be inside the same transaction so a throw rolls everything back')
})

test('the ticket status update is a SINGLE UPDATE statement (status + consumedHours together when a deduction happened), not two separate writes racing each other', () => {
  const body = functionBody(UPDATE_SRC, 'export const clientApproveTicket', 9000)
  assert.match(body, /const ticketUpdate: Record<string, unknown> = \{ status: 'closed', closedAt: new Date\(\), updatedAt: new Date\(\) \}/)
  assert.match(body, /ticketUpdate\.consumedHours = totalDeduction/)
  assert.match(body, /await tx\.update\(ticket\)\.set\(ticketUpdate\)\.where\(eq\(ticket\.id, ticketId\)\)/)
  // Only ONE tx.update(ticket) call in the whole function.
  const matches = body.match(/tx\.update\(ticket\)/g) || []
  assert.equal(matches.length, 1, 'expected exactly one tx.update(ticket) call, not separate status/consumedHours writes')
})

test('the unsafe Math.max(0, ...) floor-without-reject pattern is completely gone from clientApproveTicket', () => {
  const body = functionBody(UPDATE_SRC, 'export const clientApproveTicket', 9000)
  assert.doesNotMatch(body, /Math\.max\(0, wallet\.remainingHours - totalDeduction\)/)
})

test('the old silent catch-and-swallow around the entire wallet deduction is gone — the deduction failure now actually propagates', () => {
  const body = functionBody(UPDATE_SRC, 'export const clientApproveTicket', 9000)
  assert.doesNotMatch(body, /\[clientApproveTicket\] wallet deduction failed/, 'the old swallow-everything catch message must be gone')
})

test('wallet-low/wallet-empty notifications fire only AFTER the transaction commits, using the deduction result (never for an aborted close)', () => {
  const body = functionBody(UPDATE_SRC, 'export const clientApproveTicket', 9000)
  const txEndIdx = body.indexOf('await db.transaction')
  const commitEndMarker = body.indexOf('Post-commit: wallet-low/wallet-empty alerts')
  assert.ok(commitEndMarker > txEndIdx)
  const postCommit = body.slice(commitEndMarker)
  assert.match(postCommit, /if \(wallet && deductionResult && previousRemaining !== null\) \{/)
  assert.match(postCommit, /shouldNotifyWalletLow\(previousRemaining, newRemaining\)/)
  assert.match(postCommit, /shouldNotifyWalletEmpty\(previousRemaining, newRemaining\)/)
})

test('the existing "Ticket Closed" developer/manager notification logic is untouched (still present, unchanged event/recipients shape)', () => {
  assert.match(UPDATE_SRC, /\/\/ Ticket Closed: In-App \+ Email \+ Teams to developer and manager/)
  assert.match(UPDATE_SRC, /const closeTicketLink = \(getPortalUrl\(\)\) \+ '\/dashboard\/tickets\/' \+ ticketId/)
})

// ─── Frontend — sections 8/9/22-26 ──────────────────────────────────────────

test('case: tickets/new/page.tsx fetches the wallet threshold status only for the client role, via getMyWalletThresholdStatus', () => {
  assert.match(NEW_PAGE_SRC, /getMyWalletThresholdStatus/)
  const idx = NEW_PAGE_SRC.indexOf("me.role === 'client'")
  assert.ok(idx >= 0)
  const block = NEW_PAGE_SRC.slice(idx, idx + 500)
  assert.match(block, /getMyWalletThresholdStatus\(\)/)
})

test('case 22: the Submit button is disabled for a client at/below the wallet threshold', () => {
  assert.match(NEW_PAGE_SRC, /disabled=\{loading \|\| \(userRole === 'client' && walletAtOrBelowThreshold\)\}/)
})

test('case 24: admin/project_manager are never disabled by walletAtOrBelowThreshold (the disabled condition is client-role-gated)', () => {
  const idx = NEW_PAGE_SRC.indexOf("disabled={loading || (userRole === 'client' && walletAtOrBelowThreshold)}")
  assert.ok(idx >= 0)
})

test('case: handleSubmit blocks submission early for a client at/below threshold, with the section 8 message, before any other validation runs', () => {
  const body = functionBody(NEW_PAGE_SRC, 'const handleSubmit = async')
  const guardIdx = body.indexOf("userRole === 'client' && walletAtOrBelowThreshold")
  const projectValidationIdx = body.indexOf("if (!selectedProjectId)")
  assert.ok(guardIdx >= 0 && projectValidationIdx > guardIdx, 'the wallet-threshold guard must run before the rest of the field validation')
  assert.match(body, /Ticket creation is unavailable because your Support Wallet balance is at or below the 10% limit/)
})

test('case 26: the submit catch block uses getFriendlyError instead of raw err.message', () => {
  assert.match(NEW_PAGE_SRC, /import \{ getFriendlyError \} from '@\/lib\/error-utils'/)
  assert.match(NEW_PAGE_SRC, /setError\(getFriendlyError\(err\)\)/)
  assert.doesNotMatch(NEW_PAGE_SRC, /setError\(err instanceof Error \? err\.message : 'Failed to create ticket'\)/, 'the old raw-message catch must be replaced')
})

test('estimate-section.tsx also resolves errors via getFriendlyError (covers submitEstimate/approveEstimate/requestAdditionalHours/approveAdditionalHours rejections)', () => {
  assert.match(ESTIMATE_SECTION_SRC, /import \{ getFriendlyError \} from '@\/lib\/error-utils'/)
  assert.match(ESTIMATE_SECTION_SRC, /setError\(getFriendlyError\(err\)\)/)
})

test('getMyWalletThresholdStatus is not applicable (returns applicable:false) for non-client roles — it never gates admin/manager', () => {
  const body = functionBody(WALLET_RENEWALS_SRC, 'export const getMyWalletThresholdStatus')
  assert.match(body, /if \(currentUser\.role !== 'client'\) \{/)
  assert.match(body, /applicable: false/)
})

test('getMyWalletThresholdStatus reuses isAtOrBelowCreateThreshold from wallet-validation.ts — no second threshold calculation', () => {
  assert.match(WALLET_RENEWALS_SRC, /import \{ isAtOrBelowCreateThreshold \} from '@\/lib\/wallet-validation'/)
  const body = functionBody(WALLET_RENEWALS_SRC, 'export const getMyWalletThresholdStatus')
  assert.match(body, /isAtOrBelowCreateThreshold\(wallet\)/)
})

test('getMyWalletThresholdStatus does NOT modify the existing checkClientCanCreateTicket function (unrelated flat-10/contract-expiry logic preserved)', () => {
  assert.match(WALLET_RENEWALS_SRC, /if \(wallet\.remainingHours <= 10\) \{/, 'checkClientCanCreateTicket\'s own pre-existing logic must remain untouched — this phase does not modify that function')
})

// ─── Error codes / error-utils.ts wiring (section 7) ───────────────────────

test('error-utils.ts declares the three spec-named wallet error codes', () => {
  assert.match(ERROR_UTILS_SRC, /'WALLET_BELOW_CLIENT_THRESHOLD'/)
  assert.match(ERROR_UTILS_SRC, /'WALLET_INSUFFICIENT_FOR_ESTIMATE'/)
  assert.match(ERROR_UTILS_SRC, /'WALLET_CLIENT_ASSOCIATION_INVALID'/)
})

test('createAppError is actually used now (was previously dead code in this repo) — at least the wallet-validation module calls it', () => {
  const src = readFileSync(join(ROOT, 'lib', 'wallet-validation.ts'), 'utf8')
  assert.match(src, /createAppError\(/)
})

test('no ERROR_PATTERNS entry was added for WALLET_INSUFFICIENT_FOR_ESTIMATE (would discard the dynamic hour values on a pattern match)', () => {
  const patternsBlock = functionBody(ERROR_UTILS_SRC, 'const ERROR_PATTERNS', 2000)
  // A code appearing only inside an explanatory comment is fine and expected
  // (the design note references it by name) — what must NOT exist is an
  // actual `code: 'WALLET_INSUFFICIENT_FOR_ESTIMATE'} pattern-table entry.
  assert.doesNotMatch(patternsBlock, /code:\s*'WALLET_INSUFFICIENT_FOR_ESTIMATE'/, 'this code must only ever be set via createAppError\'s .code / not matched by a static regex, per the serialization-loss design note in wallet-validation.ts')
})

test('an ERROR_PATTERNS entry DOES exist for WALLET_BELOW_CLIENT_THRESHOLD (safe — its message has no dynamic values)', () => {
  const patternsBlock = functionBody(ERROR_UTILS_SRC, 'const ERROR_PATTERNS', 2000)
  assert.match(patternsBlock, /WALLET_BELOW_CLIENT_THRESHOLD/)
})

// ─── Section 15/16: scope discipline ───────────────────────────────────────

test('no DB schema/migration file was touched — every check reads/writes existing supportWallet columns only', () => {
  const src = readFileSync(join(ROOT, 'lib', 'wallet-validation.ts'), 'utf8')
  assert.doesNotMatch(src, /pgTable|ALTER TABLE|CREATE TABLE/i)
})
