import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Admin Ticket Dates + Completed Ticket Rendering — regression suite
// ============================================================================
// updateTicketDates (app/actions/tickets/update.ts) and the ticket detail
// page (app/dashboard/tickets/[id]/page.tsx) both live in server-action /
// server-component modules that import '@/lib/db' — not importable directly
// under node's native TS loader outside the Next.js bundler (same
// constraint documented in tests/report-access.test.ts). These tests read
// the real source instead of re-implementing the authorization/rendering
// logic, so they stay honest to whatever the code actually does, and fail
// the moment someone edits it out from under them.

const ROOT = join(import.meta.dirname, '..')
const UPDATE_ACTIONS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'update.ts'), 'utf8')
const DETAIL_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'tickets', '[id]', 'page.tsx'), 'utf8')
const DATES_EDITOR_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'ticket-dates-editor.tsx'), 'utf8')

function functionBody(src: string, startMarker: string): string {
  const start = src.indexOf(startMarker)
  assert.ok(start >= 0, `could not find "${startMarker}"`)
  // Function bodies here all end at the closing `})` of the wrapServerAction(...) call.
  const end = src.indexOf('\n})', start)
  return src.slice(start, end === -1 ? undefined : end)
}

const updateTicketDatesBody = functionBody(UPDATE_ACTIONS_SRC, 'export const updateTicketDates')

// ─── Server-side authorization (Section: SECURITY) ─────────────────────────

