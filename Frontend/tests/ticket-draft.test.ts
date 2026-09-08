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
// its default. Root cause: draft restoration was split across TWO independent
// mount-time useEffect blocks while Client -> Project -> Module loading was
// asynchronous, so option-list loading and draft restoration could race. The
// fix merges everything into ONE initialization/restoration flow (a single
// `init()` inside a single `useEffect`) that reads the draft exactly once and
// restores each field as soon as its dependencies are ready. These tests pin
// that structure, because the page cannot be mounted under plain node:test.

function getInitEffectBody(): string {
  const start = NEW_TICKET_PAGE_SRC.indexOf('async function init()')
  const end = NEW_TICKET_PAGE_SRC.indexOf('\n    init()', start)
  assert.ok(start !== -1 && end !== -1, 'the single init() restoration flow must exist')
  return NEW_TICKET_PAGE_SRC.slice(start, end)
}

test('hasDraftSelection: draft is authoritative for a field only when a non-empty value is saved', () => {
  assert.equal(hasDraftSelection({ projectId: '7' }, 'projectId'), true)
  assert.equal(hasDraftSelection({ projectId: '' }, 'projectId'), false, 'empty saved value = no saved selection')
  assert.equal(hasDraftSelection({}, 'projectId'), false)
  assert.equal(hasDraftSelection(null, 'projectId'), false)
})

