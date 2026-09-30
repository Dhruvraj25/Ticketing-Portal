// Help & Support: lifecycle matches the real workflow, search dropdown is not
// clipped, and the Priority Guide covers every ticket priority (incl. Urgent).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const DATA = readFileSync(join(ROOT, 'components/dashboard/help/help-data.ts'), 'utf8')
const CONTENT = readFileSync(join(ROOT, 'components/dashboard/help/help-content.tsx'), 'utf8')
const TYPES = readFileSync(join(ROOT, 'lib/types.ts'), 'utf8')

const block = (src: string, start: string) => src.slice(src.indexOf(start), src.indexOf('\n]', src.indexOf(start)))

test('lifecycle follows the real status order: estimate approval before assignment, manager before client', () => {
  const stages = block(DATA, 'export const ticketLifecycleStages')
  const statuses = [...stages.matchAll(/status: '([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(statuses, [
    'New Request', 'Awaiting Estimate Approval', 'Estimate Approved', 'Assigned to Resource',
    'Work in Progress', 'Manager Review', 'Awaiting Client Review', 'Completed',
  ])
  for (const s of statuses) assert.ok(TYPES.includes(`label: '${s}'`), `"${s}" is a real status label`)
  assert.match(stages, /loop: 'Needs changes → Rework/)
  assert.match(stages, /loop: 'Changes needed → Requested for Revision/)
  assert.doesNotMatch(stages, /Waiting for Client/, 'not an application status')
})

test('search results are not clipped by the hero container', () => {
  const hero = CONTENT.slice(CONTENT.indexOf('function HeroSection'), CONTENT.indexOf('<motion.div', CONTENT.indexOf('function HeroSection')))
  assert.match(hero, /className='relative z-20 rounded-2xl/)
  assert.doesNotMatch(hero.match(/data-tour="help-hero"[^\n]*|<div className='relative[^']*' data-tour="help-hero"/)![0], /overflow-hidden/)
  assert.match(hero, /aria-hidden="true" className='pointer-events-none absolute inset-0 overflow-hidden rounded-2xl'/)
})

test('Priority Guide includes Urgent, in priority order, on a 5-column grid', () => {
  const levels = [...block(DATA, 'export const priorityGuides').matchAll(/level: '([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(levels, ['Low', 'Medium', 'High', 'Urgent', 'Critical'])
  assert.match(TYPES, /export type TicketPriority = 'low' \| 'medium' \| 'high' \| 'urgent' \| 'critical'/)
  assert.match(CONTENT, /grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5/)
})
