// Header profile (avatar) popup: toggles on the avatar, closes on an outside
// press / Escape, stays open for presses inside, menu actions unchanged.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createDismissHandlers } from '../lib/dismiss-on-outside.ts'

const ROOT = join(import.meta.dirname, '..')
const HEADER = readFileSync(join(ROOT, 'components', 'dashboard', 'top-header.tsx'), 'utf8')
const HOOK = readFileSync(join(ROOT, 'hooks', 'use-dismiss-on-outside.ts'), 'utf8')

// Minimal node tree: the profile container holds the avatar and the popup items.
const node = (name: string) => ({ name })
const avatar = node('avatar'), popup = node('popup'), myProfile = node('my-profile'), signOut = node('sign-out')
const heading = node('page-heading'), card = node('dashboard-card'), sidebar = node('sidebar'), empty = node('empty-area')
const container = { contains: (n: unknown) => [avatar, popup, myProfile, signOut].includes(n as { name: string }) }

function harness() {
  let open = true
  const h = createDismissHandlers(() => container, () => { open = false })
  return { h, isOpen: () => open, reopen: () => { open = true } }
}

test('outside presses close it: page heading, dashboard card, sidebar, empty area', () => {
  for (const target of [heading, card, sidebar, empty]) {
    const { h, isOpen } = harness()
    h.onPointerDown({ target })
    assert.equal(isOpen(), false, `${target.name} closes the popup`)
  }
})

test('presses inside do not dismiss: the popup, My Profile, Sign out, and the avatar (it toggles instead)', () => {
  for (const target of [popup, myProfile, signOut, avatar]) {
    const { h, isOpen } = harness()
    h.onPointerDown({ target })
    assert.equal(isOpen(), true, `${target.name} is inside`)
  }
})

test('Escape closes it; other keys do not', () => {
  const { h, isOpen, reopen } = harness()
  h.onKeyDown({ key: 'Enter' }); assert.equal(isOpen(), true)
  h.onKeyDown({ key: 'Escape' }); assert.equal(isOpen(), false)
  reopen()
})

test('header wiring: ref wraps avatar + popup, listener only while open, cleaned up', () => {
  assert.match(HEADER, /<div className="relative" ref=\{userMenuRef\}>\s*\n\s*<button\s*\n\s*type="button"\s*\n\s*onClick=\{\(\) => setShowUserMenu\(\(open\) => !open\)\}/)
  assert.match(HEADER, /useDismissOnOutside\(userMenuRef, showUserMenu, closeUserMenu\)/)
  assert.match(HEADER, /aria-expanded=\{showUserMenu\}/)
  assert.match(HEADER, /useEffect\(\(\) => \{ setShowUserMenu\(false\) \}, \[pathname\]\)/, 'closes on navigation')
  assert.match(HOOK, /if \(!open\) return/)
  assert.match(HOOK, /document\.removeEventListener\('pointerdown', onPointerDown\)/)
  assert.match(HOOK, /document\.removeEventListener\('keydown', onKeyDown\)/)
})

test('My Profile and Sign out actions are unchanged', () => {
  assert.match(HEADER, /<Link\s*\n\s*href="\/dashboard\/profile"\s*\n\s*onClick=\{\(\) => setShowUserMenu\(false\)\}/)
  assert.match(HEADER, /setShowUserMenu\(false\)\s*\n\s*signOutAndRedirect\(\)/)
})
