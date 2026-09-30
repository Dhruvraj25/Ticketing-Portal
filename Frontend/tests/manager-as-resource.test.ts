// Managers as assignable resources: assign (incl. self) on projects they
// manage, then work the ticket with the existing developer workflow.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assignableResourcesFor, canBeAssignee, canWorkOnTicket, resourceLabel } from '../lib/ticket-assignment.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const UPDATE = read('app/actions/tickets/update.ts')
const TIMELOGS = read('app/actions/tickets/timelogs.ts')
const USERS = read('app/actions/users.ts')
const DETAIL = read('app/dashboard/tickets/[id]/page.tsx')

const dev = { id: 'dev', name: 'Hem', email: '', activeTickets: 2, role: 'developer' as const }
const mgrA = { id: 'mgr-a', name: 'Asha', email: '', activeTickets: 0, role: 'project_manager' as const, managedProjectIds: [64, 65] }
const mgrB = { id: 'mgr-b', name: 'Ravi', email: '', activeTickets: 0, role: 'project_manager' as const, managedProjectIds: [70] }

test('a manager is assignable only on tickets of projects they manage; developers everywhere', () => {
  assert.equal(canBeAssignee(dev, 64), true)
  assert.equal(canBeAssignee(mgrA, 64), true)
  assert.equal(canBeAssignee(mgrA, 70), false)
  assert.equal(canBeAssignee(mgrA, null), false, 'no project → no manager assignment')
  assert.equal(canBeAssignee({ role: 'client' }, 64), false)
  assert.equal(canBeAssignee({ role: 'admin' }, 64), false)
  assert.deepEqual(assignableResourcesFor([dev, mgrA, mgrB], 64).map((r) => r.id), ['dev', 'mgr-a'])
})

test('dropdown labels mark managers (and "me")', () => {
  assert.equal(resourceLabel(dev), 'Hem')
  assert.equal(resourceLabel(mgrA), 'Asha (Manager)')
  assert.equal(resourceLabel(mgrA, 'mgr-a'), 'Asha (Me — Manager)')
})

test('work actions: developers as before; a manager only on a ticket assigned to them', () => {
  assert.equal(canWorkOnTicket('developer', 'dev', 'someone'), true, 'unchanged developer behaviour')
  assert.equal(canWorkOnTicket('project_manager', 'mgr-a', 'mgr-a'), true)
  assert.equal(canWorkOnTicket('project_manager', 'mgr-a', 'dev'), false)
  assert.equal(canWorkOnTicket('project_manager', 'mgr-a', null), false)
  assert.equal(canWorkOnTicket('admin', 'x', 'x'), false)
  assert.equal(canWorkOnTicket('client', 'x', 'x'), false)
})

test('server: Assign AND Reassign validate the resource (never trust the browser)', () => {
  assert.match(UPDATE, /async function assertAssignableResource\(t: \{ projectId: number \| null \}, resourceId: string\)/)
  assert.match(UPDATE, /eq\(project\.id, t\.projectId\), eq\(project\.managerId, resourceId\)/)
  const assign = UPDATE.slice(UPDATE.indexOf('export const assignTicket'), UPDATE.indexOf('export const assignTicket') + 3000)
  assert.ok(assign.indexOf('await assertAssignableResource(t, developerId)') < assign.indexOf('await db.update(ticket)'), 'checked before the write')
  assert.match(UPDATE, /if \(!t\) throw new Error\('Ticket not found'\)\s*\n\s*await assertAssignableResource\(t, newDeveloperId\)/)
  // Assigning is still manager/admin only.
  assert.match(assign, /if \(currentUser\.role !== 'project_manager' && currentUser\.role !== 'admin'\) \{\s*\n\s*throw new Error\('Only project managers can assign tickets'\)/)
})

test('server: resource list = developers + managers of their projects, for managers/admins only', () => {
  const fn = USERS.slice(USERS.indexOf('async function _getAssignableResourcesData'))
  assert.match(fn, /\.\.\.developers\.map\(\(d\) => \(\{ \.\.\.d, role: 'developer' as const \}\)\)/)
  assert.match(fn, /managedProjectIds: byManager\.get\(m\.id\) \?\? \[\]/)
  assert.match(USERS, /if \(currentUser\.role !== 'project_manager' && currentUser\.role !== 'admin'\) return \[\]\s*\n\s*return getCachedAssignableResources\(\)/)
  assert.match(USERS, /export const getDevelopers = wrapServerAction/, 'plain developer list kept for other screens')
})

test('server: timers — a manager can log time only on tickets assigned to them (existing assignee check)', () => {
  const start = TIMELOGS.slice(TIMELOGS.indexOf('export const startTimer'), TIMELOGS.indexOf('export const stopTimer'))
  assert.match(start, /if \(currentUser\.role !== 'developer' && currentUser\.role !== 'project_manager'\) throw new Error\('Only the assigned resource can log time'\)/)
  assert.match(start, /if \(estimateRow\.assignedToId !== currentUser\.id\) throw new Error\(NOT_ASSIGNED_TIMER_MESSAGE\)/)
  assert.match(TIMELOGS, /if \(currentUser\.role !== 'developer' && currentUser\.role !== 'project_manager'\) return deriveTimerSession\(\[\]\)/)
  // Time Tracking page / dropdown / export stay developer-only (no extra developer screens for managers).
  const tt = TIMELOGS.slice(TIMELOGS.indexOf('export const getTimerTickets'))
  assert.match(tt, /if \(currentUser\.role !== 'developer'\) return \[\]/)
})

test('UI: Ticket Detail shows work actions + time to the assigned manager; pickers filtered per ticket', () => {
  assert.equal((DETAIL.match(/canWorkOnTicket\(user\.role, user\.id, ticket\.assignedToId\) && \(/g) || []).length, 2)
  assert.match(DETAIL, /const developers = assignableResourcesFor\(resources, ticket\.projectId\)/)
  assert.match(read('components/dashboard/ticket-card.tsx'), /assignableResourcesFor\(developers \?\? \[\], ticket\.projectId\)\.map/)
  assert.match(read('components/dashboard/assignment-panel.tsx'), /assignableResourcesFor\(resources, ticket\.projectId\)\.map/)
  assert.match(read('components/dashboard/assignment-panel.tsx'), /const developers = useMemo\(\(\) => resources\.filter\(\(r\) => \(r\.role \?\? 'developer'\) === 'developer'\), \[resources\]\)/, 'workload stays developers-only')
  for (const f of ['app/dashboard/assignments/page.tsx', 'app/dashboard/tickets/page.tsx', 'app/dashboard/tickets/[id]/page.tsx']) {
    assert.match(read(f), /getAssignableResources\(\)/, f)
  }
})
