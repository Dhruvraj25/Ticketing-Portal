// Customer Feedback page filters: state → request → one shared server scope.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  activeFeedbackFilterCount, buildCustomerFeedbackFilters, EMPTY_FEEDBACK_FILTER_STATE as EMPTY,
} from '../lib/customer-feedback-filters.ts'

const ROOT = join(import.meta.dirname, '..')
const REPORT = readFileSync(join(ROOT, 'app/actions/reports/customer-review-reports.ts'), 'utf8')
const PAGE = readFileSync(join(ROOT, 'app/dashboard/reports/customer-reviews/page.tsx'), 'utf8')
const FORM = readFileSync(join(ROOT, 'app/actions/reports/queries.ts'), 'utf8')

test('"All …" selections are never sent as a literal __all__ filter', () => {
  const f = buildCustomerFeedbackFilters({ ...EMPTY, clientId: '__all__', projectId: '__all__', moduleId: '__all__', developerId: '__all__', managerId: '__all__' })
  assert.deepEqual(f, { reportType: 'customer_review', page: 1, pageSize: 25 })
  assert.equal(activeFeedbackFilterCount({ ...EMPTY, clientId: '__all__', developerId: '__all__' }), 0)
})

test('every selected filter is sent, combined, with correct types', () => {
  const f = buildCustomerFeedbackFilters({
    dateFrom: '2026-09-01', dateTo: '2026-09-30', clientId: 'c1', projectId: '64', moduleId: '7',
    developerId: 'd1', managerId: 'm1', reviewStatus: 'reviewed', starRating: '5', ticketNumber: ' 1995 ',
  }, 3, 50)
  assert.deepEqual(f, {
    reportType: 'customer_review', page: 3, pageSize: 50, dateFrom: '2026-09-01', dateTo: '2026-09-30',
    clientId: 'c1', projectId: 64, moduleId: 7, developerId: 'd1', managerId: 'm1',
    reviewStatus: 'reviewed', starRating: '5', ticketNumber: '1995',
  })
  assert.equal(activeFeedbackFilterCount({ ...EMPTY, projectId: '64', starRating: '5', reviewStatus: 'all' }), 2)
})

test('invalid values are dropped rather than sent', () => {
  const f = buildCustomerFeedbackFilters({ ...EMPTY, projectId: 'abc', moduleId: '0', reviewStatus: 'all', starRating: '9' })
  assert.deepEqual(f, { reportType: 'customer_review', page: 1, pageSize: 25 })
})

test('server: one filter scope covers every condition, on the ticket\'s own fields', () => {
  const fn = REPORT.slice(REPORT.indexOf('function buildConditions'), REPORT.indexOf('export const getCustomerReviewReport'))
  for (const cond of [
    'gte(ticket.closedAt', 'lte(ticket.closedAt', 'eq(ticket.projectId', 'eq(ticket.clientId', 'eq(ticket.assignedToId',
    'eq(ticket.moduleId', '"managerId" =', 'ilike(ticket.ticketNumber', 'isNotNull(ticketReview.id)', 'isNull(ticketReview.id)',
    'eq(ticketReview.overallRating',
  ]) assert.ok(fn.includes(cond), `missing ${cond}`)
  assert.match(fn, /const reviewWhere = and\(\.\.\.conditions, isNotNull\(ticketReview\.id\)\)/)
  assert.doesNotMatch(fn, /ticketReview\.createdAt|ticketReview\.projectId|ticketReview\.clientId/, 'no review-only copies of ticket filters')
})

test('server: every review aggregate joins the ticket so ticket filters apply to ratings too', () => {
  const body = REPORT.slice(REPORT.indexOf('export const getCustomerReviewReport'), REPORT.indexOf('export const getCustomerReviewDetail'))
  const fromReview = body.match(/\.from\(ticketReview\)/g)!.length
  const joined = body.match(/\.from\(ticketReview\)(\.|\s*\r?\n\s*\.)innerJoin\(ticket,/g)!.length
  assert.equal(joined, fromReview)
  assert.doesNotMatch(body, /pendingConditions/)
  assert.match(body, /\.where\(and\(ticketWhere, isNull\(ticketReview\.id\)\)\)/)
  assert.match(body, /lowRatedTickets: lowRatedTickets\.map/)
  assert.match(body, /pendingReviewTickets: pendingReviewTickets\.map/)
})

test('page: filters built by the shared helper; paging re-queries with the applied filters', () => {
  assert.match(PAGE, /getReportData\(buildCustomerFeedbackFilters\(state, targetPage, targetPageSize\)/)
  assert.match(PAGE, /onClick=\{\(\) => goToPage\(p\)\}/)
  assert.match(PAGE, /onChange=\{e => goToPage\(1, Number\(e\.target\.value\)\)\}/)
  assert.doesNotMatch(PAGE, /setPage\(p =>/)
  assert.match(PAGE, /const lowRatedData: any\[\] = \(report\?\.extras as any\)\?\.lowRatedTickets/)
  assert.match(PAGE, /const pendingData: any\[\] = \(report\?\.extras as any\)\?\.pendingReviewTickets/)
})

test('module filter offers real modules (ids match ticket.moduleId), not projects', () => {
  assert.match(PAGE, /\(formData\.modules \|\| \[\]\)\.filter\(m => [\s\S]*?\)\.map\(m => \(<SelectItem key=\{m\.id\} value=\{String\(m\.id\)\}>\{m\.moduleName\}/)
  assert.match(FORM, /return \{ projects, developers, clients, managers, modules \}/)
})