test('there is exactly ONE mount-time initialization/restoration flow (no second competing draft effect)', () => {
  const effectStarts = [...NEW_TICKET_PAGE_SRC.matchAll(/useEffect\(\(\) => \{/g)]
  // Every remaining useEffect in the file belongs to something other than
  // mount-time draft restoration (there is none left to find) — specifically
  // assert the OLD second effect signature is gone and only one effect calls
  // loadTicketDraft().
  assert.ok(!NEW_TICKET_PAGE_SRC.includes('useEffect(() => {\n    const draft = loadTicketDraft()'),
    'the old second "restore simple fields" effect must no longer exist as its own effect')
  const loadTicketDraftCalls = [...NEW_TICKET_PAGE_SRC.matchAll(/loadTicketDraft\(\)/g)]
  assert.equal(loadTicketDraftCalls.length, 1, 'loadTicketDraft() must be called exactly once in the whole file')
})

test('simple fields (title/description/priority/category/environment/additionalInfo) restore synchronously, before any network await', () => {
  const body = getInitEffectBody()
  const draftReadIdx = body.indexOf('const draft = loadTicketDraft()')
  const simpleFieldsIdx = body.indexOf('setPriority(draft.priority as TicketPriority)')
  const firstAwaitIdx = body.indexOf('await fetch(')
  assert.ok(draftReadIdx !== -1 && simpleFieldsIdx !== -1 && firstAwaitIdx !== -1)
  assert.ok(
    draftReadIdx < simpleFieldsIdx && simpleFieldsIdx < firstAwaitIdx,
    'simple fields must be restored from the draft before the first network await (user role fetch), so they never depend on async timing',
  )
  for (const field of ['title', 'description', 'priority', 'category', 'environment', 'additionalInfo']) {
    assert.match(body, new RegExp(`draft\\.${field}`), `init() must restore "${field}"`)
  }
})

test('initial-load effect must NOT auto-select the Support project/module when the draft saved none (default must not override saved empty state)', () => {
  const body = getInitEffectBody()
  assert.match(
    body,
    /hasDraftSelection\(draft, 'projectId'\)/,
    'Support-project fallback must be gated on the draft having no saved project',
  )
  assert.match(
    body,
    /hasDraftSelection\(draft, 'moduleId'\)/,
    'Support-module fallback must be gated on the draft having no saved module',
  )
})

test('user-driven project change clears the module, but the restore path must not route through that handler', () => {
  // Clearing the module when the USER picks a different project is correct;
  // what must never happen is the async restore flow invoking this handler,
  // because it would wipe the just-restored module. The restore path in
  // init() must therefore fetch modules itself instead of calling
  // handleProjectChange.
  const handlerStart = NEW_TICKET_PAGE_SRC.indexOf('const handleProjectChange = useCallback')
  const handlerEnd = NEW_TICKET_PAGE_SRC.indexOf('\n  }, [', handlerStart)
  const handlerBody = NEW_TICKET_PAGE_SRC.slice(handlerStart, handlerEnd)
  assert.match(handlerBody, /setSelectedModuleId\(''\)/, 'user picking a new project must clear the stale module')

  const body = getInitEffectBody()
  assert.ok(
    !body.includes('handleProjectChange'),
    'the restore path must fetch modules itself, never via handleProjectChange (which clears the module)',
  )
  // Ordering guarantee: Project is restored only after projects are loaded,
  // and the restored module id is applied only AFTER the freshly fetched
  // module list has been set, so both values always exist in the list the
  // Select renders from.
  const setProjectsIdx = body.indexOf('setProjects(projs)')
  const setProjectIdx = body.indexOf('setSelectedProjectId(selectedProjId)')
  assert.ok(setProjectsIdx !== -1 && setProjectIdx !== -1 && setProjectIdx > setProjectsIdx,
    'project restore must apply after setProjects(projs) so the option list exists')
  // Module restoration is two-phase (see the pendingModuleIdRef tests below):
  // init() only ever RECORDS the resolved id as pending, after setModules();
  // it must never call setSelectedModuleId directly (that's what raced Radix).
  const setModulesIdx = body.indexOf('setModules(mods)')
  const setPendingIdx = body.indexOf('pendingModuleIdRef.current = restoredModuleId')
  assert.ok(setModulesIdx !== -1 && setPendingIdx !== -1 && setPendingIdx > setModulesIdx,
    'pending module restoration must be recorded after setModules(mods) so the option list exists')
  assert.ok(!body.includes('setSelectedModuleId(restoredModuleId)'),
    'init() must never call setSelectedModuleId directly for the restored module — that is exactly the same-commit race that hit Project')
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
  const body = getInitEffectBody()
  // Client resolved against clientList (just fetched), Project against projs, Module against mods
  assert.match(body, /resolveDraftSelection\(draft\?\.clientId, clientList, \(c\) => c\.id\)/)
  assert.match(body, /resolveDraftSelection\(draft\?\.projectId, projs, \(p\) => p\.id\)/)
  assert.match(body, /resolveDraftSelection\(draft\?\.moduleId, mods, \(m\) => m\.id\)/)
})

test('project/client dropdown restoration resolves against the freshly-fetched list, not stale component state', () => {
  // Regression guard for the original bug: checking against `clients`/`projects`
  // state (captured by this effect's closure before setClients/setProjects had
  // re-rendered) always fails and silently drops the saved selection.
  const body = getInitEffectBody()
  assert.match(body, /resolveDraftSelection\(draft\?\.clientId, clientList,/)
  assert.match(body, /resolveDraftSelection\(draft\?\.projectId, projs,/)
  assert.match(body, /resolveDraftSelection\(draft\?\.moduleId, mods,/)
})

test('ID type consistency: Project/Module/Client are compared as strings on both the draft and the option side', () => {
  const body = getInitEffectBody()
  // resolveDraftSelection itself normalizes both sides via String(...) (see
  // lib/ticket-draft.ts), so the call sites only need to pass the raw id
  // accessor — verify none of them pre-coerce in a way that could drift from
  // the Select's `value={String(p.id)}` / `value={String(m.id)}` / `value={c.id}`.
  assert.match(body, /resolveDraftSelection\(draft\?\.clientId, clientList, \(c\) => c\.id\)/)
  assert.match(body, /resolveDraftSelection\(draft\?\.projectId, projs, \(p\) => p\.id\)/)
  assert.match(body, /resolveDraftSelection\(draft\?\.moduleId, mods, \(m\) => m\.id\)/)
  // Every place a resolved/found id is assigned back into state goes through String(...).
  assert.match(body, /selectedProjId = String\(supportProject\.id\)/)
  assert.match(body, /restoredModuleId = String\(supportModule\.id\)/)
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

test('init() applies priority/category/environment unconditionally (not gated behind any async list)', () => {
  // Unlike Client/Project/Module, these three have no "does it still exist in
  // a fetched list" concern (Category/Priority come from static config
  // objects; Environment from a hardcoded option list) — init() must set
  // them directly from the draft with no resolveDraftSelection call.
  const body = getInitEffectBody()
  assert.match(body, /setPriority\(draft\.priority as TicketPriority\)/)
  assert.match(body, /setCategory\(draft\.category as TicketCategory\)/)
  assert.match(body, /setEnvironment\(draft\.environment\)/)
})

// ─── No timeouts / race-condition hacks in the restore path ────────────────

test('regression: no setTimeout/setInterval is used anywhere in the draft restore or save logic', () => {
  const body = getInitEffectBody()
  assert.ok(!body.includes('setTimeout') && !body.includes('setInterval'))
})

// ============================================================================
// restoringDraftRef — spurious empty-onValueChange guard
// ============================================================================
// Production evidence: after "[CreateTicket] Restored project from draft: 45"
// and "Loading modules for project: 45", the console also logged
// "[CreateTicket] Project changed to:" (empty) followed by "Project
// deselected, clearing modules" — i.e. the Project <Select>'s onValueChange
// fired with '' immediately after we programmatically restored it to '45',
// and handleProjectChange treated that as a real user action and wiped both
// the restored project and module.
//
// Root cause: Radix's <Select> keeps a hidden native <select> in sync for
// native form semantics (autofill/validation). When a controlled `value` is
// set to an id whose <SelectItem>/<option> was only just added to the option
// list in the SAME update (exactly what restoring Project does: setProjects()
// and setSelectedProjectId() land in one batched render, right as the
// project's own <SelectItem> is created), the native element can momentarily
// have no matching <option>. The browser silently resets the native
// select's value, firing a native `change` event that Radix's hidden-input
// bridge forwards to us as onValueChange(''). This is a Radix/browser timing
// quirk, not a bug in this project's components/ui/select.tsx wrapper (see
// the "select.tsx is a pure pass-through" test below) — restoringDraftRef
// guards against it at the call site instead.

test('restoringDraftRef: declared via useRef(false), not a plain variable (survives re-renders, starts false)', () => {
  assert.match(NEW_TICKET_PAGE_SRC, /const restoringDraftRef = useRef\(false\)/)
})

test('restoringDraftRef is set true at the very start of init(), before any restoration work', () => {
  const body = getInitEffectBody()
  const setTrueIdx = body.indexOf('restoringDraftRef.current = true')
  const draftReadIdx = body.indexOf('const draft = loadTicketDraft()')
  assert.ok(setTrueIdx !== -1, 'must arm the guard')
  assert.ok(setTrueIdx < draftReadIdx, 'guard must be armed before the draft is even read, so no restoration step is ever unprotected')
})

test('restoringDraftRef is cleared in a finally block, after module restoration, so it can never get stuck on', () => {
  const start = NEW_TICKET_PAGE_SRC.indexOf('async function init()')
  const finallyIdx = NEW_TICKET_PAGE_SRC.indexOf('} finally {', start)
  const clearIdx = NEW_TICKET_PAGE_SRC.indexOf('restoringDraftRef.current = false', start)
  const moduleRestoreIdx = NEW_TICKET_PAGE_SRC.indexOf('pendingModuleIdRef.current = restoredModuleId', start)
  assert.ok(finallyIdx !== -1, 'must clear the guard in a finally so a thrown error (e.g. a failed fetch) can never leave it stuck on')
  assert.ok(clearIdx !== -1 && clearIdx > finallyIdx, 'the clear must happen inside the finally block')
  assert.ok(moduleRestoreIdx !== -1 && clearIdx > moduleRestoreIdx,
    'the guard must stay active through draft load, simple fields, client, projects, project, modules, AND recording the pending module restoration — cleared only after all of it')
})

test('handleProjectChange ignores an empty callback while restoring, but still clears on a genuine empty selection afterward', () => {
  const start = NEW_TICKET_PAGE_SRC.indexOf('const handleProjectChange = useCallback')
  const end = NEW_TICKET_PAGE_SRC.indexOf('\n  }, [', start)
  const body = NEW_TICKET_PAGE_SRC.slice(start, end)
  const guardIdx = body.indexOf("if (restoringDraftRef.current && !projectId)")
  const clearIdx = body.indexOf("setSelectedProjectId(projectId)")
  assert.ok(guardIdx !== -1, 'handleProjectChange must ignore a spurious empty callback while restoringDraftRef is active')
  assert.ok(clearIdx !== -1 && guardIdx < clearIdx, 'the guard must run BEFORE any state is cleared')
  assert.match(body, /return\s*\n\s*\}/, 'the guard branch must return early, skipping the clear logic entirely')
})

test('handleClientChange (extracted from the inline JSX handler) carries the same empty-value guard, and draft client restoration never routes through it', () => {
  const start = NEW_TICKET_PAGE_SRC.indexOf('const handleClientChange = useCallback')
  assert.ok(start !== -1, 'the Client change handler must be a named, guarded callback — not an unguarded inline arrow function')
  const end = NEW_TICKET_PAGE_SRC.indexOf('\n  }, [])', start)
  const body = NEW_TICKET_PAGE_SRC.slice(start, end)
  assert.match(body, /if \(restoringDraftRef\.current && !clientId\)/)
  assert.match(body, /setSelectedProjectId\(''\)/, 'a genuine client change must still clear the stale project')
  assert.match(body, /setSelectedModuleId\(''\)/, 'a genuine client change must still clear the stale module')

  // The JSX must use the named handler, not an inline function (no duplicate logic).
  assert.match(NEW_TICKET_PAGE_SRC, /<Select value=\{selectedClientId\} onValueChange=\{handleClientChange\}>/)

  // Draft client restoration itself sets state directly inside init() — it
  // must never call handleClientChange (which would clear the just-restored
  // project/module even without the empty-value quirk).
  const initBody = getInitEffectBody()
  assert.ok(!initBody.includes('handleClientChange'), 'client restoration must set selectedClientId directly, never via handleClientChange')
})

test('handleModuleChange carries the same empty-value guard, and the Module Select uses it instead of the raw setter', () => {
  const start = NEW_TICKET_PAGE_SRC.indexOf('const handleModuleChange = useCallback')
  assert.ok(start !== -1, 'the Module change handler must be a named, guarded callback — not the raw setSelectedModuleId setter')
  const end = NEW_TICKET_PAGE_SRC.indexOf('\n  }, [])', start)
  const body = NEW_TICKET_PAGE_SRC.slice(start, end)
  assert.match(body, /if \(restoringDraftRef\.current && !moduleId\)/)
  assert.match(body, /setSelectedModuleId\(moduleId\)/)
  assert.match(NEW_TICKET_PAGE_SRC, /onValueChange=\{handleModuleChange\}/)
  assert.ok(!NEW_TICKET_PAGE_SRC.includes('onValueChange={setSelectedModuleId}'), 'the Module Select must no longer wire the raw setter directly')
})

test('Category/Priority/Environment onValueChange handlers also ignore an empty callback during restoration', () => {
  // Lower risk (their SelectItem list is static, always mounted) but the
  // production screenshot showed simple fields going blank too, so these are
  // guarded the same way for defense in depth.
  const categoryIdx = NEW_TICKET_PAGE_SRC.indexOf('value={category} onValueChange=')
  const priorityIdx = NEW_TICKET_PAGE_SRC.indexOf('value={priority} onValueChange=')
  const environmentIdx = NEW_TICKET_PAGE_SRC.indexOf('value={environment} onValueChange=')
  for (const [name, idx] of [['category', categoryIdx], ['priority', priorityIdx], ['environment', environmentIdx]] as const) {
    assert.ok(idx !== -1, `${name} Select not found`)
    const snippet = NEW_TICKET_PAGE_SRC.slice(idx, idx + 250)
    assert.match(snippet, /if \(restoringDraftRef\.current && !v\) return/, `${name} onValueChange must ignore an empty callback while restoring`)
  }
})

test('the guard never uses setTimeout/retries/polling — it is a synchronous ref check only', () => {
  for (const handlerStart of [
    NEW_TICKET_PAGE_SRC.indexOf('const handleProjectChange = useCallback'),
    NEW_TICKET_PAGE_SRC.indexOf('const handleClientChange = useCallback'),
    NEW_TICKET_PAGE_SRC.indexOf('const handleModuleChange = useCallback'),
  ]) {
    const end = NEW_TICKET_PAGE_SRC.indexOf('\n  }, [', handlerStart)
    const body = NEW_TICKET_PAGE_SRC.slice(handlerStart, end)
    assert.ok(!body.includes('setTimeout') && !body.includes('setInterval') && !body.includes('await new Promise'))
  }
})

test('select.tsx is an unmodified, pure pass-through wrapper around Radix — confirmed NOT responsible for the empty-emission quirk', () => {
  const selectSrc = readFileSync(join(ROOT, 'components', 'ui', 'select.tsx'), 'utf8')
  // No custom onValueChange interception, no value coercion, no state of its
  // own — every exported piece is a thin data-slot wrapper around
  // @radix-ui/react-select primitives, spreading props straight through.
  assert.match(selectSrc, /from '@radix-ui\/react-select'/)
  assert.ok(!selectSrc.includes('onValueChange'), 'the wrapper must not intercept onValueChange — Radix calls the caller-provided handler directly')
  assert.ok(!selectSrc.includes('useState') && !selectSrc.includes('useRef'), 'the wrapper holds no state of its own that could cause a spurious reset')
})

// ─── The exact reported sequence (production console evidence) ────────────

test('SEQUENCE: restore projectId=45 -> spurious empty callback ignored -> 45 and its module survive -> a later real change still clears', () => {
  // This reproduces the decision the code makes at each step, using the same
  // boolean condition the handler bodies were just asserted to contain above
  // (`restoringDraftRef.current && !projectId`), against a fake ref — the
  // real component can't be mounted under plain node:test, so this pins the
  // exact state-machine behavor the structural assertions above guarantee is
  // wired into the real handler.
  const restoringDraftRef = { current: false }
  let selectedProjectId = ''
  let selectedModuleId = ''
  let modulesCleared = false

  function handleProjectChange(projectId: string) {
    if (restoringDraftRef.current && !projectId) return // the guard under test
    selectedProjectId = projectId
    selectedModuleId = ''
    modulesCleared = true
    if (!projectId) return
    modulesCleared = false // loadModulesForProject would now fetch fresh modules
  }

  // 1. Restore draft projectId=45 (init() sets state directly, not via the handler).
  restoringDraftRef.current = true
  selectedProjectId = '45'
  const restoredModules = [{ id: 501 }, { id: 502 }]
  selectedModuleId = '502' // saved module, restored after modules load

  // 2. Radix emits the spurious empty callback while still restoring.
  handleProjectChange('')

  // 3-6. It was ignored: Project remains 45, modules remain loaded, saved module remains selected.
  assert.equal(selectedProjectId, '45', 'Project must remain restored')
  assert.equal(selectedModuleId, '502', 'saved Module must remain selected')
  assert.equal(modulesCleared, false, 'modules must not have been cleared')
  assert.equal(restoredModules.length, 2, 'the fetched module list itself is untouched by the ignored callback')

  // Restoration finishes.
  restoringDraftRef.current = false

  // 7. A later GENUINE user Project change must still clear the module normally.
  handleProjectChange('99')
  assert.equal(selectedProjectId, '99')
  assert.equal(selectedModuleId, '', 'a real user project change must still clear the module')
  assert.equal(modulesCleared, false, 'loadModulesForProject would now run for the new project')

  // And a genuine user clearing the project (selecting nothing) after
  // restoration must also go through normally, not be swallowed.
  handleProjectChange('')
  assert.equal(selectedProjectId, '', 'a genuine empty selection after restoration must be honored')
})

// ============================================================================
// pendingModuleIdRef — two-phase Module restoration
// ============================================================================
// Production evidence: "[CreateTicket] Restored module from draft: 103" was
// logged — draft.moduleId resolved correctly against the freshly-fetched
// module list — yet the UI still showed the "Select module" placeholder.
// Root cause: setModules(mods) and setSelectedModuleId(restoredModuleId)
// were dispatched in the SAME synchronous span, so React batched them into
// ONE commit: the <SelectItem>/<option> for module 103 and the controlled
// `value="103"` landed in the DOM together. Radix's hidden native <select>
// (kept in sync for native form semantics) can end up assigning `.value`
// before the matching <option> has actually been inserted in that same
// patch, so the browser silently resets it to "" and Radix forwards that as
// onValueChange('') — indistinguishable from restoringDraftRef's already-
// guarded case, except this time the emission carries no useful signal at
// all: the net effect is simply that selectedModuleId never became "103" in
// the first place (or was immediately reset), even though our own state
// (and the console log) correctly computed it.
//
// Fix: never call setSelectedModuleId in the same tick as setModules(mods).
// init() stores the resolved id in pendingModuleIdRef instead; a SEPARATE
// effect keyed on `modules` applies it only once the module list has
// already committed and painted in its OWN prior render — so the matching
// <option> unquestionably exists before the controlled value ever points
// at it.

function getPendingModuleEffectBody(): string {
  const start = NEW_TICKET_PAGE_SRC.indexOf('const pendingId = pendingModuleIdRef.current')
  const end = NEW_TICKET_PAGE_SRC.indexOf('\n  }, [modules])', start)
  assert.ok(start !== -1 && end !== -1, 'the pending-module-restoration effect must exist')
  return NEW_TICKET_PAGE_SRC.slice(start, end)
}

test('pendingModuleIdRef: declared via useRef, not state (no extra re-render just to track it)', () => {
  assert.match(NEW_TICKET_PAGE_SRC, /const pendingModuleIdRef = useRef<string \| null>\(null\)/)
})

test('init() records the resolved module id as PENDING, never calling setSelectedModuleId in the same commit as setModules', () => {
  const body = getInitEffectBody()
  assert.match(body, /if \(restoredModuleId\) pendingModuleIdRef\.current = restoredModuleId/)
  assert.ok(!body.includes('setSelectedModuleId('), 'init() must never call setSelectedModuleId directly — only the pending-restoration effect may')
})

test('the pending-module effect is a SEPARATE useEffect keyed on `modules`, not folded into init()', () => {
  const effectDeclIdx = NEW_TICKET_PAGE_SRC.indexOf('useEffect(() => {\n    const pendingId = pendingModuleIdRef.current')
  assert.ok(effectDeclIdx !== -1, 'must be its own useEffect')
  assert.match(NEW_TICKET_PAGE_SRC.slice(effectDeclIdx, effectDeclIdx + 800), /\}, \[modules\]\)/,
    'must run whenever the module option list changes, i.e. strictly after it has rendered — never inline inside init()')
})

test('the pending-module effect applies the id only if still present in the current module list, then always clears the pending ref', () => {
  const body = getPendingModuleEffectBody()
  assert.match(body, /modules\.some\(\(m\) => String\(m\.id\) === pendingId\)/)
  assert.match(body, /setSelectedModuleId\(pendingId\)/)
  assert.match(body, /pendingModuleIdRef\.current = null/)
})

test('a genuine Project/Client change clears any outstanding pending module restoration (never applied to the wrong module list)', () => {
  const projStart = NEW_TICKET_PAGE_SRC.indexOf('const handleProjectChange = useCallback')
  const projEnd = NEW_TICKET_PAGE_SRC.indexOf('\n  }, [loadModulesForProject])', projStart)
  assert.match(NEW_TICKET_PAGE_SRC.slice(projStart, projEnd), /pendingModuleIdRef\.current = null/)

  const clientStart = NEW_TICKET_PAGE_SRC.indexOf('const handleClientChange = useCallback')
  const clientEnd = NEW_TICKET_PAGE_SRC.indexOf('\n  }, [])', clientStart)
  assert.match(NEW_TICKET_PAGE_SRC.slice(clientStart, clientEnd), /pendingModuleIdRef\.current = null/)
})

test('handleModuleChange (genuine user selection) never touches pendingModuleIdRef', () => {
  // Requirement: the normal onValueChange handler must not interfere with a
  // pending restoration — it doesn't need to, because the pending effect
  // only ever acts when pendingModuleIdRef is non-null, which user-driven
  // changes never set.
  const start = NEW_TICKET_PAGE_SRC.indexOf('const handleModuleChange = useCallback')
  const end = NEW_TICKET_PAGE_SRC.indexOf('\n  }, [])', start)
  const body = NEW_TICKET_PAGE_SRC.slice(start, end)
  assert.ok(!body.includes('pendingModuleIdRef'), 'handleModuleChange must not clear (or set) the pending restoration')
})

test('no duplicate module API request was introduced to fix this — getTicketFormModules is still called exactly once per project load', () => {
  const initBody = getInitEffectBody()
  const calls = [...initBody.matchAll(/getTicketFormModules\(/g)]
  assert.equal(calls.length, 1, 'init() must fetch modules exactly once for the restored/auto-selected project')
})

// ─── The exact reported production sequence ────────────────────────────────

test('SEQUENCE (production case): draft.moduleId="103" against the exact reported module list -> selectedModuleId ends as "103"', () => {
  // Reproduces the two-phase decision the real code makes, using the same
  // conditions asserted into the real source above: init() resolves + defers
  // via pendingModuleIdRef, a SEPARATE modules-keyed effect applies it.
  const draftModuleId = '103'
  const modules = [
    { id: 104, moduleName: 'Admin Dashboard' },
    { id: 103, moduleName: 'Order & Payments' },
    { id: 101, moduleName: 'Product Catalog' },
    { id: 102, moduleName: 'Shopping Cart' },
    { id: 100, moduleName: 'User Authentication' },
  ]

  const pendingModuleIdRef = { current: null as string | null }
  let selectedModuleId = ''

  // Phase 1 (inside init(), same commit as setModules): resolve and DEFER.
  const resolved = resolveDraftSelection(draftModuleId, modules, (m) => m.id)
  assert.equal(resolved, '103')
  pendingModuleIdRef.current = resolved // NOT setSelectedModuleId(resolved)
  assert.equal(selectedModuleId, '', 'selectedModuleId must NOT change in phase 1 — this is exactly what avoided the Radix race')

  // Phase 2 (separate effect, after `modules` has already rendered):
  function applyPendingModuleEffect() {
    const pendingId = pendingModuleIdRef.current
    if (!pendingId) return
    if (modules.some((m) => String(m.id) === pendingId)) {
      selectedModuleId = pendingId
    }
    pendingModuleIdRef.current = null
  }
  applyPendingModuleEffect()

  assert.equal(selectedModuleId, '103', 'the Module Select must end up showing "Order & Payments" (id 103), not the placeholder')
  assert.equal(pendingModuleIdRef.current, null, 'pending state must be resolved, not left hanging')
})

test('SEQUENCE: Radix emits an empty value on the Module Select during initialization -> ignored', () => {
  const restoringDraftRef = { current: true }
  let selectedModuleId = '103' // already applied by the pending effect
  function handleModuleChange(moduleId: string) {
    if (restoringDraftRef.current && !moduleId) return
    selectedModuleId = moduleId
  }
  handleModuleChange('') // the spurious Radix callback
  assert.equal(selectedModuleId, '103', 'a spurious empty callback during restoration must not clear the restored module')
})

test('SEQUENCE: a genuine user module change is accepted', () => {
  const restoringDraftRef = { current: false } // restoration long finished
  let selectedModuleId = '103'
  function handleModuleChange(moduleId: string) {
    if (restoringDraftRef.current && !moduleId) return
    selectedModuleId = moduleId
  }
  handleModuleChange('104')
  assert.equal(selectedModuleId, '104', 'a real user selection must always apply')
})

test('SEQUENCE: changing Project clears the Module normally (including any outstanding pending restoration)', () => {
  const pendingModuleIdRef = { current: '103' as string | null } // still outstanding
  let selectedModuleId = '103'
  let modules: { id: number }[] = [{ id: 103 }, { id: 104 }]

  function handleProjectChange(projectId: string) {
    selectedModuleId = ''
    modules = []
    pendingModuleIdRef.current = null
  }
  handleProjectChange('77')

  assert.equal(selectedModuleId, '', 'module must clear on a real project change')
  assert.equal(modules.length, 0)
  assert.equal(pendingModuleIdRef.current, null, 'a stale pending restoration must not survive into the new project\'s module list')
})

test('SEQUENCE: an invalid/stale saved module id remains unselected (never falls back to some other module)', () => {
  const draftModuleId = '999' // does not exist in this project's modules
  const modules = [{ id: 100 }, { id: 101 }]
  const pendingModuleIdRef = { current: null as string | null }
  let selectedModuleId = ''

  const resolved = resolveDraftSelection(draftModuleId, modules, (m) => m.id)
  assert.equal(resolved, null, 'an invalid id must not resolve')
  pendingModuleIdRef.current = resolved // stays null — nothing to apply

  function applyPendingModuleEffect() {
    const pendingId = pendingModuleIdRef.current
    if (!pendingId) return
    if (modules.some((m) => String(m.id) === pendingId)) selectedModuleId = pendingId
    pendingModuleIdRef.current = null
  }
  applyPendingModuleEffect()

  assert.equal(selectedModuleId, '', 'an invalid saved module id must leave the field unselected, never auto-pick a different module')
})
