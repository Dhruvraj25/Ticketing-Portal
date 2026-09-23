import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// "PHASE 4" (7th implementation phase this session) — Part A/B/C: project user
// removal, cross-project isolation, and email-uniqueness race safety.
// app/actions/projects/users.ts is a 'use server' module importing '@/lib/db'
// — not importable directly under plain node:test (same constraint as every
// prior phase's *-integration.test.ts files). These tests read the real
// source instead of re-implementing DB behavior, so they fail the moment
// someone edits the authorization/scoping/error-handling logic out from
// under them.
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const USERS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'projects', 'users.ts'), 'utf8')
const ASSIGNMENTS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'projects', 'assignments.ts'), 'utf8')
const PROJECTS_INDEX_SRC = readFileSync(join(ROOT, 'app', 'actions', 'projects', 'index.ts'), 'utf8')
const PROJECTS_DEPRECATED_SRC = readFileSync(join(ROOT, 'app', 'actions', 'projects.ts'), 'utf8')
const SECTION_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'project-users-section.tsx'), 'utf8')
const DETAIL_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'projects', '[id]', 'page.tsx'), 'utf8')
const SCHEMA_SRC = readFileSync(join(ROOT, 'lib', 'db', 'schema.ts'), 'utf8')

function functionBody(src: string, startMarker: string): string {
  const start = src.indexOf(startMarker)
  assert.ok(start >= 0, `could not find "${startMarker}"`)
  const end = src.indexOf('\nexport const', start + startMarker.length)
  return src.slice(start, end === -1 ? undefined : end)
}

const removeUserBody = functionBody(USERS_SRC, 'export const removeUserFromProject')
const addUserBody = functionBody(USERS_SRC, 'export const addUserToProject')

// ─── Part A: authorization ──────────────────────────────────────────────────

test('removeUserFromProject: gated to project_manager/admin, not admin-only (matches addUserToProject)', () => {
  assert.match(removeUserBody, /currentUser\.role !== 'project_manager' && currentUser\.role !== 'admin'/)
  assert.match(removeUserBody, /throw new Error\('Only project managers and admins can remove users from a project'\)/)
})

test('case: unauthorized remove — the auth check runs before any DB write', () => {
  const authIdx = removeUserBody.indexOf("currentUser.role !== 'project_manager'")
  const deleteIdx = removeUserBody.indexOf('db.delete(projectClient)')
  assert.ok(authIdx >= 0 && deleteIdx > authIdx, 'authorization must be checked before the delete')
})

// ─── Part A: case-by-case error messages (never a generic fallback when a
//     specific one is knowable) ─────────────────────────────────────────────

test('case: project not found', () => {
  assert.match(removeUserBody, /if \(!p\) throw new Error\('Project not found\.'\)/)
})

test('case: user not found (distinct from "already removed")', () => {
  assert.match(removeUserBody, /if \(!targetUser\) throw new Error\('User not found\.'\)/)
})

test('case: already-removed user gets an explicit, distinct message', () => {
  assert.match(removeUserBody, /if \(!link\) throw new Error\('This user is not part of this project \(they may have already been removed\)\.'\)/)
})

test('case: "last required project membership" — the project\'s primary/owning client (project.clientId) cannot be removed', () => {
  assert.match(removeUserBody, /if \(userId === p\.clientId\)/)
  assert.match(removeUserBody, /cannot be removed from the project/)
})

test('project.clientId is NOT NULL — confirms the primary-owner guard is protecting a real data-integrity invariant, not a hypothetical', () => {
  const projectTableSrc = SCHEMA_SRC.slice(SCHEMA_SRC.indexOf("export const project = pgTable('project'"))
  const clientIdLine = projectTableSrc.slice(projectTableSrc.indexOf('clientId:'), projectTableSrc.indexOf('clientId:') + 120)
  assert.match(clientIdLine, /\.notNull\(\)/)
})

test('case: failed deletion — the generic catch returns a specific, actionable message, never "Something went wrong, try again later"', () => {
  const tryIdx = removeUserBody.indexOf('try {')
  const catchBlock = removeUserBody.slice(tryIdx)
  assert.match(catchBlock, /Could not remove this user from the project due to a database error\. Please try again\./)
  assert.doesNotMatch(catchBlock, /Something went wrong, try again later/i)
})

test('removeUserFromProject NEVER touches the user table — only project_client is deleted (deactivation is a separate, admin-only action)', () => {
  assert.doesNotMatch(removeUserBody, /db\.delete\(user\)/)
  assert.doesNotMatch(removeUserBody, /toggleUserBanned/)
  assert.match(removeUserBody, /db\.delete\(projectClient\)/)
})

