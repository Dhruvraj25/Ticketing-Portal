import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  loadTicketDraft,
  saveTicketDraft,
  clearTicketDraft,
  resolveDraftSelection,
  TICKET_DRAFT_STORAGE_KEY,
} from '../lib/ticket-draft.ts'

// ============================================================================
// Save Draft — dropdown persistence regression suite
// ============================================================================
// lib/ticket-draft.ts is the single source of truth for the draft storage
// key/shape and the "is this saved dropdown selection still valid" rule used
// by app/dashboard/tickets/new/page.tsx for Client / Project / Module. These
// tests exercise the real functions (not a reimplementation) against an
// in-memory `window.localStorage` stub, since the module guards every
// storage access on `typeof window === 'undefined'` (SSR-safety) — under
// plain Node there is no `window`. The stub is only referenced inside
// loadTicketDraft/saveTicketDraft/clearTicketDraft function BODIES (never at
// module-import time), so setting it up after the static import above is safe.

function createMemoryStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
  }
}

;(globalThis as any).window = { localStorage: createMemoryStorage() }

function resetStorage() {
  ;(globalThis as any).window.localStorage = createMemoryStorage()
}

// ─── resolveDraftSelection — the dropdown-restoration rule ─────────────────

test('resolveDraftSelection: restores a saved value that still exists in the list', () => {
  const projects = [{ id: 1 }, { id: 2 }, { id: 3 }]
  assert.equal(resolveDraftSelection('2', projects, (p) => p.id), '2')
})

test('resolveDraftSelection: works across string draft value vs numeric option id (no type mismatch)', () => {
  const modules = [{ id: 501, moduleName: 'Frontend' }, { id: 502, moduleName: 'Backend' }]
  assert.equal(resolveDraftSelection('502', modules, (m) => m.id), '502')
})

test('resolveDraftSelection: never falls back to a default when the saved value IS valid (requirement #3)', () => {
  const clients = [{ id: 'c-1' }, { id: 'c-2' }]
  const restored = resolveDraftSelection('c-2', clients, (c) => c.id)
  assert.equal(restored, 'c-2', 'a valid saved selection must win over any caller-side default')
})

test('resolveDraftSelection: returns null for a stale/no-longer-authorized id (never restores garbage)', () => {
  const projects = [{ id: 1 }, { id: 2 }]
  assert.equal(resolveDraftSelection('999', projects, (p) => p.id), null)
})

test('resolveDraftSelection: returns null for empty/undefined/missing draft values', () => {
  const projects = [{ id: 1 }]
  assert.equal(resolveDraftSelection(undefined, projects, (p) => p.id), null)
  assert.equal(resolveDraftSelection(null, projects, (p) => p.id), null)
  assert.equal(resolveDraftSelection('', projects, (p) => p.id), null)
})

test('resolveDraftSelection: returns null against an empty options list (e.g. still loading)', () => {
  assert.equal(resolveDraftSelection('1', [], (p: { id: number }) => p.id), null)
})

// ─── loadTicketDraft / saveTicketDraft / clearTicketDraft round-trip ───────

test('save -> reload restores every field exactly (requirements #1-2)', () => {
  resetStorage()
  const draft = {
    title: 'Payment gateway timing out',
    description: 'Detailed repro steps...',
    priority: 'high',
    category: 'bug',
    environment: 'staging',
    additionalInfo: 'Started after the last deploy',
    clientId: 'client-42',
    projectId: '7',
    moduleId: '501',
  }
  saveTicketDraft(draft)
  const reloaded = loadTicketDraft()
  assert.deepEqual(reloaded, draft, 'every saved field must come back unchanged on reload')
})

test('every dropdown field survives the round-trip individually', () => {
  resetStorage()
  saveTicketDraft({ title: 'x', priority: 'urgent', category: 'integration', environment: 'production', clientId: 'c-9', projectId: '3', moduleId: '10' })
  const reloaded = loadTicketDraft()
  assert.equal(reloaded?.priority, 'urgent')
  assert.equal(reloaded?.category, 'integration')
  assert.equal(reloaded?.environment, 'production')
  assert.equal(reloaded?.clientId, 'c-9')
  assert.equal(reloaded?.projectId, '3')
  assert.equal(reloaded?.moduleId, '10')
})

