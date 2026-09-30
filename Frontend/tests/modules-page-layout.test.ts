// Modules page (Admin + Manager share it): no Archived KPI, no Description
// column, list scrolls inside its container with a visible header.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PAGE = readFileSync(join(import.meta.dirname, '..', 'app', 'dashboard', 'modules', 'modules-page-client.tsx'), 'utf8')

test('Archived KPI removed; remaining three cards fill the row', () => {
  assert.doesNotMatch(PAGE, /title="Archived"/)
  assert.match(PAGE, /className="grid grid-cols-1 sm:grid-cols-3 gap-4"/)
  for (const t of ['Total Modules / Service Areas', 'Active Modules / Service Areas', 'Completed']) assert.ok(PAGE.includes(`title="${t}"`), t)
})

test('Description column removed (header and cells); other columns unchanged', () => {
  assert.doesNotMatch(PAGE, />Description<\/TableHead>/)
  assert.doesNotMatch(PAGE, /mod\.description/)
  for (const h of ['Module / Service Area Name', 'Project', 'Status', 'Tickets', 'Assigned To', 'Created']) {
    assert.match(PAGE, new RegExp(`>${h.replace(/\//g, '\\/')}</TableHead>`), h)
  }
})

test('module list scrolls inside its container (like the Ticket List) with a sticky header', () => {
  assert.match(PAGE, /data-testid="modules-table-scroll" className="max-h-\[640px\] overflow-auto overscroll-behavior-contain"/)
  assert.match(PAGE, /<TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-900">/)
  // Traditional pagination was replaced by infinite scroll (tests/modules-infinite-scroll.test.ts).
  assert.doesNotMatch(PAGE, /modules-pagination/)
})
