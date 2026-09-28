// Estimate approval — Client Approver scope regression suite.
//
// An organization's Approver must be able to approve / decline estimates and
// additional hours on tickets raised by the Standard client users of the SAME
// project (not only their own tickets), while Standard clients stay denied and
// an approver can never act on another project's tickets.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const ESTIMATES_SRC = readFileSync(join(ROOT, 'app/actions/estimates.ts'), 'utf8')
const SECTION_SRC = readFileSync(join(ROOT, 'components/dashboard/estimate-section.tsx'), 'utf8')

const APPROVER_ACTIONS = [
  'approveEstimate',
  'rejectEstimate',
  'requestEstimateClarification',
  'approveAdditionalHours',
  'declineAdditionalHours',
]

function actionBody(name: string): string {
  const start = ESTIMATES_SRC.indexOf(`export const ${name} = wrapServerAction(`)
  assert.notEqual(start, -1, `${name} must exist`)
  const next = ESTIMATES_SRC.indexOf('export const ', start + 1)
  return ESTIMATES_SRC.slice(start, next === -1 ? undefined : next)
}

for (const name of APPROVER_ACTIONS) {
  test(`${name}: still requires role 'client' AND userType 'approver' (Standard clients stay denied)`, () => {
    const body = actionBody(name)
    assert.match(body, /currentUser\.role !== 'client'/)
    assert.match(body, /currentUser\.userType !== 'approver'/)
  })

  test(`${name}: ticket access uses the project-scoped approver check, not owner-only`, () => {
    const body = actionBody(name)
    assert.match(body, /if \(!\(await approverCanActOnTicket\(currentUser\.id, t\)\)\) throw new Error\('Access denied'\)/)
    assert.doesNotMatch(body, /t\.clientId !== currentUser\.id/)
  })
}

test('approverCanActOnTicket requires BOTH the approver and the ticket client to be clients of the ticket\'s own project', () => {
  const start = ESTIMATES_SRC.indexOf('async function approverCanActOnTicket(')
  assert.notEqual(start, -1)
  const end = ESTIMATES_SRC.slice(start).search(/\r?\n\}\r?\n/)
  assert.notEqual(end, -1)
  const body = ESTIMATES_SRC.slice(start, start + end)
  assert.match(body, /if \(t\.clientId === approverId\) return true/)
  assert.match(body, /if \(!t\.clientId \|\| !t\.projectId\) return false/)
  assert.match(body, /eq\(project\.id, t\.projectId\)/)
  assert.match(body, /eq\(projectClient\.projectId, t\.projectId\)/)
  assert.match(body, /projectClientIds\.has\(approverId\) && projectClientIds\.has\(t\.clientId\)/)
})

test('EstimateSection shows approval controls only to Approver clients (mirrors the server rule)', () => {
  assert.match(SECTION_SRC, /const isClientApprover = isClient && userType === 'approver'/)
  assert.match(SECTION_SRC, /\{isEstimatePending && isClientApprover && \(/)
  assert.match(SECTION_SRC, /\{additionalHoursRequested && !additionalHoursApproved && isClientApprover && \(/)
  assert.match(SECTION_SRC, /\{isEstimatePending && isClient && !isClientApprover && \(/)
})
