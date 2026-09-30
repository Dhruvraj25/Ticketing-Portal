// Billable vs Non-Billable: ONE rule, read from the ticket everywhere —
// tickets, time tracking, worklogs, reports, KPIs.
//   estimate workflow followed                          → Billable
//   estimate skipped ("Assign Directly")                → Non-Billable
//   historical ticket that consumed Support Wallet hours → Billable
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BILLING_LABEL, billingTypeOf, isBillableTicket, isHistoricalWalletTicket } from '../lib/billing.ts'

const ROOT = join(import.meta.dirname, '..')
const BACKEND = join(ROOT, '..', 'Backend', 'src')
const read = (p: string) => readFileSync(p, 'utf8')
const fe = (p: string) => read(join(ROOT, p))

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (!['node_modules', 'migrations', '.next'].includes(name)) walk(p, out) }
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

// Live tickets (read-only query): the historical ticket and an "Assign Directly" one.
const HISTORICAL = { estimateWorkflowSkipped: true, assignedToId: null, consumedHours: 20 }   // TKT-MU29WHB3-ZPJE
const ASSIGN_DIRECTLY = { estimateWorkflowSkipped: true, assignedToId: 'dev-hem', consumedHours: null } // TKT-MUKWLHNF-YNCE

test('1. current ticket on the estimate workflow → Billable', () => {
  assert.equal(billingTypeOf({ estimateWorkflowSkipped: false, assignedToId: 'dev', consumedHours: 492 }), 'billable')
  assert.equal(billingTypeOf({ estimateWorkflowSkipped: false }), 'billable')
  assert.equal(BILLING_LABEL.billable, 'Billable')
})

test('2. current ticket that skipped the estimate ("Assign Directly") → Non-Billable', () => {
  assert.equal(billingTypeOf(ASSIGN_DIRECTLY), 'non_billable')
  // Even if it later consumed hours, an assigned (non-historical) ticket keeps its classification.
  assert.equal(billingTypeOf({ ...ASSIGN_DIRECTLY, consumedHours: 3 }), 'non_billable')
})

test('3. historical ticket that consumed Support Wallet hours → Billable', () => {
  assert.equal(isHistoricalWalletTicket(HISTORICAL), true)
  assert.equal(billingTypeOf(HISTORICAL), 'billable')
})

test('4. a skipped-estimate ticket is Billable ONLY when the data confirms wallet consumption', () => {
  assert.equal(billingTypeOf({ estimateWorkflowSkipped: true, assignedToId: null, consumedHours: 0 }), 'non_billable')
  assert.equal(billingTypeOf({ estimateWorkflowSkipped: true, assignedToId: null, consumedHours: null }), 'non_billable')
  assert.equal(billingTypeOf({ estimateWorkflowSkipped: true, assignedToId: null }), 'non_billable')
  assert.equal(isBillableTicket({ estimateWorkflowSkipped: true, assignedToId: null, consumedHours: 0.5 }), true)
})

test('historical creation writes exactly the facts the rule reads (flag + wallet hours, no assignee)', () => {
  const hist = fe('lib/historical-ticket.ts')
  assert.match(hist, /consumedHours: input\.supportHoursConsumed,/)
  assert.match(hist, /estimateWorkflowSkipped: true,/)
  const create = fe('app/actions/tickets/create.ts')
  assert.match(create, /\.values\(\{ \.\.\.baseValues, \.\.\.plan\.fields \}\)/, 'historical insert = base values + derived fields')
  assert.doesNotMatch(create.slice(create.indexOf('const baseValues = {'), create.indexOf('let newTicket')), /assignedToId/, 'no assignee on historical tickets')
  assert.match(create, /transactionType: 'Deduct Hours',\s*\n\s*hours: plan\.fields\.consumedHours,/, 'same transaction deducts the wallet')
  // "Assign Directly" sets the assignee and the flag in ONE update.
  assert.match(fe('app/actions/tickets/update.ts'), /assignedToId: developerId, assignedById: currentUser\.id,[\s\S]{0,300}\.\.\.\(skipEstimateWorkflow \? \{ estimateWorkflowSkipped: true \} : \{\}\)/)
})

