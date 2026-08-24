import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRouteActive, resolveActiveNav, type NavHref } from '../lib/navigation.ts'

// Mirrors the real nav lists (relevant subset) incl. matchDescendants flags
const clientNav: NavHref[] = [
  { href: '/dashboard' },
  { href: '/dashboard/projects' },
  { href: '/dashboard/tickets/new' },
  { href: '/dashboard/tickets' },
  { href: '/dashboard/support-wallet' },
  { href: '/dashboard/notifications' },
  { href: '/dashboard/profile' },
  { href: '/dashboard/help' },
]

const developerNav: NavHref[] = [
  { href: '/dashboard' },
  { href: '/dashboard/tickets' },
  { href: '/dashboard/time-tracking' },
  { href: '/dashboard/notifications' },
  { href: '/dashboard/resources' },
  { href: '/dashboard/profile' },
  { href: '/dashboard/help' },
]

const adminNav: NavHref[] = [
  { href: '/dashboard' },
  { href: '/dashboard/customer-onboarding' },
  { href: '/dashboard/projects' },
  { href: '/dashboard/modules' },
  { href: '/dashboard/tickets' },
  { href: '/dashboard/worklogs' },
  { href: '/dashboard/wallets' },
  { href: '/dashboard/analytics' },
  { href: '/dashboard/reports/view' },
  { href: '/dashboard/reports/customer-reviews' },
  { href: '/dashboard/reviews' },
  { href: '/dashboard/notifications' },
  { href: '/dashboard/admin/users' },
  { href: '/dashboard/admin/teams' },
  { href: '/dashboard/admin', matchDescendants: false },
  { href: '/dashboard/help' },
]

const managerNav: NavHref[] = [
  { href: '/dashboard' },
  { href: '/dashboard/projects' },
  { href: '/dashboard/tickets' },
  { href: '/dashboard/assignments' },
  { href: '/dashboard/review-queue' },
  { href: '/dashboard/wallets' },
  { href: '/dashboard/reports/view' },
  { href: '/dashboard/help' },
]

function activeFor(nav: NavHref[], pathname: string): string | null {
  const r = resolveActiveNav(pathname, nav)
  return r.length ? r[0] : null
}

// ─── Most-specific route wins: Create Ticket beats My Tickets on /new ────
test('client: Create Ticket highlighted on /new; My Tickets on list and detail routes', () => {
  assert.equal(activeFor(clientNav, '/dashboard/tickets'), '/dashboard/tickets')
  assert.equal(activeFor(clientNav, '/dashboard/tickets/new'), '/dashboard/tickets/new') // dedicated child beats parent module
  assert.equal(activeFor(clientNav, '/dashboard/tickets/42'), '/dashboard/tickets') // unknown detail → parent module
  assert.equal(activeFor(clientNav, '/dashboard/tickets/42/edit'), '/dashboard/tickets')
  assert.equal(activeFor(clientNav, '/dashboard/tickets/42/activity'), '/dashboard/tickets')
  assert.equal(activeFor(clientNav, '/dashboard/tickets/new?priority=high'), '/dashboard/tickets/new') // query ignored
})

test('developer: My Tickets stays active on all ticket child routes (no Create Ticket item)', () => {
  assert.equal(activeFor(developerNav, '/dashboard/tickets'), '/dashboard/tickets')
  assert.equal(activeFor(developerNav, '/dashboard/tickets/new'), '/dashboard/tickets') // no /new nav item → falls back to module
  assert.equal(activeFor(developerNav, '/dashboard/tickets/7/activity'), '/dashboard/tickets')
  assert.equal(activeFor(developerNav, '/dashboard/time-tracking/3'), '/dashboard/time-tracking')
})

