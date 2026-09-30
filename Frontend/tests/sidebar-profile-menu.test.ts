// Sidebar profile popup: arrow direction, toggle, outside-click / Escape close.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SIDEBAR = readFileSync(join(import.meta.dirname, '..', 'components', 'dashboard', 'sidebar.tsx'), 'utf8')

test('arrow points down when closed and up (rotated 180°) when open', () => {
  assert.match(SIDEBAR, /<ChevronDown\s*\n\s*size=\{14\}\s*\n\s*className=\{cn\('text-slate-400 transition-transform duration-200', userMenuOpen && 'rotate-180'\)\}/)
})

test('the arrow button toggles the popup from the latest state and exposes it to assistive tech', () => {
  assert.match(SIDEBAR, /onClick=\{\(\) => setUserMenuOpen\(\(open\) => !open\)\}/)
  assert.match(SIDEBAR, /aria-expanded=\{userMenuOpen\}/)
  assert.doesNotMatch(SIDEBAR, /setUserMenuOpen\(!userMenuOpen\)/)
})

test('a press outside the profile card (or Escape) closes it; inside presses do not', () => {
  assert.match(SIDEBAR, /<div ref=\{userMenuRef\} className=\{cn\('mt-3 p-2\.5 rounded-2xl border/)
  assert.match(SIDEBAR, /if \(userMenuRef\.current && !userMenuRef\.current\.contains\(e\.target as Node\)\) setUserMenuOpen\(false\)/)
  assert.match(SIDEBAR, /if \(e\.key === 'Escape'\) setUserMenuOpen\(false\)/)
  assert.match(SIDEBAR, /document\.addEventListener\('pointerdown', onPointerDown\)/)
  assert.match(SIDEBAR, /document\.removeEventListener\('pointerdown', onPointerDown\)/, 'listener cleaned up')
  assert.match(SIDEBAR, /if \(!userMenuOpen\) return/, 'only listens while open')
})

test('never left open behind navigation or collapse; menu items unchanged', () => {
  assert.match(SIDEBAR, /useEffect\(\(\) => \{ setUserMenuOpen\(false\) \}, \[pathname, collapsed\]\)/)
  assert.match(SIDEBAR, /<span>My Profile<\/span>/)
  assert.match(SIDEBAR, /<span>Sign out<\/span>/)
  assert.match(SIDEBAR, /signOutAndRedirect\(\)/)
})
