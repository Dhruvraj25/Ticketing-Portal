// Assign Resource — only after the client approves the estimate, never twice.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canAssignResource, isReadyForResourceAssignment } from '../lib/ticket-assignment.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const UPDATE = read('app/actions/tickets/update.ts')
const CARD = read('components/dashboard/ticket-card.tsx')
const PANEL = read('components/dashboard/assignment-panel.tsx')

const STATUSES = ['new', 'manager_review', 'estimate_pending', 'estimate_approved', 'assigned', 'in_progress', 'resolved', 'client_review', 'closed', 'rework', 'request_for_revision']

test('Assign Resource is offered only for estimate_approved tickets that are not yet assigned', () => {
  for (const status of STATUSES) {
    assert.equal(isReadyForResourceAssignment({ status, assignedToId: null }), status === 'estimate_approved', status)
  }
  assert.equal(isReadyForResourceAssignment({ status: 'estimate_approved', assignedToId: 'dev-1' }), false, 'already assigned')
})

test('server rule: standard assign after approval; Assign Directly only from NEW; never over an assignee', () => {
  assert.equal(canAssignResource({ status: 'estimate_approved', assignedToId: null }, false), true)
  assert.equal(canAssignResource({ status: 'estimate_pending', assignedToId: null }, false), false, 'client has not approved yet')
  assert.equal(canAssignResource({ status: 'new', assignedToId: null }, false), false)
  assert.equal(canAssignResource({ status: 'new', assignedToId: null }, true), true, 'Assign Directly (skip estimate)')
  assert.equal(canAssignResource({ status: 'estimate_approved', assignedToId: null }, true), false)
  assert.equal(canAssignResource({ status: 'estimate_approved', assignedToId: 'dev-1' }, false), false, 'duplicate assignment')
  assert.equal(canAssignResource({ status: 'new', assignedToId: 'dev-1' }, true), false)
})

test('assignTicket validates status + existing assignee BEFORE writing, keeping the manager/admin role check', () => {
  const fn = UPDATE.slice(UPDATE.indexOf('export const assignTicket'), UPDATE.indexOf('await db.insert(ticketHistory)', UPDATE.indexOf('export const assignTicket')))
  assert.match(fn, /currentUser\.role !== 'project_manager' && currentUser\.role !== 'admin'/)
  const alreadyIdx = fn.indexOf('if (t.assignedToId) {')
  const ruleIdx = fn.indexOf('if (!canAssignResource(t, skipEstimateWorkflow)) {')
  const writeIdx = fn.indexOf('await db.update(ticket)')
  assert.ok(alreadyIdx !== -1 && ruleIdx !== -1 && writeIdx > ruleIdx && writeIdx > alreadyIdx)
})

test('assignTicket update is atomic: only applies while still unassigned and in the expected status', () => {
  const fn = UPDATE.slice(UPDATE.indexOf('export const assignTicket'))
  assert.match(fn, /isNull\(ticket\.assignedToId\)/)
  assert.match(fn, /eq\(ticket\.status, skipEstimateWorkflow \? DIRECT_ASSIGNABLE_STATUS : ASSIGNABLE_STATUS\)/)
  assert.match(fn, /if \(updated\.length === 0\) \{/)
})

test('Tickets page card and Assignments page only show assign controls when assignment is allowed', () => {
  assert.match(CARD, /const showQuickAssign = .*isReadyForResourceAssignment\(ticket\)/)
  assert.match(PANEL, /\{!isReadyForResourceAssignment\(ticket\) \? \(/)
})
