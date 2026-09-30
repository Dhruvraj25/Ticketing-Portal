// Company-wise overall ticket rating (Customer Feedback report).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aggregateCompanyRatings, UNASSIGNED_COMPANY_KEY, UNASSIGNED_COMPANY_NAME } from '../lib/company-ratings.ts'

const ROOT = join(import.meta.dirname, '..')
const REPORT = readFileSync(join(ROOT, 'app/actions/reports/customer-review-reports.ts'), 'utf8')
const PAGE = readFileSync(join(ROOT, 'app/dashboard/reports/customer-reviews/page.tsx'), 'utf8')
const TYPES = readFileSync(join(ROOT, 'app/actions/reports/types.ts'), 'utf8')

const users = [
  { id: 'param', role: 'client', companyName: 'The Mevrick Technologies', companyCode: 'MEV', userType: 'standard' },
  { id: 'paramveer', role: 'client', companyName: 'The Mevrick Technologies', companyCode: 'MEV', userType: 'approver' },
  { id: 'hiral', role: 'client', companyName: 'Nirka Business', companyCode: null },
  { id: 'nocompany', role: 'client', companyName: null },
  { id: 'dev', role: 'developer', companyName: 'Should Not Count' },
]

test('ratings are grouped by the company of the ticket raiser and averaged over all its reviews', () => {
  const [mev] = aggregateCompanyRatings(users, [
    { raiserId: 'param', projectOwnerId: 'paramveer', reviews: 2, ratingSum: 9, fiveStar: 1, fourStar: 1 },
    { raiserId: 'paramveer', projectOwnerId: 'paramveer', reviews: 1, ratingSum: 3, threeStar: 1 },
  ])
  assert.equal(mev.companyName, 'The Mevrick Technologies')
  assert.equal(mev.companyCode, 'MEV')
  assert.equal(mev.reviews, 3)
  assert.equal(mev.averageRating, 4, '(5 + 4 + 3) / 3 — same as AVG(overall_rating)')
  assert.deepEqual([mev.fiveStarCount, mev.fourStarCount, mev.threeStarCount], [1, 1, 1])
})

test('mean is weighted per review, not an average of group averages', () => {
  const [c] = aggregateCompanyRatings(users, [
    { raiserId: 'param', projectOwnerId: null, reviews: 3, ratingSum: 15 },
    { raiserId: 'paramveer', projectOwnerId: null, reviews: 1, ratingSum: 1 },
  ])
  assert.equal(c.averageRating, 4) // 16 / 4, not (5 + 1) / 2
})

test('raiser without a company falls back to the project owner\'s company, else "No company assigned"', () => {
  const rows = aggregateCompanyRatings(users, [
    { raiserId: 'nocompany', projectOwnerId: 'hiral', reviews: 1, ratingSum: 5 },
    { raiserId: 'nocompany', projectOwnerId: null, reviews: 1, ratingSum: 2 },
    { raiserId: 'dev', projectOwnerId: 'dev', reviews: 1, ratingSum: 4 },
  ])
  assert.equal(rows[0].companyName, 'Nirka Business')
  const none = rows.find(r => r.key === UNASSIGNED_COMPANY_KEY)!
  assert.equal(none.companyName, UNASSIGNED_COMPANY_NAME)
  assert.equal(none.reviews, 2, 'non-client users never define a company')
  assert.equal(rows.at(-1)!.key, UNASSIGNED_COMPANY_KEY, 'unassigned is listed last')
})

test('closed tickets and response rate; companies without feedback show no average', () => {
  const rows = aggregateCompanyRatings(users, [
    { raiserId: 'param', projectOwnerId: null, closedTickets: 4, reviewedTickets: 1 },
    { raiserId: 'param', projectOwnerId: null, reviews: 1, ratingSum: 5, lastReviewAt: '2026-09-01T00:00:00.000Z' },
    { raiserId: 'hiral', projectOwnerId: null, closedTickets: 2, reviewedTickets: 0 },
  ])
  assert.equal(rows[0].companyName, 'The Mevrick Technologies')
  assert.equal(rows[0].responseRate, 25)
  assert.equal(rows[0].lastReviewAt, '2026-09-01T00:00:00.000Z')
  assert.equal(rows[1].companyName, 'Nirka Business')
  assert.equal(rows[1].averageRating, null)
  assert.equal(rows[1].responseRate, 0)
})

test('report uses the existing overall_rating data and exposes company ratings + chart', () => {
  assert.match(REPORT, /SUM\(\$\{ticketReview\.overallRating\}\)/)
  assert.match(REPORT, /\.groupBy\(ticket\.clientId, project\.clientId\)/)
  assert.match(REPORT, /aggregateCompanyRatings\(companyUsers, \[\.\.\.closedByRaiser, \.\.\.reviewsByRaiser\]\)/)
  assert.match(REPORT, /title: 'Average Rating by Company'/)
  assert.match(REPORT, /extras: \{[\s\S]*?\bcompanyRatings,[\s\S]*?pagination:/)
  assert.match(PAGE, /Company Ratings<\/h3>/)
})

test('company ratings stay management-only (customer_review is not a client or developer report)', () => {
  const clientList = TYPES.slice(TYPES.indexOf('const clientReports'), TYPES.indexOf('const walletReports'))
  const devList = TYPES.slice(TYPES.indexOf('const devReports'), TYPES.indexOf('const clientReports'))
  assert.doesNotMatch(clientList, /customer_review/)
  assert.doesNotMatch(devList, /customer_review/)
})
