import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  loadTicketDraft,
  saveTicketDraft,
  clearTicketDraft,
  resolveDraftSelection,
  hasDraftSelection,
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

// ─── Regression: the REAL production bug — restored values overwritten AFTER restore ─
// The deployed build restored title/description but every dropdown snapped back to
// its default. These tests pin the structural guarantees that prevent that class of
// bug, because the page cannot be mounted under plain node:test.

test('hasDraftSelection: draft is authoritative for a field only when a non-empty value is saved', () => {
  assert.equal(hasDraftSelection({ projectId: '7' }, 'projectId'), true)
  assert.equal(hasDraftSelection({ projectId: '' }, 'projectId'), false, 'empty saved value = no saved selection')
  assert.equal(hasDraftSelection({}, 'projectId'), false)
  assert.equal(hasDraftSelection(null, 'projectId'), false)
})

test('initial-load effect must NOT auto-select the Support project/module when the draft saved none (default must not override saved empty state)', () => {
  const loadStart = NEW_TICKET_PAGE_SRC.indexOf('async function load()')
  const loadEnd = NEW_TICKET_PAGE_SRC.indexOf('\n    load()', loadStart)
  const loadBody = NEW_TICKET_PAGE_SRC.slice(loadStart, loadEnd)
  assert.match(
    loadBody,
    /hasDraftSelection\(draft, 'projectId'\)/,
    'Support-project fallback must be gated on the draft having no saved project',
  )
  assert.match(
    loadBody,
    /hasDraftSelection\(draft, 'moduleId'\)/,
    'Support-module fallback must be gated on the draft having no saved module',
  )
})

test('user-driven project change clears the module, but the restore path must not route through that handler', () => {
  // Clearing the module when the USER picks a different project is correct;
  // what must never happen is the async restore flow invoking this handler,
  // because it would wipe the just-restored module. The restore path in
  // load() must therefore fetch modules itself instead of calling
  // handleProjectChange.
  const handlerStart = NEW_TICKET_PAGE_SRC.indexOf('const handleProjectChange = useCallback')
  const handlerEnd = NEW_TICKET_PAGE_SRC.indexOf('\n  }, [', handlerStart)
  const handlerBody = NEW_TICKET_PAGE_SRC.slice(handlerStart, handlerEnd)
  assert.match(handlerBody, /setSelectedModuleId\(''\)/, 'user picking a new project must clear the stale module')

  const loadStart = NEW_TICKET_PAGE_SRC.indexOf('async function load()')
  const loadEnd = NEW_TICKET_PAGE_SRC.indexOf('\n    load()', loadStart)
  const loadBody = NEW_TICKET_PAGE_SRC.slice(loadStart, loadEnd)
  assert.ok(
    !loadBody.includes('handleProjectChange'),
    'the restore path must fetch modules itself, never via handleProjectChange (which clears the module)',
  )
  // Ordering guarantee: the restored module id is applied only AFTER the
  // freshly fetched module list has been set, so the value always exists in
  // the list the Select renders from.
  const setModulesIdx = loadBody.indexOf('setModules(mods)')
  const setModuleIdx = loadBody.indexOf('setSelectedModuleId(restoredModuleId)')
  assert.ok(setModulesIdx !== -1 && setModuleIdx !== -1 && setModuleIdx > setModulesIdx,
    'module restore must apply after setModules(mods) so the option list exists')
})

test('restore-simple-fields effect runs after the initial-load effect and restores every dropdown field', () => {
  const loadEffectStart = NEW_TICKET_PAGE_SRC.indexOf('useEffect(() => {\n    async function load()')
  const restoreStart = NEW_TICKET_PAGE_SRC.indexOf('useEffect(() => {\n    const draft = loadTicketDraft()')
  assert.ok(loadEffectStart !== -1, 'initial-load effect exists')
  assert.ok(restoreStart !== -1, 'simple-fields restore effect exists')
  assert.ok(
    restoreStart > loadEffectStart,
    'simple-fields restore must be declared after load() so saved priority/category/environment win over defaults',
  )
  const restoreEnd = NEW_TICKET_PAGE_SRC.indexOf('\n  }, [])', restoreStart)
  const restoreBody = NEW_TICKET_PAGE_SRC.slice(restoreStart, restoreEnd)
  for (const field of ['priority', 'category', 'environment', 'additionalInfo']) {
    assert.match(restoreBody, new RegExp(`draft\\.${field}`), `restore effect must apply "${field}"`)
  }
})

