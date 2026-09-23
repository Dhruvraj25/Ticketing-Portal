import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Phase 6 — Project Users and Reassignment: integration-shaped regression
// guards. app/actions/projects/users.ts, assignments.ts, admin.ts and the
// project detail page are all 'use server'/server-component modules importing
// '@/lib/db' — not importable directly under plain node:test (same constraint
// as every prior phase's *-integration.test.ts files). These tests read the
// real source instead of re-implementing DB behavior, so they fail the moment
// someone edits the authorization/scoping logic out from under them.
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const USERS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'projects', 'users.ts'), 'utf8')
const ASSIGNMENTS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'projects', 'assignments.ts'), 'utf8')
const ADMIN_SRC = readFileSync(join(ROOT, 'app', 'actions', 'admin.ts'), 'utf8')
const PANEL_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'project-assignment-panel.tsx'), 'utf8')
const DETAIL_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'projects', '[id]', 'page.tsx'), 'utf8')
const PROJECTS_INDEX_SRC = readFileSync(join(ROOT, 'app', 'actions', 'projects', 'index.ts'), 'utf8')

function functionBody(src: string, startMarker: string): string {
  const start = src.indexOf(startMarker)
  assert.ok(start >= 0, `could not find "${startMarker}"`)
  return src.slice(start)
}

// ─── Case 1: project users displayed ───────────────────────────────────────

