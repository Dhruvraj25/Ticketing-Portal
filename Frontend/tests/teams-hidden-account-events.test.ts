import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Client Notification Preferences UI — hide 3 events from the TEAMS column
// only: customer_created ("Customer account created"), welcome ("Welcome
// email"), new_project ("New project").
//
// Scope: display-only, in the Client → Project Notification Preferences
// widget's TEAMS column. Everything else must stay exactly as it was —
// the shared backend catalog (Backend/src/lib/notification-preferences.ts),
// the Email/In-App columns of this same widget, the underlying DB rows/
// dispatch logic, and Admin/Manager/Developer notification preferences.
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const WIDGET_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'project-notification-preferences-section.tsx'), 'utf8')
const BACKEND_CATALOG_SRC = readFileSync(
  join(ROOT, '..', 'Backend', 'src', 'lib', 'notification-preferences.ts'),
  'utf8',
)

const HIDDEN = ['customer_created', 'welcome', 'new_project']

// ─── The three events are excluded from the TEAMS column only ──────────────

test('a TEAMS_HIDDEN_EVENT_TYPES set exists containing exactly customer_created, welcome, new_project', () => {
  const idx = WIDGET_SRC.indexOf('TEAMS_HIDDEN_EVENT_TYPES')
  assert.ok(idx >= 0, 'TEAMS_HIDDEN_EVENT_TYPES must be defined')
  const decl = WIDGET_SRC.slice(idx, idx + 200)
  for (const eventType of HIDDEN) {
    assert.match(decl, new RegExp(`'${eventType}'`), `${eventType} must be in the hidden-from-Teams set`)
  }
})

test('the filter is applied ONLY when building the "teams" column\'s grouped list', () => {
  const idx = WIDGET_SRC.indexOf('groupedPreferencesByChannel')
  assert.ok(idx >= 0)
  const body = WIDGET_SRC.slice(idx, idx + 900)
  assert.match(body, /key === 'teams' \? prefs\.filter\(p => !TEAMS_HIDDEN_EVENT_TYPES\.has\(p\.eventType\)\) : prefs/)
})

test('the Email and In-App columns render the full, unfiltered preference list (the filter is applied exactly once, for "teams" only)', () => {
  // Only one actual .has(...) filter check in the whole file, inside the
  // teams-only ternary asserted above — Email/In-App never pass through it.
  const occurrences = WIDGET_SRC.match(/TEAMS_HIDDEN_EVENT_TYPES\.has\(/g) ?? []
  assert.equal(occurrences.length, 1, 'the hidden-set must be consulted exactly once, never applied to email/in_app')
})

// ─── Toggle/save logic for these events is untouched — data not deleted ────

test('the toggle handler and save action are untouched — hidden events can still be toggled/saved if ever re-shown (no functionality deleted)', () => {
  assert.match(WIDGET_SRC, /const handleToggle = async \(eventType: string, channel: ChannelKey, enabled: boolean, label: string\) => \{/)
  assert.match(WIDGET_SRC, /updateProjectNotificationPreference\(projectId, eventType, channel, enabled\)/)
})

test('the underlying backend catalog still defines all three events, unchanged — they were removed from a UI list, not from the catalog/DB', () => {
  assert.match(BACKEND_CATALOG_SRC, /\{ eventType: 'customer_created', label: 'Customer account created', group: 'Account' \}/)
  assert.match(BACKEND_CATALOG_SRC, /\{ eventType: 'welcome', label: 'Welcome email', group: 'Account' \}/)
  assert.match(BACKEND_CATALOG_SRC, /\{ eventType: 'new_project', label: 'New project', group: 'Account' \}/)
})

// ─── Every other event stays in all three columns ───────────────────────────

test('no other event type appears in TEAMS_HIDDEN_EVENT_TYPES — every other event keeps its Teams row', () => {
  const idx = WIDGET_SRC.indexOf('TEAMS_HIDDEN_EVENT_TYPES = new Set(')
  const end = WIDGET_SRC.indexOf(')', idx)
  const setLiteral = WIDGET_SRC.slice(idx, end)
  const matches = [...setLiteral.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  assert.deepEqual(matches.sort(), [...HIDDEN].sort())
})

// ─── Nothing else in this file changed structurally: same channels, same API calls, same authorization boundary ─

test('the widget still uses the exact same 3 channels (teams, email, in_app) and the same backend API calls — only the row list for one column changed', () => {
  assert.match(WIDGET_SRC, /'in_app' \| 'email' \| 'teams'/)
  assert.match(WIDGET_SRC, /getProjectNotificationPreferences\(projectId\)/)
  assert.match(WIDGET_SRC, /updateProjectNotificationPreference\(projectId, eventType, channel, enabled\)/)
})
