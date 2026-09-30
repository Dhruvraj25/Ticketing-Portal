// Settings (/dashboard/admin) heading uses the same container as other pages.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8')
const CONTAINER = 'className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6"'

test('Settings heading has the shared heading container', () => {
  assert.ok(read('app/dashboard/admin/page.tsx').includes(`<div data-tour="admin-header" ${CONTAINER}>`))
  // Same classes as the existing admin headers it mirrors.
  for (const p of ['app/dashboard/admin/users/page.tsx', 'app/dashboard/admin/teams/page.tsx', 'app/dashboard/admin/email/page.tsx']) {
    assert.ok(read(p).includes(CONTAINER), p)
  }
})
