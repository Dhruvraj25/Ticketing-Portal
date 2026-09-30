// Projects page: completion from real ticket statuses; Team Size hidden for clients.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectCompletionPercent, projectTicketSummary } from '../lib/project-progress.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const PAGE = read('app/dashboard/projects/projects-page-client.tsx')
const QUERIES = read('app/actions/projects/queries.ts')
const REPORT = read('app/actions/reports/project-reports.ts')

test('completion = closed / total tickets (live examples: 3 of 4 → 75%, 1 of 2 → 50%)', () => {
  assert.equal(projectCompletionPercent({ status: 'active', ticketCount: 4, closedTicketCount: 3 }), 75)
  assert.equal(projectCompletionPercent({ status: 'active', ticketCount: 2, closedTicketCount: 1 }), 50)
  assert.equal(projectCompletionPercent({ status: 'active', ticketCount: 4, closedTicketCount: 4 }), 100, 'no longer capped at 95%')
  assert.equal(projectCompletionPercent({ status: 'active', ticketCount: 5, closedTicketCount: 0 }), 0, 'open tickets are not progress')
  assert.equal(projectCompletionPercent({ status: 'active', ticketCount: 0, closedTicketCount: 0 }), 0)
})

test('completed/archived projects stay at 100% (existing rule kept)', () => {
  assert.equal(projectCompletionPercent({ status: 'completed', ticketCount: 4, closedTicketCount: 1 }), 100)
  assert.equal(projectCompletionPercent({ status: 'archived', ticketCount: 0 }), 100)
})

test('open vs completed split uses real counts (was a fixed 40/60 guess)', () => {
  assert.deepEqual(projectTicketSummary({ status: 'active', ticketCount: 4, closedTicketCount: 3 }), { open: 1, resolved: 3, openPct: 25, resolvedPct: 75 })
  assert.deepEqual(projectTicketSummary({ status: 'active', ticketCount: 0 }), { open: 0, resolved: 0, openPct: 0, resolvedPct: 100 })
  assert.equal(projectTicketSummary({ status: 'active', ticketCount: 2, closedTicketCount: 9 }).resolved, 2, 'never more than total')
})

test('same rule as the Project Progress report, fed by a real closed-ticket count', () => {
  assert.match(REPORT, /progressPct: stats\.total > 0 \? Math\.round\(\(stats\.closed \/ stats\.total\) \* 100\) : 0/)
  assert.match(REPORT, /if \(row\.status === TicketStatus\.CLOSED\) entry\.closed \+= cnt/)
  assert.match(QUERIES, /closedTicketCount: sql<number>`\(SELECT COUNT\(\*\)::int FROM \$\{ticket\} WHERE \$\{ticket\.projectId\} = \$\{project\.id\} AND \$\{ticket\.status\} = 'closed'\)`/)
  assert.doesNotMatch(PAGE, /Math\.round\(\(total \/ Math\.max\(total \+ 5|Math\.round\(total \* 0\.4\)/, 'old count-only formulas removed')
  assert.match(PAGE, /return projectCompletionPercent\(project\)/)
})

test('Team Size column is not shown to clients (header and cell), other roles unchanged', () => {
  assert.match(PAGE, /\{user\.role !== 'client' && \(\s*\n\s*<TableHead[^>]*>Team Size<\/TableHead>/)
  // The (always "—") Team Size cell carries the same guard, so columns stay aligned.
  assert.match(PAGE, /\{user\.role !== 'client' && \(\s*\n\s*<TableCell className="text-center">\s*\n\s*<span className="text-sm font-medium text-foreground">—<\/span>/)
})