test('project_client is a leaf junction table — no other table\'s foreign key references project_client.id (confirms no "database dependency error" scenario exists beyond the generic catch)', () => {
  assert.doesNotMatch(SCHEMA_SRC, /references\(\(\) => projectClient\.id/)
})

// ─── Part A: UI wiring — explicit membership-vs-account confirmation dialog ─

test('the Remove control is gated on canManage (project_manager/admin), not canActivate (admin-only)', () => {
  const removeButtonIdx = SECTION_SRC.indexOf('setRemoveTarget(u)')
  assert.ok(removeButtonIdx >= 0)
  const before = SECTION_SRC.slice(Math.max(0, removeButtonIdx - 400), removeButtonIdx)
  assert.match(before, /canManage && !u\.isPrimary/)
})

test('the confirmation dialog explicitly distinguishes project-membership removal from account deletion', () => {
  const dialogStart = SECTION_SRC.indexOf('Remove-from-project confirmation')
  assert.ok(dialogStart >= 0)
  const dialog = SECTION_SRC.slice(dialogStart, dialogStart + 1200)
  assert.match(dialog, /not[\s\S]*delete their user account/i)
  assert.match(dialog, /not affect any other project/i)
})

test('the confirmation dialog uses the Dialog component (not a bare window.confirm) — Part A explicitly requires clarity a one-line confirm cannot convey', () => {
  const dialogStart = SECTION_SRC.indexOf('Remove-from-project confirmation')
  const dialog = SECTION_SRC.slice(dialogStart, dialogStart + 800)
  assert.match(dialog, /<Dialog open=\{removeTarget/)
  assert.doesNotMatch(dialog, /window\.confirm/)
})

test('removeUserFromProject is re-exported from both the barrel and the deprecated compat shim', () => {
  assert.match(PROJECTS_INDEX_SRC, /export \{ getProjectClientUsers, addUserToProject, removeUserFromProject \} from '\.\/users'/)
  assert.match(PROJECTS_DEPRECATED_SRC, /removeUserFromProject,/)
})

// ─── Part C: email uniqueness — race-condition backstop ────────────────────

test('case: race-condition duplicate email — the new-account transaction is wrapped in try/catch and maps ANY unique-violation to the exact required message', () => {
  const txStart = addUserBody.indexOf('try {')
  assert.ok(txStart > 0)
  const txBlock = addUserBody.slice(txStart)
  assert.match(txBlock, /db\.transaction\(async \(tx\) => \{/)
  assert.match(txBlock, /msg\.includes\('unique'\) \|\| msg\.includes\('duplicate'\) \|\| msg\.includes\('23505'\)/)
  assert.match(txBlock, /throw new Error\('An account with this email already exists\.'\)/)
})

test('case: the race-condition catch never lets a raw Postgres error escape — there is an unconditional fallback error too', () => {
  const newAccountIdx = addUserBody.indexOf('Genuinely new account')
  const txStart = addUserBody.indexOf('} catch (err: any) {', newAccountIdx)
  assert.ok(txStart > newAccountIdx, 'expected a second, distinct catch block in the new-account branch')
  const catchBlock = addUserBody.slice(txStart, txStart + 1200)
  assert.match(catchBlock, /Could not create the new user account\. Please try again\./)
})

test('case: existing account — an email match short-circuits BEFORE the new-account/password code path (never recreates an existing user)', () => {
  const existingIdx = addUserBody.indexOf('if (existing) {')
  const newAccountIdx = addUserBody.indexOf('Genuinely new account')
  assert.ok(existingIdx >= 0 && newAccountIdx > existingIdx, 'the existing-user branch must appear, and return, before the new-account branch')
})

test('case: existing NON-client account is rejected, never silently linked', () => {
  assert.match(addUserBody, /if \(existing\.role !== 'client'\)/)
  assert.match(addUserBody, /non-client account and cannot be added/)
})

test('case: duplicate project-user link (existing user, already on this project) is a distinct, friendly error', () => {
  assert.match(addUserBody, /This user is already part of this project\./)
})

test('email normalization: the lookup and the eventual insert both use the same lowercased+trimmed value (case-insensitive comparison)', () => {
  const normalizeIdx = addUserBody.indexOf('const normalizedEmail')
  const lookupIdx = addUserBody.indexOf('eq(user.email, normalizedEmail)')
  const insertEmailIdx = addUserBody.indexOf('email: normalizedEmail,')
  assert.ok(normalizeIdx >= 0 && lookupIdx > normalizeIdx && insertEmailIdx > normalizeIdx)
  assert.match(addUserBody.slice(normalizeIdx, normalizeIdx + 200), /\.trim\(\)\.toLowerCase\(\)/)
})

test('the "assigning an existing account" vs "creating a new account" distinction is preserved: the existing-user branch never mutates name/role/userType, only writes project_client', () => {
  const existingIdx = addUserBody.indexOf('if (existing) {')
  const newAccountIdx = addUserBody.indexOf('Genuinely new account')
  const existingBranch = addUserBody.slice(existingIdx, newAccountIdx)
  assert.doesNotMatch(existingBranch, /db\.update\(user\)/, 'an existing account must never be mutated by this action')
  assert.match(existingBranch, /db\.insert\(projectClient\)/)
})

// ─── Part B: no cross-project user mixing (confirms Phase 6's scoping is
//     still correct after this phase's edits, per the explicit audit request) ─

test('getProjectClientUsers is scoped to a single projectId — WHERE project_client.projectId = :projectId, no broader fallback', () => {
  const body = functionBody(USERS_SRC, 'export const getProjectClientUsers')
  assert.match(body, /\.where\(eq\(projectClient\.projectId, projectId\)\)/)
})

test('addUserToProject looks up an existing user by an exact typed email — never a browsable list of other projects\' users', () => {
  assert.match(addUserBody, /db\.select\(\{ id: user\.id, role: user\.role \}\)\.from\(user\)\.where\(eq\(user\.email, normalizedEmail\)\)/)
  assert.doesNotMatch(addUserBody, /getUserList|getTicketFormClients/, 'must not offer a global/cross-project user picker')
})

test('the "Key User" reassignment dropdown has been intentionally removed from the Project Detail page — Reassignment now only handles Support Manager', () => {
  assert.doesNotMatch(DETAIL_PAGE_SRC, /const clients = /, 'the Key-User-scoped client list was only ever used by the removed dropdown')
  assert.doesNotMatch(DETAIL_PAGE_SRC, /Key User/)
})

test('assignClient still independently rejects any non-approver/non-client target server-side (defense in depth, unrelated to this phase but must remain intact)', () => {
  assert.match(ASSIGNMENTS_SRC, /targetUser\.role !== 'client' \|\| targetUser\.userType !== 'approver'/)
})
