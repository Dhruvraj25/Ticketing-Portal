// Project Detail access for client users added via Project Detail → Add User.
// Root cause: getProjectById / getModulesByProject only accepted the PRIMARY
// client (project.clientId), while the project list also accepts users linked
// in project_client — so a listed project failed to open ("Page not found").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  classifyProjectLoadError, isProjectClientUser, PROJECT_ACCESS_DENIED_MESSAGE, PROJECT_NOT_FOUND_MESSAGE,
} from '../lib/project-access-rules.ts'
import { canCloseTicket } from '../lib/client-ticket-rules.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const QUERIES = read('app/actions/projects/queries.ts')
const MODULES = read('app/actions/modules/queries.ts')
const PERMS = read('lib/client-ticket-permissions.ts')
const PAGE = read('app/dashboard/projects/[id]/page.tsx')
const USERS = read('app/actions/projects/users.ts')
const COMPANY_WALLET = read('lib/company-wallet.ts')

const detail = QUERIES.slice(QUERIES.indexOf('export const getProjectById'), QUERIES.indexOf('// LIGHTWEIGHT PROJECT NAMES'))
const modules = MODULES.slice(MODULES.indexOf('export const getModulesByProject ='))

// Project 64 shape: primary client (Approver), two linked Standard users.
const OWNER = 'paramveersinh', LINKED_STANDARD = 'param-kher', NEW_USER = 'dhruvraj', LINKED_APPROVER = 'approver-2'
const LINKS = [OWNER, LINKED_STANDARD, NEW_USER, LINKED_APPROVER]

test('1. the primary client can open the project', () => {
  assert.equal(isProjectClientUser(OWNER, [], OWNER), true)
})

test('2/3/4. a client user linked via project_client (Standard or Approver) can open the project', () => {
  for (const u of [NEW_USER, LINKED_STANDARD, LINKED_APPROVER]) assert.equal(isProjectClientUser(OWNER, LINKS, u), true, u)
})

test('5/6/10. an unlinked client — another company, or a user removed from the project — cannot', () => {
  assert.equal(isProjectClientUser(OWNER, LINKS, 'other-company-user'), false)
  const afterRemoval = LINKS.filter((id) => id !== NEW_USER)
  assert.equal(isProjectClientUser(OWNER, afterRemoval, NEW_USER), false, 'removing the project_client link removes access')
  assert.match(USERS, /await db\.delete\(projectClient\)\.where\(and\(eq\(projectClient\.projectId, projectId\), eq\(projectClient\.userId, userId\)\)\)/)
})

test('server: one helper decides client project access (primary client OR project_client link)', () => {
  assert.match(PERMS, /export async function isClientOfProject\(userId: string, projectId: number\)/)
  assert.match(PERMS, /return isProjectClientUser\(proj\.clientId, links\.map\(\(l\) => l\.userId\), userId\)/)
  assert.match(PERMS, /\.where\(and\(eq\(projectClient\.projectId, projectId\), eq\(projectClient\.userId, userId\)\)\)/)
  // The ticket-level check reuses it (one rule, not two).
  assert.match(PERMS, /return isClientOfProject\(userId, t\.projectId\)/)
})

test('getProjectById and getModulesByProject accept linked client users (no primary-client-only check left)', () => {
  assert.match(detail, /if \(currentUser\.role === 'client' && !\(await isClientOfProject\(currentUser\.id, projectId\)\)\) \{\s*\n\s*throw new Error\(PROJECT_ACCESS_DENIED_MESSAGE\)/)
  assert.doesNotMatch(detail, /projectData\.clientId !== currentUser\.id/)
  assert.match(modules, /if \(!\(await isClientOfProject\(currentUser\.id, projectId\)\)\) throw new Error\('Access denied'\)/)
  assert.doesNotMatch(modules, /eq\(project\.clientId, currentUser\.id\)/)
})

test('9. My Projects and Project Detail use the SAME client-project rule', () => {
  const list = QUERIES.slice(QUERIES.indexOf('export const getProjects'), QUERIES.indexOf('// GET PROJECT BY ID'))
  assert.match(list, /const allProjectIds = await clientProjectIds\(currentUser\.id\)/)
  assert.match(QUERIES, /const allProjectIds = await clientProjectIds\(userId\)/, 'project-name dropdowns too')
  assert.match(PERMS, /db\.select\(\{ projectId: project\.id \}\)\.from\(project\)\.where\(eq\(project\.clientId, userId\)\)/)
  assert.match(PERMS, /db\.select\(\{ projectId: projectClient\.projectId \}\)\.from\(projectClient\)\.where\(eq\(projectClient\.userId, userId\)\)/)
})

test('7/8. Admin and Manager access are unchanged', () => {
  assert.match(detail, /if \(currentUser\.role === 'project_manager' && projectData\.managerId !== currentUser\.id\) \{\s*\n\s*throw new Error\(PROJECT_ACCESS_DENIED_MESSAGE\)/)
  assert.doesNotMatch(detail, /currentUser\.role === 'admin'/, 'admins are never restricted here')
})

test('4. access only — no extra permissions: manager-only sections and client approval rules are untouched', () => {
  assert.match(PAGE, /const isManagerOrAdmin = user\.role === 'project_manager' \|\| user\.role === 'admin'/)
  assert.match(PAGE, /<ModuleManager projectId=\{projectId\} initialModules=\{modules\} canManage=\{isManagerOrAdmin\} \/>/)
  assert.match(PAGE, /\{isManagerOrAdmin && \(\s*\n\s*<ProjectUsersSection/)
  assert.equal(canCloseTicket({ id: NEW_USER, role: 'client' } as never, LINKED_STANDARD), false, 'project access ≠ ticket approval')
})

test('page: not found → 404, forbidden → "no access", other failures → logged real error', () => {
  assert.equal(classifyProjectLoadError(new Error(PROJECT_NOT_FOUND_MESSAGE)), 'not_found')
  assert.equal(classifyProjectLoadError(new Error(PROJECT_ACCESS_DENIED_MESSAGE)), 'forbidden')
  assert.equal(classifyProjectLoadError(new Error('Failed query: select ...')), 'error')
  assert.match(PAGE, /if \(failure === 'not_found'\) notFound\(\)/)
  assert.match(PAGE, /You don&apos;t have access to this project/)
  assert.match(PAGE, /console\.error\(`\[ProjectDetailPage\] Error loading project \$\{projectId\}:`, error\)\s*\n\s*throw error/)
  assert.doesNotMatch(PAGE, /\} catch \(error\) \{\s*\n\s*notFound\(\)\s*\n\s*\}/, 'errors are no longer all turned into "Page not found"')
})

test('11. company-wide wallet unaffected: project access never resolves wallets', () => {
  assert.doesNotMatch(PERMS, /supportWallet|companyId/)
  assert.doesNotMatch(read('lib/project-access-rules.ts').replace(/^\/\/.*$/gm, ''), /wallet/i)
  assert.match(COMPANY_WALLET, /return walletOfCompany\(handle, await companyIdOfUser\(handle, userId\)\)/)
})