// ─── Route table from the sidebar fix spec ────────────────────────────────
test('client route table highlights the expected nav item', () => {
  assert.equal(activeFor(clientNav, '/dashboard/tickets'), '/dashboard/tickets') // My Tickets
  assert.equal(activeFor(clientNav, '/dashboard/tickets/new'), '/dashboard/tickets/new') // Create Ticket
  assert.equal(activeFor(clientNav, '/dashboard/tickets/123'), '/dashboard/tickets') // ticket detail → My Tickets
  assert.equal(activeFor(clientNav, '/dashboard/projects'), '/dashboard/projects') // My Projects
  assert.equal(activeFor(clientNav, '/dashboard/projects/new'), '/dashboard/projects') // no Create Project item → parent
  assert.equal(activeFor(clientNav, '/dashboard/support-wallet'), '/dashboard/support-wallet')
  assert.equal(activeFor(clientNav, '/dashboard/notifications'), '/dashboard/notifications')
  assert.equal(activeFor(clientNav, '/dashboard/help'), '/dashboard/help')
})

test('admin/manager: Tickets stays active on all ticket child routes', () => {
  assert.equal(activeFor(adminNav, '/dashboard/tickets/12'), '/dashboard/tickets')
  assert.equal(activeFor(managerNav, '/dashboard/tickets/12/edit'), '/dashboard/tickets')
})

// ─── Other parent modules keep highlighting on their child pages ───────────
test('parent modules stay active on nested routes', () => {
  assert.equal(activeFor(clientNav, '/dashboard/projects'), '/dashboard/projects')
  assert.equal(activeFor(clientNav, '/dashboard/projects/8'), '/dashboard/projects')
  assert.equal(activeFor(clientNav, '/dashboard/support-wallet'), '/dashboard/support-wallet')
  assert.equal(activeFor(clientNav, '/dashboard/support-wallet/5'), '/dashboard/support-wallet')
  assert.equal(activeFor(adminNav, '/dashboard/help/release-notes'), '/dashboard/help')
  assert.equal(activeFor(adminNav, '/dashboard/reports/view'), '/dashboard/reports/view')
  assert.equal(activeFor(adminNav, '/dashboard/projects/9/modules'), '/dashboard/projects')
  assert.equal(activeFor(adminNav, '/dashboard/modules/4'), '/dashboard/modules')
})

// ─── Regression guards: no double-highlights, no cross-module stealing ────
test('admin sub-pages highlight the specific item, not Settings', () => {
  assert.equal(activeFor(adminNav, '/dashboard/admin'), '/dashboard/admin')
  assert.equal(activeFor(adminNav, '/dashboard/admin/users'), '/dashboard/admin/users')
  assert.equal(activeFor(adminNav, '/dashboard/admin/users/new'), '/dashboard/admin/users')
  assert.equal(activeFor(adminNav, '/dashboard/admin/teams'), '/dashboard/admin/teams')
})

test('Dashboard root only matches exactly and never steals highlight', () => {
  assert.equal(activeFor(adminNav, '/dashboard'), '/dashboard')
  assert.equal(activeFor(adminNav, '/dashboard/analytics'), '/dashboard/analytics')
  assert.equal(activeFor(clientNav, '/dashboard/analytics'), null) // not in client nav
  assert.equal(activeFor(developerNav, '/dashboard/resources'), '/dashboard/resources')
})

// ─── isRouteActive unit semantics ─────────────────────────────────────────
test('isRouteActive: exact, prefix, root exclusion, matchDescendants=false', () => {
  assert.equal(isRouteActive('/dashboard/tickets', '/dashboard/tickets'), true)
  assert.equal(isRouteActive('/dashboard/tickets/new', '/dashboard/tickets'), true)
  assert.equal(isRouteActive('/dashboard/tickets/new', '/dashboard/tickets/new'), true)
  assert.equal(isRouteActive('/dashboard/tickets', '/dashboard'), false) // root exact-only
  assert.equal(isRouteActive('/dashboard/tickets', '/dashboard/tickets/42'), false)
  assert.equal(isRouteActive('/dashboard/tickets/42', '/dashboard/tickets', false), false) // matchDescendants off
  assert.equal(isRouteActive('/dashboard/tickets', '/dashboard/tickets', false), true) // but exact still matches
  assert.equal(isRouteActive('/dashboard/tickets/new', '/dashboard/tickets?status=open'), true) // query in href ignored
})
