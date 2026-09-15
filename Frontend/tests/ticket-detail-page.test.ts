import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Ticket Detail Page — date rendering + error-handling regression suite
// ============================================================================
// Ported out of tests/admin-ticket-dates.test.ts when the admin ticket-dates
// editor feature (TicketDatesEditor / updateTicketDates) was removed (Phase 3
// — Historical Ticket Creation). These three tests describe a real bug fix in
// the ticket detail page itself — unrelated to the removed editor — so they
// stay even though the editor is gone: the page still renders
// ticket.createdAt/closedAt (e.g. the "Details" panel's Created date) and
// still has the same load-error try/catch.
//
// The ticket detail page is a server component importing '@/lib/db' — not
// importable directly under node's native TS loader outside the Next.js
// bundler (same constraint documented in tests/report-access.test.ts). These
// tests read the real source instead of re-implementing the rendering logic.

const ROOT = join(import.meta.dirname, '..')
const DETAIL_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'tickets', '[id]', 'page.tsx'), 'utf8')

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
  // The page's "Details" panel still renders ticket.createdAt, wrapped in new Date(...).
  assert.match(DETAIL_PAGE_SRC, /new Date\(ticket\.createdAt\)/)
})

test('ticket detail page catches load errors without swallowing unrelated ones (only known not-found/access errors are hidden)', () => {
  const catchIdx = DETAIL_PAGE_SRC.lastIndexOf('} catch (error) {')
  assert.ok(catchIdx > 0)
  const body = DETAIL_PAGE_SRC.slice(catchIdx)
  assert.match(body, /if \(message === 'Ticket not found' \|\| message === 'Access denied'\) notFound\(\)/)
  assert.match(body, /throw error/, 'any other error (e.g. a real rendering bug) must still surface, never be silently hidden')
})

// ─── Removed feature: no dangling references ───────────────────────────────

test('the removed admin ticket-dates editor leaves no trace on the detail page', () => {
  assert.doesNotMatch(DETAIL_PAGE_SRC, /TicketDatesEditor/)
  assert.doesNotMatch(DETAIL_PAGE_SRC, /ticket-dates-editor/)
})