test('draft save payload keys exactly match the restore contract (no ID/label drift)', () => {
  const saveStart = NEW_TICKET_PAGE_SRC.indexOf('function saveDraft()')
  const saveEnd = NEW_TICKET_PAGE_SRC.indexOf('\n  }', saveStart)
  const saveBody = NEW_TICKET_PAGE_SRC.slice(saveStart, saveEnd)
  // Dropdowns emit ids/keys: clientId/projectId/moduleId are ids, priority/category/environment are value keys
  for (const key of ['priority', 'category', 'environment', 'clientId: selectedClientId', 'projectId: selectedProjectId', 'moduleId: selectedModuleId']) {
    assert.ok(saveBody.includes(key), `saveDraft() must persist "${key}"`)
  }
})

test('restore resolves every dropdown against the list it will render from (fresh fetch, not stale state)', () => {
  const loadStart = NEW_TICKET_PAGE_SRC.indexOf('async function load()')
  const loadEnd = NEW_TICKET_PAGE_SRC.indexOf('\n    load()', loadStart)
  const loadBody = NEW_TICKET_PAGE_SRC.slice(loadStart, loadEnd)
  // Client resolved against clientList (just fetched), Project against projs, Module against mods
  assert.match(loadBody, /resolveDraftSelection\(draft\?\.clientId, clientList, \(c\) => c\.id\)/)
  assert.match(loadBody, /resolveDraftSelection\(draft\?\.projectId, projs, \(p\) => p\.id\)/)
  assert.match(loadBody, /resolveDraftSelection\(draft\?\.moduleId, mods, \(m\) => m\.id\)/)
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

// ─── Requirement #12: an invalid/stale saved selection is CLEARED, never ──
// silently replaced by the Support-project/module default or any other
// fallback. This is the exact decision the page makes for Project/Module:
//   resolveDraftSelection(...) -> null (id no longer in the list)
//   hasDraftSelection(...)     -> true (the draft DID save something)
//   => the "no draft selection at all" auto-fallback branch must be SKIPPED,
//      leaving the field cleared instead of defaulting to "Support".

test('invalid saved Project id: resolves to null, and the page\'s own fallback chain (no URL param) leaves it cleared', () => {
  const draft = { projectId: '999' } // no longer exists in the fetched list
  const projs = [{ id: 1, projectName: 'Alpha' }, { id: 2, projectName: 'Support' }]
  const resolved = resolveDraftSelection(draft.projectId, projs, (p) => p.id)
  assert.equal(resolved, null, 'stale id must not resolve')
  assert.equal(hasDraftSelection(draft, 'projectId'), true, 'the draft DID save a project, so this is not "no selection at all"')

  // Reproduce the page's exact fallback chain (app/dashboard/tickets/new/page.tsx):
  //   let selectedProjId = resolveDraftSelection(...)
  //   if (selectedProjId) {}
  //   else if (urlParam && found) { selectedProjId = urlParam }
  //   else if (!hasDraftSelection(draft, 'projectId')) { auto-select Support }
  const urlParam: string | null = null
  let selectedProjId: string | null = resolved
  if (selectedProjId) {
    // restored from draft
  } else if (urlParam && projs.find((p) => String(p.id) === urlParam)) {
    selectedProjId = urlParam
  } else if (!hasDraftSelection(draft, 'projectId')) {
    const supportProject = projs.find((p) => p.projectName.toLowerCase().includes('support'))
    if (supportProject) selectedProjId = String(supportProject.id)
  }
  assert.equal(selectedProjId, null, 'an invalid saved project must be left cleared, never silently defaulted to Support')
})

test('invalid saved Module id: resolves to null and the Support-fallback stays gated off (field is cleared, not defaulted)', () => {
  const draft = { moduleId: '999' }
  const mods = [{ id: 10, moduleName: 'Support' }]
  const resolved = resolveDraftSelection(draft.moduleId, mods, (m) => m.id)
  assert.equal(resolved, null)
  assert.equal(hasDraftSelection(draft, 'moduleId'), true)
})

test('genuinely empty draft (no saved project/module at all) DOES still get the normal new-ticket Support default', () => {
  // Requirement #11 — normal new-ticket defaults must be preserved for a
  // brand-new ticket (no draft) or a draft that explicitly saved nothing.
  const emptyDraft = { title: 'no dropdowns picked yet' }
  assert.equal(hasDraftSelection(emptyDraft, 'projectId'), false)
  assert.equal(hasDraftSelection(emptyDraft, 'moduleId'), false)
  assert.equal(hasDraftSelection(null, 'projectId'), false, 'a brand-new ticket (no draft) must also get the normal default')
})

// ─── Environment / Category / Priority — explicit, non-default restoration ─

test('Environment restores a non-default saved value exactly (static options, no async dependency)', () => {
  resetStorage()
  saveTicketDraft({ environment: 'testing' })
  const reloaded = loadTicketDraft()
  assert.equal(reloaded?.environment, 'testing', 'Environment has no async option list, so it has no excuse to fail restoration')
})

test('Category and Priority restore their saved non-default values and never fall back to general/medium', () => {
  resetStorage()
  saveTicketDraft({ category: 'integration', priority: 'urgent' })
  const reloaded = loadTicketDraft()
  assert.equal(reloaded?.category, 'integration')
  assert.notEqual(reloaded?.category, 'general', 'must not have silently reverted to the General default')
  assert.equal(reloaded?.priority, 'urgent')
  assert.notEqual(reloaded?.priority, 'medium', 'must not have silently reverted to the MEDIUM default')
})

test('restore effect applies priority/category/environment unconditionally (not gated behind any async list)', () => {
  // Unlike Client/Project/Module, these three have no "does it still exist in
  // a fetched list" concern (Category/Priority come from static config
  // objects; Environment from a hardcoded option list) — the restore effect
  // must set them directly from the draft with no resolveDraftSelection call.
  const restoreStart = NEW_TICKET_PAGE_SRC.indexOf('useEffect(() => {\n    const draft = loadTicketDraft()')
  const restoreEnd = NEW_TICKET_PAGE_SRC.indexOf('\n  }, [])', restoreStart)
  const restoreBody = NEW_TICKET_PAGE_SRC.slice(restoreStart, restoreEnd)
  assert.match(restoreBody, /setPriority\(draft\.priority as TicketPriority\)/)
  assert.match(restoreBody, /setCategory\(draft\.category as TicketCategory\)/)
  assert.match(restoreBody, /setEnvironment\(draft\.environment\)/)
})

// ─── No timeouts / race-condition hacks in the restore path ────────────────

test('regression: no setTimeout/setInterval is used anywhere in the draft restore or save logic', () => {
  const loadStart = NEW_TICKET_PAGE_SRC.indexOf('async function load()')
  const loadEnd = NEW_TICKET_PAGE_SRC.indexOf('\n    load()', loadStart)
  const loadBody = NEW_TICKET_PAGE_SRC.slice(loadStart, loadEnd)
  const restoreStart = NEW_TICKET_PAGE_SRC.indexOf('useEffect(() => {\n    const draft = loadTicketDraft()')
  const restoreEnd = NEW_TICKET_PAGE_SRC.indexOf('\n  }, [])', restoreStart)
  const restoreBody = NEW_TICKET_PAGE_SRC.slice(restoreStart, restoreEnd)
  assert.ok(!loadBody.includes('setTimeout') && !loadBody.includes('setInterval'))
  assert.ok(!restoreBody.includes('setTimeout') && !restoreBody.includes('setInterval'))
})
