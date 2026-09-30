// Tickets page KPIs — one card per real status, exact counts, hidden at zero.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const TOP_BAR = read('components/dashboard/ticket-top-bar.tsx')
const PAGE = read('app/dashboard/tickets/page.tsx')
const QUERIES = read('app/actions/tickets/queries.ts')

test('counts are exact per status from the database (GROUP BY status, same role scope)', () => {
  const impl = QUERIES.slice(QUERIES.indexOf('async function _getConsolidatedDashboardDataImpl'), QUERIES.indexOf('const CONSOLIDATED_CACHE_TTL'))
  assert.match(impl, /\.groupBy\(ticket\.status\)/)
  assert.match(impl, /\.where\(baseFilter\)\s*\n\s*\.groupBy\(ticket\.status\)/, 'per-status counts use the same role-scoped filter')
  assert.match(impl, /statusCounts,/)
})

test('no derived/lumped "closed" bucket (total − open − inProgress − resolved)', () => {
  assert.doesNotMatch(PAGE, /totalTickets - openCount - inProgressCount - resolvedCount/)
  assert.match(PAGE, /const \{ statusCounts, totalTickets \} = dashboardData/)
})

test('one KPI per status from the single TICKET_STATUS_CONFIG definition, shown only when count > 0', () => {
  // The rule lives in lib/ticket-status-kpis.ts, shared with the Dashboard.
  const HELPER = readFileSync(join(import.meta.dirname, '..', 'lib', 'ticket-status-kpis.ts'), 'utf8')
  assert.match(HELPER, /Object\.keys\(TICKET_STATUS_CONFIG\)/)
  assert.match(HELPER, /label: TICKET_STATUS_CONFIG\[status\]\.label,\s*count: Number\(statusCounts\?\.\[status\]\) \|\| 0/)
  assert.match(HELPER, /\.filter\(\(k\) => k\.count > 0\)/)
  assert.match(TOP_BAR, /useMemo\(\(\) => buildStatusKpis\(stats\.statusCounts\), \[stats\.statusCounts\]\)/)
  assert.match(TOP_BAR, /\{statusKpis\.map\(\(k\) => \(\s*<StatCard key=\{k\.status\} title=\{k\.label\} value=\{k\.count\} iconName=\{k\.icon\} colorTheme=\{k\.color\} \/>/)
  // Old hard-coded lumped cards are gone.
  assert.doesNotMatch(TOP_BAR, /title="Open" value=\{stats\.openCount\}|title="Closed" value=\{stats\.closedCount\}/)
})

test('status pills show the exact count of the single status they filter by', () => {
  for (const s of ['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) {
    assert.match(TOP_BAR, new RegExp(`value: TicketStatus\\.${s}, label: '[^']+', count: stats\\.statusCounts\\[TicketStatus\\.${s}\\] \\?\\? 0`))
  }
})

test('KPI row grows with the number of cards instead of clipping them', () => {
  assert.match(TOP_BAR, /style=\{\{ height: showKpis \? 'auto' : 8 \}\}/)
})

test('compact gap between KPI cards and the filter container (no fixed height reserve)', () => {
  assert.doesNotMatch(TOP_BAR, /minHeight: showKpis \? 184/)
  // Gap = the KPI row's pb-3 (12px) — same spacing as between the KPI cards (gap-3).
  assert.match(TOP_BAR, /<div className="pt-4 pb-3">\s*\n\s*<div data-tour="ticket-kpis" className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-3">/)
  assert.match(TOP_BAR, /<div className="px-4 lg:px-6 pb-4">/, 'filter container has no extra top spacing')
})
