import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Phase 4 — Module / Service Area selection: integration-shaped regression
// guards.
// ============================================================================
// createTicket()/getModulesForClient() are 'use server' modules importing
// '@/lib/db' — not importable directly under plain node:test (same
// constraint as tests/historical-ticket-integration.test.ts). These tests
// read the real source instead of re-implementing DB behavior. Pure
// validation logic itself is covered with real unit tests in
// tests/module-selection.test.ts.

const ROOT = join(import.meta.dirname, '..')
const UPDATE_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'update.ts'), 'utf8')
const CREATE_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'create.ts'), 'utf8')
const NEW_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'tickets', 'new', 'page.tsx'), 'utf8')
const TICKETS_INDEX_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'index.ts'), 'utf8')
const TICKET_DRAFT_TEST_SRC = readFileSync(join(ROOT, 'tests', 'ticket-draft.test.ts'), 'utf8')

function functionBody(src: string, startMarker: string): string {
  const start = src.indexOf(startMarker)
  assert.ok(start >= 0, `could not find "${startMarker}"`)
  return src.slice(start)
}

// ─── Requirement 4: client→project resolution uses the union-dedup pattern,
//     not a naive single-table match, and is shared (not duplicated) ───────

test('getClientProjectIds resolves BOTH direct project.clientId AND the project_client junction table, then dedupes into a Set', () => {
  const fnBody = functionBody(UPDATE_SRC, 'async function getClientProjectIds(')
  const fnBlock = fnBody.slice(0, fnBody.indexOf('\n}') + 2)
  assert.match(fnBlock, /eq\(project\.clientId, clientId\)/, 'must check direct project ownership')
  assert.match(fnBlock, /eq\(projectClient\.userId, clientId\)/, 'must check the project_client junction table (approver/secondary accounts)')
  assert.match(fnBlock, /new Set<number>/, 'must dedupe project ids — a project reachable both ways must not be double-counted')
})

