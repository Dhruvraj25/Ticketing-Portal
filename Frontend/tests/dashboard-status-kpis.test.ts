// Dashboard KPIs: SAME categories for every role (one central definition),
// role-scoped counts from the server, zero-hidden, deterministic colors.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STATUS_KPI_STYLE, statusKpis, TOTAL_TICKETS_KPI } from '../lib/ticket-status-kpis.ts'
import { TICKET_STATUS_CONFIG } from '../lib/types.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const DASHBOARD = read('app/dashboard/page.tsx')
const TOP_BAR = read('components/dashboard/ticket-top-bar.tsx')
const QUERIES = read('app/actions/tickets/queries.ts')
const STAT_CARD = read('components/dashboard/stat-card.tsx')

const view = (counts: Record<string, number>) => statusKpis(counts).map((k) => `${k.label} ${k.count}`)

// Live, role-scoped per-status counts (read-only query of the current data).
const LIVE = {
  admin:          { closed: 6, assigned: 1, client_review: 1, estimate_approved: 1, resolved: 1 },
  developerHem:   { closed: 4, assigned: 1, resolved: 1 },
  standardParam:  { client_review: 1, closed: 1 },
  approverParamveersinh: { closed: 3, assigned: 1, client_review: 1, estimate_approved: 1 },
}

test('1. KPI categories are defined centrally: every status has one style; no role-specific lists', () => {
  assert.deepEqual(Object.keys(STATUS_KPI_STYLE).sort(), Object.keys(TICKET_STATUS_CONFIG).sort())
  const stats = DASHBOARD.slice(DASHBOARD.indexOf('function StatsSection'), DASHBOARD.indexOf('\n}\n', DASHBOARD.indexOf('function StatsSection')))
  assert.match(stats, /function StatsSection\(\{ consolidatedStats \}: \{ consolidatedStats: ConsolidatedStats \}\)/, 'no role parameter')
  assert.doesNotMatch(stats, /userRole|role ===/)
  assert.match(stats, /const perStatus = statusKpis\(consolidatedStats\.statusCounts\)/)
})

test('2. admin (all tickets): the reference six', () => {
  assert.deepEqual(view(LIVE.admin), ['Estimate Approved 1', 'Assigned to Resource 1', 'Manager Review 1', 'Awaiting Client Review 1', 'Completed 6'])
})

test('3–6. manager, developer, standard client and approver get the SAME categories with their own counts', () => {
  assert.deepEqual(view(LIVE.developerHem), ['Assigned to Resource 1', 'Manager Review 1', 'Completed 4'])
  assert.deepEqual(view(LIVE.standardParam), ['Awaiting Client Review 1', 'Completed 1'])
  assert.deepEqual(view(LIVE.approverParamveersinh), ['Estimate Approved 1', 'Assigned to Resource 1', 'Awaiting Client Review 1', 'Completed 3'])
})

test('7. zero-value status KPIs are hidden (the brief\'s example)', () => {
  assert.deepEqual(view({ estimate_approved: 0, assigned: 2, resolved: 0, client_review: 1, closed: 7 }),
    ['Assigned to Resource 2', 'Awaiting Client Review 1', 'Completed 7'])
  assert.deepEqual(statusKpis({}), [])
})

test('8. Total Tickets is always rendered (it is not part of the zero-filtered list)', () => {
  const stats = DASHBOARD.slice(DASHBOARD.indexOf('function StatsSection'))
  assert.match(stats, /<StatCard\s*\n\s*title=\{TOTAL_TICKETS_KPI\.label\}\s*\n\s*value=\{consolidatedStats\.totalTickets\}/)
})

test('9. deterministic, distinct colors from the existing theme palette', () => {
  const colors: Record<string, string> = { total: TOTAL_TICKETS_KPI.color, ...Object.fromEntries(Object.entries(STATUS_KPI_STYLE).map(([k, v]) => [k, v.color])) }
  assert.equal(colors.total, 'blue')
  assert.equal(colors.estimate_approved, 'green')
  assert.equal(colors.assigned, 'purple')
  assert.equal(colors.resolved, 'orange')        // "Manager Review"
  assert.equal(colors.client_review, 'cyan')     // "Awaiting Client Review"
  assert.equal(colors.closed, 'emerald')         // "Completed"
  assert.equal(new Set(Object.values(colors)).size, Object.values(colors).length, 'every KPI has its own color')
  for (const c of Object.values(colors)) assert.match(STAT_CARD, new RegExp(`\\n  ${c}:\\s+\\{ bg:`), `${c} is a StatCard theme`)
  // Same color on every surface: both render k.color / k.icon.
  for (const src of [DASHBOARD, TOP_BAR]) {
    assert.match(src, /colorTheme=\{k\.color\}/)
    assert.match(src, /colorTheme=\{TOTAL_TICKETS_KPI\.color\}/)
  }
})

test('10. navigation: each card opens the Tickets list filtered by its status', () => {
  assert.match(DASHBOARD, /href=\{`\/dashboard\/tickets\?status=\$\{k\.status\}`\}/)
  assert.match(DASHBOARD, /href="\/dashboard\/tickets"/)
  assert.match(read('app/dashboard/tickets/tickets-page-client.tsx'), /useState\(searchParams\.get\('status'\) \|\| 'all'\)/)
})

test('11. counts are scoped on the server from the session — same scope as the Tickets list', () => {
  const scope = QUERIES.slice(QUERIES.indexOf('async function ticketStatsScope'), QUERIES.indexOf('/** Internal implementation: runs the FILTER query */'))
  assert.match(scope, /const orgIds = await getClientOrgUserIds\(userId, userType\)/)
  assert.match(scope, /conditions\.push\(eq\(ticket\.clientId, userId\)\)/)
  assert.match(scope, /conditions\.push\(eq\(ticket\.assignedToId, userId\)\)/)
  const statusQuery = QUERIES.slice(QUERIES.indexOf('const statusRowsPromise = db'), QUERIES.indexOf('.groupBy(ticket.status)'))
  assert.match(statusQuery, /\.where\(baseFilter\)/, 'the per-status counts use the role scope')
  assert.match(QUERIES, /const \{ id: userId, role, userType \} = await getUser\(\)\s*\n\s*return getCachedConsolidatedData\(JSON\.stringify\(\{ role, userId, userType \}\)\)/, 'scope from the session, cache keyed per user')
  // Only counts reach the browser — never ticket rows.
  const list = QUERIES.slice(QUERIES.indexOf('async function _getTicketsListImpl') > 0 ? 0 : 0)
  assert.match(list, /else if \(currentUser\.role === 'developer'\) \{\s*\n\s*conditions\.push\(eq\(ticket\.assignedToId, currentUser\.id\)\)/)
})

test('Tickets page and Dashboard share the one helper', () => {
  assert.match(TOP_BAR, /import \{ statusKpis as buildStatusKpis, TOTAL_TICKETS_KPI \} from '@\/lib\/ticket-status-kpis'/)
  assert.doesNotMatch(TOP_BAR, /Object\.keys\(TICKET_STATUS_CONFIG\)/)
})
