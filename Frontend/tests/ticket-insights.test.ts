// Tickets page → Insights: real counts, scoped server-side to the signed-in user.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const QUERIES = read('app/actions/tickets/queries.ts')
const PANEL = read('components/dashboard/ticket-right-panel.tsx')
const PAGE = read('app/dashboard/tickets/page.tsx')

const insightsFn = () => QUERIES.slice(QUERIES.indexOf('export const getTicketInsights'), QUERIES.indexOf('// Lightweight wrapper for pages that only need 4 basic stats'))

test('getTicketInsights takes NO parameters — the user comes only from the server session', () => {
  const fn = insightsFn()
  assert.match(fn, /async function getTicketInsights\(\): Promise<TicketInsights>/)
  assert.match(fn, /const \{ id: userId, role, userType \} = await getUser\(\)/)
  assert.match(fn, /const scope = await ticketStatsScope\(role, userId,/)
  assert.match(fn, /\.from\(ticket\)\s*\n\s*\.where\(scope\)/)
})

test('a developer\'s statistics scope is ONLY tickets assigned to them', () => {
  const scope = QUERIES.slice(QUERIES.indexOf('async function ticketStatsScope'), QUERIES.indexOf('/** Internal implementation: runs the FILTER query */'))
  assert.match(scope, /role === 'developer'\) \{\s*\n\s*conditions\.push\(eq\(ticket\.assignedToId, userId\)\)/)
})

test('KPIs and Insights share the same scope rule (cannot drift apart)', () => {
  const impl = QUERIES.slice(QUERIES.indexOf('async function _getConsolidatedDashboardDataImpl'))
  assert.match(impl, /const baseFilter = await ticketStatsScope\(role, userId, userType\)/)
})

test('Insights widget renders the real counts — no hard-coded numbers', () => {
  const insights = PANEL.slice(PANEL.indexOf('data-tour="tickets-insights"'))
  assert.doesNotMatch(insights, /5 tickets resolved today|2 tickets awaiting response|3 tickets in progress|Above average performance/)
  assert.match(insights, /\{ticketCount\(insights\?\.resolvedToday\)\} resolved today/)
  assert.match(insights, /\{ticketCount\(insights\?\.awaitingClient\)\} awaiting response/)
  assert.match(insights, /\{ticketCount\(insights\?\.inProgress\)\} in progress/)
})

test('Tickets page loads insights on the server and passes them to the panel', () => {
  assert.match(PAGE, /const insightsPromise = getTicketInsights\(\)/)
  assert.match(PAGE, /insights=\{insights\}/)
})