test('getTicketFormProjects and getModulesForClient both call the SAME getClientProjectIds helper (no duplicated union query)', () => {
  const occurrences = UPDATE_SRC.match(/await getClientProjectIds\(/g) ?? []
  assert.equal(occurrences.length, 2, 'expected exactly two call sites: getTicketFormProjects and getModulesForClient')
})

test('getModulesForClient queries modules WHERE projectId IN (the resolved project id set) — never a bare/naive single match', () => {
  const fnBody = functionBody(UPDATE_SRC, 'export const getModulesForClient')
  const fnBlock = fnBody.slice(0, fnBody.indexOf('\n})') + 3)
  assert.match(fnBlock, /inArray\(moduleTable\.projectId, \[\.\.\.projectIds\]\)/)
})

// ─── Requirement 6: getModulesForClient never trusts a passed clientId for a
//     client-role caller's own identity ────────────────────────────────────

test('getModulesForClient resolves a client-role caller to their OWN id, ignoring any passed clientId argument', () => {
  const fnBody = functionBody(UPDATE_SRC, 'export const getModulesForClient')
  const fnBlock = fnBody.slice(0, fnBody.indexOf('\n})') + 3)
  assert.match(fnBlock, /currentUser\.role === 'client'[\s\S]{0,80}resolvedClientId = currentUser\.id/)
})

// ─── Requirement 10: admin/manager parity — same gate shape as getTicketFormClients ─

test('getModulesForClient serves BOTH admin and project_manager identically (no admin-only branch)', () => {
  const fnBody = functionBody(UPDATE_SRC, 'export const getModulesForClient')
  const fnBlock = fnBody.slice(0, fnBody.indexOf('\n})') + 3)
  assert.match(fnBlock, /currentUser\.role === 'admin' \|\| currentUser\.role === 'project_manager'/)
})

// ─── Requirement 9: createTicket() validates the module server-side, BEFORE
//     the ticket insert, using the pure validateModuleSelection() rule ─────

test('createTicket: a submitted moduleId is looked up and validated via validateModuleSelection before the ticket insert', () => {
  const moduleCheckIdx = CREATE_SRC.indexOf('if (data.moduleId) {')
  const insertIdx = CREATE_SRC.indexOf('.insert(ticket)')
  assert.ok(moduleCheckIdx >= 0 && insertIdx > moduleCheckIdx, 'module validation must run before any ticket insert')

  const validationBlock = CREATE_SRC.slice(moduleCheckIdx, CREATE_SRC.indexOf('const ticketNumber = generateTicketNumber()'))
  assert.match(validationBlock, /from\(moduleTable\)\.where\(eq\(moduleTable\.id, data\.moduleId\)\)/, 'must look up the actual module row, never trust a client-asserted projectId')
  assert.match(validationBlock, /throw new Error\('Invalid module selected'\)/)
  assert.match(validationBlock, /validateModuleSelection\(/)
  assert.match(validationBlock, /if \(!moduleCheck\.valid\) throw new Error\(moduleCheck\.error\)/)
})

test('createTicket: the module validation resolves allowed project ids via getTicketFormProjects(actualClientId) — the SAME client resolution used everywhere else, not a separate ad-hoc query', () => {
  const moduleCheckIdx = CREATE_SRC.indexOf('if (data.moduleId) {')
  const validationBlock = CREATE_SRC.slice(moduleCheckIdx, CREATE_SRC.indexOf('const ticketNumber = generateTicketNumber()'))
  assert.match(validationBlock, /getTicketFormProjects\(actualClientId\)/)
})

test('createTicket: module is optional — the validation block only runs when data.moduleId is truthy, and does not otherwise block ticket creation', () => {
  assert.match(CREATE_SRC, /if \(data\.moduleId\) \{/)
  // moduleId still flows through to the insert unconditionally as `?? null` — no required-ness check exists.
  assert.match(CREATE_SRC, /moduleId: data\.moduleId \?\? null/)
})

// ─── Requirement 1: module no longer required on the creation page ─────────

test('the creation page no longer blocks submission/step-advance on a missing module selection', () => {
  assert.doesNotMatch(NEW_PAGE_SRC, /Please select a module\./)
  // canGoNext must not require selectedModuleId (it still requires the other fields).
  const canGoNextIdx = NEW_PAGE_SRC.indexOf('const canGoNext =')
  const canGoNextLine = NEW_PAGE_SRC.slice(canGoNextIdx, NEW_PAGE_SRC.indexOf('\n', canGoNextIdx + 200))
  assert.doesNotMatch(canGoNextLine, /selectedModuleId/)
})

test('the creation page still submits moduleId conditionally (null when not selected), never coercing an empty string to NaN', () => {
  assert.match(NEW_PAGE_SRC, /moduleId: selectedModuleId \? Number\(selectedModuleId\) : null/)
})

test('the Module / Service Area label no longer carries a required-field asterisk', () => {
  const labelIdx = NEW_PAGE_SRC.indexOf('Module / Service Area')
  assert.ok(labelIdx >= 0)
  const labelBlock = NEW_PAGE_SRC.slice(labelIdx, labelIdx + 120)
  assert.doesNotMatch(labelBlock, /text-destructive">\*/)
  assert.match(labelBlock, /optional/i)
})

// ─── Requirement 8: Project's required-ness is UNCHANGED ───────────────────

test('the Project field required-check and required asterisk are unchanged', () => {
  assert.match(NEW_PAGE_SRC, /if \(!selectedProjectId\) \{\s*\n\s*setError\('Please select a project\.'\)/g)
  const projectLabelIdx = NEW_PAGE_SRC.indexOf('Project <span')
  assert.ok(projectLabelIdx >= 0, 'Project must still carry its required asterisk')
  // Exactly two "Please select a project." guards remain (handleSubmit + goToStep), matching the pre-Phase-4 shape.
  const occurrences = NEW_PAGE_SRC.match(/Please select a project\./g) ?? []
  assert.equal(occurrences.length, 2)
})

test('canGoNext still requires selectedProjectId (project business rules untouched)', () => {
  const canGoNextIdx = NEW_PAGE_SRC.indexOf('const canGoNext =')
  const canGoNextLine = NEW_PAGE_SRC.slice(canGoNextIdx, NEW_PAGE_SRC.indexOf('\n', canGoNextIdx + 200))
  assert.match(canGoNextLine, /selectedProjectId/)
})

// ─── Requirements 6 & 7: client-change and project-change reload modules,
//     never merge/append — always a fresh setModules(...) replacing the list ─

test('changing the project reloads modules: no project → getModulesForClient (all client modules), a project → getTicketFormModules (that project only)', () => {
  const fnBody = functionBody(NEW_PAGE_SRC, 'const handleProjectChange = useCallback')
  const fnBlock = fnBody.slice(0, fnBody.indexOf('}, ['))
  assert.match(fnBlock, /setSelectedModuleId\(''\)/, 'the previously selected module must always be cleared on project change')
  assert.match(fnBlock, /if \(!projectId\) \{[\s\S]*?loadModulesForClient\(selectedClientId\)/, 'no project selected must load ALL client modules, not clear to an empty disabled list')
  assert.match(fnBlock, /await loadModulesForProject\(projectId\)/, 'a selected project must still narrow to that project\'s modules')
})

test('changing the client reloads BOTH the project list and the module list, and clears the stale module selection', () => {
  const clientSelectIdx = NEW_PAGE_SRC.indexOf('<Select value={selectedClientId}')
  assert.ok(clientSelectIdx >= 0)
  const handlerBlock = NEW_PAGE_SRC.slice(clientSelectIdx, clientSelectIdx + 900)
  assert.match(handlerBlock, /setSelectedModuleId\(''\)/)
  assert.match(handlerBlock, /setModules\(\[\]\)/, 'must clear modules synchronously before the async reload lands, so a stale list from the previous client never renders mid-flight')
  assert.match(handlerBlock, /getModulesForClient\(clientId\)/)
  assert.match(handlerBlock, /setModules\(mods\)/)
})

// ─── Requirement 6/8: stale module never silently persists across a client ──
// or project change — selectedModuleId is unconditionally reset, not just
// left to be overwritten if the new list happens to still contain it ───────

test('stale module selection: selectedModuleId is reset on EVERY client change and EVERY project change, unconditionally', () => {
  const clientSelectIdx = NEW_PAGE_SRC.indexOf('<Select value={selectedClientId}')
  const clientHandlerBlock = NEW_PAGE_SRC.slice(clientSelectIdx, clientSelectIdx + 300)
  assert.match(clientHandlerBlock, /setSelectedClientId\(clientId\)\s*\n\s*setSelectedProjectId\(''\)\s*\n\s*setSelectedModuleId\(''\)/)

  const projectFnBody = functionBody(NEW_PAGE_SRC, 'const handleProjectChange = useCallback')
  const projectFnBlock = projectFnBody.slice(0, projectFnBody.indexOf('}, ['))
  assert.match(projectFnBlock, /setSelectedProjectId\(projectId\)\s*\n\s*setSelectedModuleId\(''\)/)
})

// ─── Requirement 10: admin/manager parity on the creation page ─────────────

test('the module/client fields are gated on isStaff (admin OR project_manager), not an admin-only check', () => {
  assert.match(NEW_PAGE_SRC, /const isStaff = userRole === 'admin' \|\| userRole === 'project_manager'/)
})

// ─── Barrel re-exports: getModulesForClient is reachable the same way every
//     other ticket form action is ───────────────────────────────────────────

test('getModulesForClient is re-exported from the tickets barrel alongside the other form-dropdown actions', () => {
  assert.match(TICKETS_INDEX_SRC, /getTicketFormModules,\s*\n\s*getModulesForClient,/)
})

// ─── Non-regression: getTicketFormModules's signature/behavior is untouched,
//     so ticket-draft.test.ts's existing assertions about it keep passing
//     for the SAME reason as before Phase 4 ─────────────────────────────────

test('getTicketFormModules still takes a required positional projectId — signature unchanged for existing callers/tests', () => {
  assert.match(UPDATE_SRC, /export const getTicketFormModules = wrapServerAction\('getTicketFormModules', async function getTicketFormModules\(projectId: number\)/)
})

test('ticket-draft.test.ts still references getTicketFormModules the same way it did before this phase (no signature drift to accommodate)', () => {
  assert.match(TICKET_DRAFT_TEST_SRC, /getTicketFormModules/)
})
