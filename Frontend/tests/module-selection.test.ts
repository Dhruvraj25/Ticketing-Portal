import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateModuleSelection } from '../lib/module-selection.ts'

// ============================================================================
// Phase 4 — Module / Service Area selection: pure validation unit tests.
// ============================================================================

// ─── Requirement 1 & 3: module is never required ───────────────────────────

test('no module selected is always valid (module is optional)', () => {
  const result = validateModuleSelection({
    moduleProjectId: null,
    selectedProjectId: 5,
    allowedProjectIdsForClient: [],
  })
  assert.deepEqual(result, { valid: true })
})

test('no module selected is valid even with no project and no client projects', () => {
  const result = validateModuleSelection({
    moduleProjectId: null,
    selectedProjectId: null,
    allowedProjectIdsForClient: [],
  })
  assert.deepEqual(result, { valid: true })
})

// ─── Requirement 2 & 4: valid module, project selected ─────────────────────

test('a module belonging to the selected project is valid', () => {
  const result = validateModuleSelection({
    moduleProjectId: 5,
    selectedProjectId: 5,
    allowedProjectIdsForClient: [],
  })
  assert.deepEqual(result, { valid: true })
})

// ─── Requirement 5: invalid module — wrong project ─────────────────────────

test('a module belonging to a DIFFERENT project than the one selected is rejected', () => {
  const result = validateModuleSelection({
    moduleProjectId: 7,
    selectedProjectId: 5,
    allowedProjectIdsForClient: [5, 7],
  })
  assert.equal(result.valid, false)
  if (!result.valid) assert.match(result.error, /does not belong to the selected project/)
})

test('a module belonging to a project of a DIFFERENT client is rejected even when that project is not selected', () => {
  // e.g. moduleProjectId 99 belongs to some other client entirely — it must
  // never validate just because no specific project was chosen.
  const result = validateModuleSelection({
    moduleProjectId: 99,
    selectedProjectId: null,
    allowedProjectIdsForClient: [5, 7],
  })
  assert.equal(result.valid, false)
  if (!result.valid) assert.match(result.error, /does not belong to the selected client/)
})

// ─── Requirement 1 & 2: no project selected — module must be one of the client's ─

test('no project selected: a module belonging to ANY of the client\'s projects is valid', () => {
  const result = validateModuleSelection({
    moduleProjectId: 7,
    selectedProjectId: null,
    allowedProjectIdsForClient: [5, 7, 12],
  })
  assert.deepEqual(result, { valid: true })
})

test('no project selected: a module belonging to none of the client\'s projects is rejected', () => {
  const result = validateModuleSelection({
    moduleProjectId: 42,
    selectedProjectId: null,
    allowedProjectIdsForClient: [5, 7, 12],
  })
  assert.equal(result.valid, false)
})

// ─── Cross-tenant guard: a project-scoped module cannot be smuggled in when ─
// the client picks a DIFFERENT one of their own projects ────────────────────

test('a project selected: even a module belonging to a DIFFERENT project of the SAME client is rejected (must match exactly)', () => {
  const result = validateModuleSelection({
    moduleProjectId: 7,
    selectedProjectId: 5,
    allowedProjectIdsForClient: [5, 7], // both belong to the same client
  })
  assert.equal(result.valid, false, 'a selected project narrows to THAT project only, not the whole client')
})
