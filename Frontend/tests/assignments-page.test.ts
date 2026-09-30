// Manager Assignment page — KPIs, removed summary, scrollable workload, header card.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PANEL = readFileSync(join(ROOT, 'components', 'dashboard', 'assignment-panel.tsx'), 'utf8')
const PAGE = readFileSync(join(ROOT, 'app', 'dashboard', 'assignments', 'page.tsx'), 'utf8')

test('KPIs: Total Tickets removed; Unassigned/Assigned renamed to Total Unassign/Total Assign', () => {
  assert.doesNotMatch(PANEL, /<StatCard title="Total Tickets"/)
  assert.match(PANEL, /<StatCard title="Total Unassign" value=\{summary\.unassigned\}/)
  assert.match(PANEL, /<StatCard title="Total Assign" value=\{summary\.assigned\}/)
  assert.match(PANEL, /<StatCard title="Developers" value=\{summary\.developers\}/)
})

test('Assignment Summary section is removed', () => {
  assert.doesNotMatch(PANEL, /Assignment Summary|data-tour="assignments-summary"/)
})

test('Developer Workload scrolls inside its section (cards never stretch the page)', () => {
  const workload = PANEL.slice(PANEL.indexOf('data-tour="assignments-developers"'))
  assert.match(workload, /className="space-y-3 max-h-\[640px\] overflow-y-auto overscroll-contain pr-1"/)
})

test('page heading uses the shared white header card', () => {
  assert.match(PAGE, /data-tour="assignments-header" className="relative bg-white dark:bg-slate-900 border border-slate-200\/90 dark:border-slate-800 rounded-2xl shadow-sm p-6"/)
})

test('Auto Assign only targets tickets that are ready for assignment', () => {
  assert.match(PANEL, /visibleTickets\.filter\(isReadyForResourceAssignment\)\.slice\(0, 10\)/)
  assert.match(PANEL, /disabled=\{!visibleTickets\.some\(isReadyForResourceAssignment\)\}/)
})