test('getProjectClientUsers selects name, email, role, userType, banned, and assignedAt, joined off project_client', () => {
  const body = functionBody(USERS_SRC, 'export const getProjectClientUsers')
  const query = body.slice(0, body.indexOf('return rows.map'))
  assert.match(query, /name:\s*user\.name/)
  assert.match(query, /email:\s*user\.email/)
  assert.match(query, /role:\s*user\.role/)
  assert.match(query, /userType:\s*user\.userType/)
  assert.match(query, /banned:\s*user\.banned/)
  assert.match(query, /assignedAt:\s*projectClient\.assignedAt/)
  assert.match(query, /\.from\(projectClient\)/)
  assert.match(query, /\.innerJoin\(user,/)
  assert.match(query, /eq\(projectClient\.projectId, projectId\)/)
})

test('getProjectClientUsers marks the row matching project.clientId as isPrimary', () => {
  const body = functionBody(USERS_SRC, 'export const getProjectClientUsers')
  assert.match(body, /isPrimary:\s*r\.id === p\.clientId/)
})

// ─── Case 2: add user ───────────────────────────────────────────────────────

test('addUserToProject validates project existence, email format, and account type BEFORE any user lookup', () => {
  const body = functionBody(USERS_SRC, 'export const addUserToProject')
  const projectCheckIdx = body.indexOf('Project not found')
  const emailCheckIdx = body.indexOf('Please enter a valid email address')
  const typeCheckIdx = body.indexOf('Account type must be either Approver or Standard')
  const lookupIdx = body.indexOf('const [existing]')
  assert.ok(projectCheckIdx > 0 && emailCheckIdx > projectCheckIdx && typeCheckIdx > emailCheckIdx && lookupIdx > typeCheckIdx,
    'validation order must be: project exists -> email format -> account type -> existing-user lookup')
})

test('addUserToProject email validation uses the same regex as every other email-handling call site in this codebase', () => {
  assert.match(USERS_SRC, /\/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$\//)
})

test('addUserToProject: a brand-new account mirrors createUser() — crypto.randomUUID() ids, ctx.password.hash, a "client"-role user row, and an "account"/credential row with providerId "credential"', () => {
  const body = functionBody(USERS_SRC, 'export const addUserToProject')
  assert.match(body, /crypto\.randomUUID\(\)/)
  assert.match(body, /auth\.\$context/)
  assert.match(body, /ctx\.password\.hash\(data\.password\)/)
  assert.match(body, /role:\s*'client'/)
  assert.match(body, /providerId:\s*'credential'/)
})

test('addUserToProject: new-account creation (user + account + project_client link) runs inside a single db.transaction', () => {
  const body = functionBody(USERS_SRC, 'export const addUserToProject')
  const txStart = body.indexOf('await db.transaction(async (tx) => {')
  assert.ok(txStart >= 0)
  const txEnd = body.indexOf('\n  })', txStart)
  const txBody = body.slice(txStart, txEnd)
  assert.match(txBody, /tx\.insert\(user\)/)
  assert.match(txBody, /tx\.insert\(account\)/)
  assert.match(txBody, /tx\.insert\(projectClient\)/)
})

test('addUserToProject: new-account branch requires name and an 8+ character password, matching createUser()\'s own rule', () => {
  const body = functionBody(USERS_SRC, 'export const addUserToProject')
  assert.match(body, /if \(!data\.name\?\.trim\(\)\) throw new Error\('Please complete all required fields\.'\)/)
  assert.match(body, /if \(!data\.password\) throw new Error\('Please complete all required fields\.'\)/)
  assert.match(body, /if \(data\.password\.length < 8\) throw new Error\('Password must be at least 8 characters\.'\)/)
})

test('addUserToProject is gated to project_manager/admin, not admin-only (case 10, part 1: unauthorized caller)', () => {
  const body = functionBody(USERS_SRC, 'export const addUserToProject')
  const guard = body.slice(0, body.indexOf('Project not found'))
  assert.match(guard, /currentUser\.role !== 'project_manager' && currentUser\.role !== 'admin'/)
})

test('getProjectClientUsers rejects any caller who is not project_manager/admin', () => {
  const body = functionBody(USERS_SRC, 'export const getProjectClientUsers')
  const guard = body.slice(0, body.indexOf('Project not found'))
  assert.match(guard, /currentUser\.role !== 'project_manager' && currentUser\.role !== 'admin'/)
})

// ─── Case 3: duplicate user ─────────────────────────────────────────────────

test('addUserToProject: an existing user already linked to the project is rejected with a clear duplicate error, checked BEFORE any insert', () => {
  const body = functionBody(USERS_SRC, 'export const addUserToProject')
  const dupCheckIdx = body.indexOf('This user is already part of this project')
  const insertIdx = body.indexOf('await db.insert(projectClient)')
  assert.ok(dupCheckIdx > 0 && dupCheckIdx < insertIdx, 'the duplicate pre-check must run before the insert attempt')
  assert.match(body, /and\(eq\(projectClient\.projectId, projectId\), eq\(projectClient\.userId, existing\.id\)\)/)
})

test('addUserToProject: the project_client insert for an existing user is ALSO guarded by a catch that maps a unique-violation to the same friendly duplicate message (race-condition backstop)', () => {
  const body = functionBody(USERS_SRC, 'export const addUserToProject')
  const tryMatch = body.match(/try \{\s*await db\.insert\(projectClient\)/)
  assert.ok(tryMatch, 'expected a try block wrapping the project_client insert')
  const tryIdx = tryMatch.index!
  const catchBlock = body.slice(tryIdx, tryIdx + 500)
  assert.match(catchBlock, /23505/)
  assert.match(catchBlock, /This user is already part of this project\./)
})

test('addUserToProject: an existing NON-client account (admin/developer/manager) is rejected, never silently linked', () => {
  const body = functionBody(USERS_SRC, 'export const addUserToProject')
  assert.match(body, /if \(existing\.role !== 'client'\) \{/)
  assert.match(body, /This email belongs to a non-client account and cannot be added as a project user\./)
})

test('addUserToProject: an existing user is NEVER mutated (no update to their name/userType/role) — only project_client is written', () => {
  const body = functionBody(USERS_SRC, 'export const addUserToProject')
  const existingBranchStart = body.indexOf('if (existing) {')
  const existingBranchEnd = body.indexOf('// Genuinely new account')
  const existingBranch = body.slice(existingBranchStart, existingBranchEnd)
  assert.doesNotMatch(existingBranch, /db\.update\(user\)/, 'the existing-user path must never write to the user table')
})

// ─── Cases 4 & 5: activate / deactivate ────────────────────────────────────

test('the Project Users UI reuses the existing toggleUserBanned action — no parallel/looser-permission toggle was written', () => {
  const componentSrc = readFileSync(join(ROOT, 'components', 'dashboard', 'project-users-section.tsx'), 'utf8')
  assert.match(componentSrc, /import \{ toggleUserBanned \} from '@\/app\/actions\/admin'/)
  assert.match(componentSrc, /await toggleUserBanned\(u\.id\)/)
  // No new ban/activate/deactivate server action was introduced in users.ts
  // (it legitimately sets banned: false as a default field on a brand-new
  // user row — that's not a toggle action, just an initial value).
  assert.doesNotMatch(USERS_SRC, /export const \w*[Bb]an|export const \w*[Aa]ctivat/)
})

test('toggleUserBanned remains admin-only and never deletes the user row (deactivation is non-destructive)', () => {
  const body = functionBody(ADMIN_SRC, 'export const toggleUserBanned')
  const guardBlock = body.slice(0, body.indexOf('const [target]'))
  assert.match(guardBlock, /currentUser\.role !== 'admin'/)
  assert.doesNotMatch(ADMIN_SRC.slice(ADMIN_SRC.indexOf('export const toggleUserBanned'), ADMIN_SRC.indexOf('export const toggleUserBanned') + 2000), /db\.delete\(user\)/)
})

test('the Project Users section only shows Activate/Deactivate controls when canActivate (admin) is true', () => {
  const componentSrc = readFileSync(join(ROOT, 'components', 'dashboard', 'project-users-section.tsx'), 'utf8')
  assert.match(componentSrc, /\{canActivate && \(/)
})

test('the project detail page passes canActivate = (user.role === "admin"), mirroring toggleUserBanned\'s own gate', () => {
  assert.match(DETAIL_PAGE_SRC, /canActivate=\{user\.role === 'admin'\}/)
})

// ─── Cases 6 & 7: approver / standard account ──────────────────────────────

test('addUserToProject validates userType is exactly "approver" or "standard"', () => {
  const body = functionBody(USERS_SRC, 'export const addUserToProject')
  assert.match(body, /data\.userType !== 'approver' && data\.userType !== 'standard'/)
})

test('getProjectClientUsers normalizes userType to "approver" or "standard" (never leaks a raw/unexpected DB value)', () => {
  assert.match(USERS_SRC, /r\.userType === 'approver' \? 'approver' : 'standard'/)
})

test('nothing in this phase\'s new code limits a project to a single Standard account — project_client has no per-userType uniqueness beyond the existing (projectId, userId) pair', () => {
  // The composite unique index shape itself was already proven in Phase 5's
  // project-key-integration.test.ts; this just confirms this phase's
  // duplicate check is keyed on (projectId, userId) only, never on userType,
  // so a second (or third) Standard account on the same project is never
  // rejected as a "duplicate".
  const body = functionBody(USERS_SRC, 'export const addUserToProject')
  const dupCheckIdx = body.indexOf('const [dup]')
  const dupCheckBlock = body.slice(dupCheckIdx, dupCheckIdx + 300)
  assert.doesNotMatch(dupCheckBlock, /userType/)
})

// ─── Case 8 (updated): "Key User" reassignment removed from Project Detail ──
// The Reassignment card's Key User field was intentionally removed from the
// Project Detail page's UI. assignClient and its per-project approver scoping
// remain fully intact in the backend action (see Case 9 below and
// project-user-removal.test.ts) — only this page's UI stopped calling it.

test('project-assignment-panel.tsx: "Key User" has been removed — the Reassignment card only handles Support Manager now', () => {
  assert.doesNotMatch(PANEL_SRC, /Key User/)
  assert.doesNotMatch(PANEL_SRC, /clientId/)
  assert.match(PANEL_SRC, />Support Manager</)
})

test('project-assignment-panel.tsx no longer declares the clients/canAssignClient/currentClientId props — Key User assignment is no longer this component\'s responsibility', () => {
  assert.doesNotMatch(PANEL_SRC, /clients: UserOption\[\]/)
  assert.doesNotMatch(PANEL_SRC, /canAssignClient: boolean/)
  assert.doesNotMatch(PANEL_SRC, /currentClientId/)
})

test('the Support Manager dropdown derivation is untouched (still sourced from the global getUserList, still role === "project_manager")', () => {
  assert.match(DETAIL_PAGE_SRC, /const managers = userList\.filter\(\(u\) => u\.role === 'project_manager' && u\.id !== project\.managerId\)/)
})

// ─── Case 9: assignClient itself is untouched (backend-only now) ───────────

test('the Project Detail page no longer computes a Key-User-scoped "clients" list — that filtering was only ever used by the now-removed dropdown', () => {
  assert.doesNotMatch(DETAIL_PAGE_SRC, /const clients = /)
})

test('getProjectClientUsers itself is hard-scoped to a single projectId — an approver linked to a DIFFERENT project can never appear', () => {
  const body = functionBody(USERS_SRC, 'export const getProjectClientUsers')
  assert.match(body, /eq\(projectClient\.projectId, projectId\)/)
  assert.doesNotMatch(body.slice(0, body.indexOf('.where(eq(projectClient.projectId, projectId))') + 50), /\.from\(user\)/, 'must query FROM project_client (scoped), not FROM user (global)')
})

test('assignClient: a defensive server-side check rejects any target user who is not role==="client" && userType==="approver" — the action itself never trusts the UI filtering alone', () => {
  const body = functionBody(ASSIGNMENTS_SRC, 'export const assignClient')
  assert.match(body, /targetUser\.role !== 'client' \|\| targetUser\.userType !== 'approver'/)
  assert.match(body, /Only an Approver Account can be assigned as the project Key User/)
})

// ─── Case 10: unauthorized user cannot modify project users ───────────────

test('addUserToProject and getProjectClientUsers both call getCurrentUser() and check the role BEFORE touching the database', () => {
  for (const fnStart of ['export const getProjectClientUsers', 'export const addUserToProject']) {
    const body = functionBody(USERS_SRC, fnStart)
    const authIdx = body.indexOf('await getCurrentUser()')
    const roleCheckIdx = body.indexOf("!== 'project_manager'")
    const firstDbCallIdx = body.indexOf('db.select')
    assert.ok(authIdx >= 0 && authIdx < roleCheckIdx && roleCheckIdx < firstDbCallIdx,
      `${fnStart}: auth must be resolved and role-checked before any DB read`)
  }
})

test('the Project Users UI never bypasses the server-side gate with a client-only permission check — canManage/canActivate only control what renders, addUserToProject/toggleUserBanned re-check server-side regardless', () => {
  const componentSrc = readFileSync(join(ROOT, 'components', 'dashboard', 'project-users-section.tsx'), 'utf8')
  // The component has no local role-authorization logic of its own (no
  // hardcoded role checks) — it only reflects the canManage/canActivate
  // booleans the server-rendered parent page already computed from the
  // session user, and the actions it calls independently re-verify the role.
  assert.doesNotMatch(componentSrc, /role === 'admin'|role === 'project_manager'/)
})

test('the barrel exports (projects/index.ts) expose getProjectClientUsers and addUserToProject for the new UI to import', () => {
  assert.match(PROJECTS_INDEX_SRC, /getProjectClientUsers/)
  assert.match(PROJECTS_INDEX_SRC, /addUserToProject/)
})

// ─── Scope guard: nothing outside this phase's intended surface was touched ─

test('ticket reassignment (managerReassignDeveloper / the "reassigned" ticketHistory action) was not touched by this phase', () => {
  const updateSrc = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'update.ts'), 'utf8')
  assert.match(updateSrc, /export const managerReassignDeveloper/)
  assert.match(updateSrc, /action:\s*'reassigned'/)
})

test('assignManager (Support Manager reassignment) is untouched — still admin-only, no userType/account-type check was added to it', () => {
  const body = functionBody(ASSIGNMENTS_SRC, 'export const assignManager')
  const untilNextExport = body.slice(0, body.indexOf('export const assignDeveloper'))
  assert.match(untilNextExport, /currentUser\.role !== 'admin'/)
  assert.doesNotMatch(untilNextExport, /userType/)
})