test('updateTicketDates: ADMIN is allowed (no role check blocks admin)', () => {
  assert.match(updateTicketDatesBody, /if \(currentUser\.role !== 'admin'\) \{/)
})

test('updateTicketDates: the ONLY passing role is admin — manager/client/approver are all rejected', () => {
  // A strict `!== 'admin'` throw means every other role (project_manager,
  // client, developer, and any client "approver" userType) is rejected by
  // construction — there is no secondary allow-list to accidentally widen.
  assert.match(updateTicketDatesBody, /throw new Error\('Only admins can edit ticket dates'\)/)
  // Regression guard: must never be loosened to an "isManagerOrAdmin"-style check.
  assert.ok(!updateTicketDatesBody.includes("role === 'project_manager'"), 'manager must not gain date-edit permission')
  assert.ok(!updateTicketDatesBody.includes("role === 'client'"), 'client must not gain date-edit permission')
})

test('updateTicketDates: authorization runs server-side, from the session user, not client input', () => {
  const roleCheckIdx = updateTicketDatesBody.indexOf("role !== 'admin'")
  const getUserIdx = updateTicketDatesBody.indexOf('await getUser()')
  assert.ok(getUserIdx >= 0 && getUserIdx < roleCheckIdx, 'role must come from getUser() (session), checked before any DB write')
})

// ─── Works for every ticket status (Section: PART 2 requirement) ──────────

test('updateTicketDates: has no ticket-status gate — works for open/in-progress/review/rework/closed alike', () => {
  assert.ok(!/ticket\.status|t\.status\s*(!==|===)/.test(updateTicketDatesBody), 'date editing must not be restricted by ticket status')
})

// ─── Date validation (unchanged rules) ─────────────────────────────────────

test('updateTicketDates: rejects an invalid creation/closing date', () => {
  assert.match(updateTicketDatesBody, /throw new Error\('Invalid creation date'\)/)
  assert.match(updateTicketDatesBody, /throw new Error\('Invalid closing date'\)/)
})

test('updateTicketDates: rejects a closing date earlier than the creation date', () => {
  assert.match(updateTicketDatesBody, /closed\.getTime\(\) < effectiveCreatedAt\.getTime\(\)/)
  assert.match(updateTicketDatesBody, /Closing date cannot be earlier than the creation date/)
})

test('updateTicketDates: allows clearing the closing date back to null (reopening via date edit)', () => {
  assert.match(updateTicketDatesBody, /dates\.closedAt === null \|\| dates\.closedAt === ''/)
})

// ─── Persistence + refresh (changes must actually stick and be re-readable) ─

test('updateTicketDates: persists via a real DB update and invalidates the ticket detail cache', () => {
  assert.match(updateTicketDatesBody, /await db\.update\(ticket\)\.set\(patch\)/)
  assert.match(updateTicketDatesBody, /revalidateTag\('ticket-by-id'/, 'must invalidate the cached getTicketById result so a refresh shows the new dates')
  assert.match(updateTicketDatesBody, /revalidatePath\(`\/dashboard\/tickets\/\$\{ticketId\}`\)/)
})

test('updateTicketDates: logs the change to ticket history for auditability', () => {
  assert.match(updateTicketDatesBody, /action: 'dates_changed'/)
})

// ─── UI: uses the project's existing timezone utilities, no parallel impl ──

test('TicketDatesEditor reuses the existing lib/datetime.ts helpers (fmtTz/formatForDateTimeInput/zonedInputToUtcDate)', () => {
  assert.match(DATES_EDITOR_SRC, /from '@\/lib\/datetime'/)
  assert.match(DATES_EDITOR_SRC, /\bfmtTz\b/)
  assert.match(DATES_EDITOR_SRC, /\bformatForDateTimeInput\b/)
  assert.match(DATES_EDITOR_SRC, /\bzonedInputToUtcDate\b/)
})

test('TicketDatesEditor client-side validates closing >= creation before calling the server action (fail fast, matches server rule)', () => {
  assert.match(DATES_EDITOR_SRC, /closed\.getTime\(\) < created\.getTime\(\)/)
})

// ─── UI gating: admin-only editor, but the real gate is the server action ──

test('Ticket detail page only renders TicketDatesEditor for admin (defense in depth, not the sole gate)', () => {
  const idx = DETAIL_PAGE_SRC.indexOf('<TicketDatesEditor')
  assert.ok(idx >= 0, 'TicketDatesEditor must be rendered on the ticket detail page')
  const before = DETAIL_PAGE_SRC.slice(Math.max(0, idx - 200), idx)
  assert.match(before, /user\.role === 'admin'/)
})

// ─── Completed ticket opening error — root cause + fix ─────────────────────

test('BUG DEMONSTRATION: calling .toISOString() directly on a cached (string) date throws', () => {
  // This is exactly what unstable_cache returns on a cache hit: Date fields
  // round-trip through JSON and arrive as ISO strings, not Date instances.
  const cachedClosedAt: unknown = '2026-04-02T14:00:00.000Z'
  assert.throws(() => (cachedClosedAt as Date).toISOString(), TypeError)
})

test('FIX: wrapping in new Date(...) first works for both a Date instance and a cache-hit string', () => {
  const asDate = new Date('2026-04-02T14:00:00.000Z')
  const asString = '2026-04-02T14:00:00.000Z'
  assert.doesNotThrow(() => new Date(asDate).toISOString())
  assert.doesNotThrow(() => new Date(asString).toISOString())
  assert.equal(new Date(asDate).toISOString(), new Date(asString).toISOString())
})

test('regression: ticket detail page never calls .toISOString() on ticket.createdAt/closedAt without wrapping in new Date() first', () => {
  const offenders = [...DETAIL_PAGE_SRC.matchAll(/ticket\.(createdAt|closedAt)\.toISOString\(\)/g)]
  assert.deepEqual(offenders.map(m => m[0]), [], 'a bare ticket.createdAt/closedAt.toISOString() call crashes on a cache hit (string, not Date)')
  assert.match(DETAIL_PAGE_SRC, /createdAt=\{new Date\(ticket\.createdAt\)\.toISOString\(\)\}/)
  assert.match(DETAIL_PAGE_SRC, /closedAt=\{ticket\.closedAt \? new Date\(ticket\.closedAt\)\.toISOString\(\) : null\}/)
})

test('regression: closedAt is only ever passed through the null-safe ternary (closed tickets are the ones with a non-null closedAt)', () => {
  // ticket.closedAt is null for every non-closed status — the ternary guard
  // is what makes closed tickets specifically exercise the .toISOString() path.
  assert.match(DETAIL_PAGE_SRC, /ticket\.closedAt \? new Date\(ticket\.closedAt\)\.toISOString\(\) : null/)
})

test('ticket detail page catches load errors without swallowing unrelated ones (only known not-found/access errors are hidden)', () => {
  const catchIdx = DETAIL_PAGE_SRC.lastIndexOf('} catch (error) {')
  assert.ok(catchIdx > 0)
  const body = DETAIL_PAGE_SRC.slice(catchIdx)
  assert.match(body, /if \(message === 'Ticket not found' \|\| message === 'Access denied'\) notFound\(\)/)
  assert.match(body, /throw error/, 'any other error (e.g. a real rendering bug) must still surface, never be silently hidden')
})