test('re-saving after editing persists the NEW values, not the old ones (requirement #4)', () => {
  resetStorage()
  saveTicketDraft({ title: 'v1', priority: 'low', projectId: '1', moduleId: '10' })
  // User reopens, changes several values, saves again.
  saveTicketDraft({ title: 'v2', priority: 'critical', projectId: '2', moduleId: '20' })
  const reloaded = loadTicketDraft()
  assert.equal(reloaded?.title, 'v2')
  assert.equal(reloaded?.priority, 'critical')
  assert.equal(reloaded?.projectId, '2')
  assert.equal(reloaded?.moduleId, '20')
})

test('clearTicketDraft removes the draft (called after successful submission)', () => {
  resetStorage()
  saveTicketDraft({ title: 'to be submitted' })
  assert.ok(loadTicketDraft())
  clearTicketDraft()
  assert.equal(loadTicketDraft(), null)
})

test('loadTicketDraft never throws on missing or corrupt storage', () => {
  resetStorage()
  assert.equal(loadTicketDraft(), null, 'no draft saved yet')
  ;(globalThis as any).window.localStorage.setItem(TICKET_DRAFT_STORAGE_KEY, 'not valid json{{{')
  assert.doesNotThrow(() => loadTicketDraft())
  assert.equal(loadTicketDraft(), null)
})

// ─── Regression: the create-ticket page actually uses these, no duplicate logic ─

const ROOT = join(import.meta.dirname, '..')
const NEW_TICKET_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'tickets', 'new', 'page.tsx'), 'utf8')

test('create-ticket page saves every current form field in the draft', () => {
  const start = NEW_TICKET_PAGE_SRC.indexOf('function saveDraft()')
  const end = NEW_TICKET_PAGE_SRC.indexOf('\n  }', start)
  const body = NEW_TICKET_PAGE_SRC.slice(start, end)
  for (const field of ['title', 'description', 'priority', 'category', 'environment', 'additionalInfo']) {
    assert.match(body, new RegExp(`\\b${field}\\b`), `saveDraft() must persist "${field}"`)
  }
  assert.match(body, /clientId: selectedClientId/)
  assert.match(body, /projectId: selectedProjectId/)
  assert.match(body, /moduleId: selectedModuleId/)
})

test('create-ticket page routes all three dropdown restorations through resolveDraftSelection (no duplicate matching logic)', () => {
  const occurrences = NEW_TICKET_PAGE_SRC.match(/resolveDraftSelection\(/g) || []
  assert.equal(occurrences.length, 3, 'Client, Project and Module must each resolve their saved id through the shared helper')
})

test('create-ticket page has no leftover raw localStorage draft access (single source of truth)', () => {
  assert.ok(!NEW_TICKET_PAGE_SRC.includes("localStorage.getItem('ticket-draft')"))
  assert.ok(!NEW_TICKET_PAGE_SRC.includes("localStorage.setItem('ticket-draft'"))
  assert.ok(!NEW_TICKET_PAGE_SRC.includes("localStorage.removeItem('ticket-draft')"))
})

test('project/client dropdown restoration resolves against the freshly-fetched list, not stale component state', () => {
  // Regression guard for the original bug: checking against `clients`/`projects`
  // state (captured by this effect's closure before setClients/setProjects had
  // re-rendered) always fails and silently drops the saved selection.
  const loadStart = NEW_TICKET_PAGE_SRC.indexOf('async function load()')
  const loadEnd = NEW_TICKET_PAGE_SRC.indexOf('\n    load()', loadStart)
  const loadBody = NEW_TICKET_PAGE_SRC.slice(loadStart, loadEnd)
  assert.match(loadBody, /resolveDraftSelection\(draft\?\.clientId, clientList,/)
  assert.match(loadBody, /resolveDraftSelection\(draft\?\.projectId, projs,/)
  assert.match(loadBody, /resolveDraftSelection\(draft\?\.moduleId, mods,/)
})