test('SQL expression = the TypeScript rule (single rule, read from the ticket)', () => {
  const sqlSrc = fe('lib/billing-sql.ts')
  // The rule is written ONCE (billableRule) and used for both tickets and time entries.
  assert.match(sqlSrc, /return sql<boolean>`\(\(NOT \$\{cols\.skipped\}\) OR \(\$\{cols\.assignee\} IS NULL AND COALESCE\(\$\{cols\.consumed\}, 0\) > 0\)\)`/)
  assert.equal((sqlSrc.match(/IS NULL AND COALESCE/g) || []).length, 1, 'no second copy of the rule')
  assert.match(sqlSrc, /export const ticketIsBillable = billableRule\(\{\s*\n\s*skipped: sql`\$\{ticket\.estimateWorkflowSkipped\}`,\s*\n\s*assignee: sql`\$\{ticket\.assignedToId\}`,\s*\n\s*consumed: sql`\$\{ticket\.consumedHours\}`,/)
  assert.match(sqlSrc, /skipped: sql\.raw\('bt\."estimateWorkflowSkipped"'\),\s*\n\s*assignee: sql\.raw\('bt\."assignedToId"'\),\s*\n\s*consumed: sql\.raw\('bt\."consumedHours"'\),/)
  assert.match(sqlSrc, /FROM "ticket" bt WHERE bt\.id = \$\{timeLog\.ticketId\}\),\s*\n\s*\$\{timeLog\.isBillable\}\s*\n\)`/, 'stored copy only as the fallback for a deleted ticket')
})

test('5–6. Billable Hours includes / Non-Billable Hours excludes historical-ticket time (both use the shared expression)', () => {
  const reports = fe('app/actions/reports/developer-reports.ts')
  assert.match(reports, /const conditions: any\[\] = \[timeLogIsBillable, gte\(/)
  assert.match(reports, /const conditions: any\[\] = \[sql`NOT \$\{timeLogIsBillable\}`, gte\(/)
  assert.match(reports, /isBillable: timeLogIsBillable,/)
})

test('no Frontend report / worklog / KPI / time-log read uses the stored copy directly', () => {
  const offenders = walk(join(ROOT, 'app')).concat(walk(join(ROOT, 'components')), walk(join(ROOT, 'lib')))
    .filter((f) => !f.endsWith('billing-sql.ts') && !f.includes(join('lib', 'db')))
    .filter((f) => /\$\{timeLog\.isBillable\} = true|eq\(timeLog\.isBillable,|isBillable: timeLog\.isBillable/.test(read(f)))
  assert.deepEqual(offenders, [])
  assert.match(fe('app/actions/tickets/history.ts'), /billableMinutes: billableMinutesSql/)
  assert.match(fe('app/dashboard/worklogs/page.tsx'), /isBillable: timeLogIsBillable,/)
})

test('time entries are stamped by the same rule on start and resume (existing records never rewritten)', () => {
  const t = fe('app/actions/tickets/timelogs.ts')
  assert.match(t, /const isBillable = isBillableTicket\(estimateRow\)/)
  assert.match(t, /isBillable: isBillableTicket\(ticketRow\),/)
  assert.doesNotMatch(t, /isBillable: log\.isBillable|update\(timeLog\)\.set\(\{[^}]*isBillable/)
})

test('Ticket Detail shows the classification from the same rule', () => {
  const q = fe('app/actions/tickets/queries.ts')
  assert.match(q, /estimateWorkflowSkipped: ticket\.estimateWorkflowSkipped,\s*\n\s*consumedHours: ticket\.consumedHours,/)
  const page = fe('app/dashboard/tickets/[id]/page.tsx')
  assert.match(page, /const billingType = billingTypeOf\(ticket\)/)
  assert.match(page, /\{statusBadge\}\{priorityBadge\}\{categoryBadge\}\{billingBadge\}/)
})

test('7. Frontend and Backend rules are identical', async () => {
  const be = await import(pathToFileURL(join(BACKEND, 'lib', 'billing-rule.ts')).href)
  const cases = [
    HISTORICAL, ASSIGN_DIRECTLY, { ...ASSIGN_DIRECTLY, consumedHours: 3 },
    { estimateWorkflowSkipped: false }, { estimateWorkflowSkipped: true, assignedToId: null, consumedHours: 0 },
    { estimateWorkflowSkipped: null, assignedToId: null, consumedHours: null },
  ]
  for (const c of cases) assert.equal(be.isBillableTicket(c), isBillableTicket(c), JSON.stringify(c))
  const beSrc = read(join(BACKEND, 'lib', 'billing.ts'))
  assert.match(beSrc, /SELECT \(NOT bt\."estimateWorkflowSkipped"\)\s*\n\s*OR \(bt\."assignedToId" IS NULL AND COALESCE\(bt\."consumedHours", 0\) > 0\)/)
  const service = read(join(BACKEND, 'services', 'ticket.service.ts'))
  assert.equal((service.match(/const isBillable = isBillableTicket\(await ticketRepo\.getBillingFacts\(ticketId\)\)/g) || []).length, 2)
  assert.doesNotMatch(service, /isBillable: true/)
  assert.doesNotMatch(read(join(BACKEND, 'controllers', 'reports', 'developer.reports.ts')), /eq\(timeLog\.isBillable,|isBillable: timeLog\.isBillable/)
})
