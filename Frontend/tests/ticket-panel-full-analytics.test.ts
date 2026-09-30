// My Tickets → Analytics: no "Full Analytics" button for developers; the
// Analytics section itself is unchanged.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PANEL = readFileSync(join(ROOT, 'components', 'dashboard', 'ticket-right-panel.tsx'), 'utf8')
const ANALYTICS_PAGE = readFileSync(join(ROOT, 'app', 'dashboard', 'analytics', 'page.tsx'), 'utf8')

test('Full Analytics link only for the roles that can open the Analytics page', () => {
  assert.match(PANEL, /\{\(userRole === 'admin' \|\| userRole === 'project_manager'\) && \(\s*\n\s*<Link\s*\n\s*href="\/dashboard\/analytics"/)
  assert.match(ANALYTICS_PAGE, /if \(user\.role !== 'project_manager' && user\.role !== 'admin'\)/)
  assert.equal((PANEL.match(/Full Analytics/g) || []).length, 1)
})

test('the Analytics section and its figures are unchanged', () => {
  for (const label of ['Resolution Rate', 'Avg. Response', 'Satisfaction']) assert.ok(PANEL.includes(label), label)
})
