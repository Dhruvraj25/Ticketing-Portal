import { test } from 'node:test'
import assert from 'node:assert/strict'
import { G_NAV_BY_ROLE, SHORTCUT_PAGES_BY_ROLE } from '../lib/keyboard-shortcuts.ts'
import type { UserRole } from '../lib/types.ts'

const roles: UserRole[] = ['admin', 'project_manager', 'developer', 'client']

test('every role has G-nav targets and searchable pages', () => {
  for (const role of roles) {
    assert.ok(G_NAV_BY_ROLE[role], `${role}: G-nav missing`)
    assert.ok(Object.keys(G_NAV_BY_ROLE[role]).length > 0, `${role}: G-nav empty`)
    assert.ok(SHORTCUT_PAGES_BY_ROLE[role].length > 0, `${role}: no searchable pages`)
  }
})

test('G-nav keys are single chars with valid dashboard hrefs', () => {
  for (const role of roles) {
    for (const [key, dest] of Object.entries(G_NAV_BY_ROLE[role])) {
      assert.equal(key.length, 1, `${role}: G key '${key}' must be a single char`)
      assert.ok(
        dest.href === '/dashboard' || dest.href.startsWith('/dashboard/'),
        `${role}: G-${key} has invalid href '${dest.href}'`,
      )
    }
  }
})

test('every G destination is reachable via the role\'s page list', () => {
  for (const role of roles) {
    const pages = new Set(SHORTCUT_PAGES_BY_ROLE[role].map((p) => p.href))
    for (const [key, dest] of Object.entries(G_NAV_BY_ROLE[role])) {
      assert.ok(pages.has(dest.href), `${role}: G-${key} -> '${dest.href}' not in page list`)
    }
  }
})

test('page lists contain no duplicate hrefs per role', () => {
  for (const role of roles) {
    const hrefs = SHORTCUT_PAGES_BY_ROLE[role].map((p) => p.href)
    assert.equal(new Set(hrefs).size, hrefs.length, `${role}: duplicate page hrefs`)
  }
})

test('G then C (create ticket) is role-gated and points to tickets/new', () => {
  for (const role of ['admin', 'project_manager', 'client'] as UserRole[]) {
    const dest = G_NAV_BY_ROLE[role]?.['c']
    assert.ok(dest, `${role}: G+C missing`)
    assert.equal(dest.href, '/dashboard/tickets/new', `${role}: G+C wrong href`)
  }
  // Developers cannot create tickets → no G+C for them.
  assert.equal(G_NAV_BY_ROLE.developer?.['c'], undefined)
})
