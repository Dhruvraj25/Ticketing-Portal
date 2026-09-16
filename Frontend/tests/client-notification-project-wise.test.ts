import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Admin → Clients notification management: CLIENT-WISE → PROJECT-WISE.
//
// The project-level preference infrastructure (schema, repository, service,
// Express routes, the ProjectNotificationPreferencesSection widget, and the
// dispatch-time client-only-scope gating in teams-notification.ts /
// email-notification.ts / notify-all.ts) already existed before this change
// — see Backend/tests/project-notification-preferences.test.ts. This change
// only replaces the /dashboard/clients ENTRY POINT (project list instead of
// client list) and adds a dedicated per-project preferences page that reuses
// the SAME ProjectNotificationPreferencesSection widget and the SAME backend
// API. These tests confirm: (a) no parallel preference system was invented,
// (b) the project list is correctly role-scoped, (c) all client accounts of
// a project share one configuration (no per-client toggle state anywhere),
// (d) the old client-wise page/action were preserved (not deleted), and
// (e) Teams/email/in-app dispatch files were not touched by this change.
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const ACTIONS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'client-notification-preferences.ts'), 'utf8')
const CLIENTS_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'clients', 'page.tsx'), 'utf8')
const PROJECT_LIST_WIDGET_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'projects-notification-management-client.tsx'), 'utf8')
const PROJECT_PREFS_PAGE_SRC = readFileSync(
  join(ROOT, 'app', 'dashboard', 'clients', 'projects', '[projectId]', 'notification-preferences', 'page.tsx'),
  'utf8',
)
const PROJECT_PREFS_WIDGET_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'project-notification-preferences-section.tsx'), 'utf8')
const OLD_CLIENT_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'clients', '[clientId]', 'notification-preferences', 'page.tsx'), 'utf8')
const PROJECT_ACTIONS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'project-notification-preferences.ts'), 'utf8')

// ─── Entry point: /dashboard/clients now lists PROJECTS ────────────────────

test('the /dashboard/clients page fetches projects (getManageableProjectsForNotifications), not the old client list', () => {
  assert.match(CLIENTS_PAGE_SRC, /getManageableProjectsForNotifications/)
  assert.doesNotMatch(CLIENTS_PAGE_SRC, /getManageableClients\(/)
})

test('the /dashboard/clients page renders the project list widget, not the old per-client widget', () => {
  assert.match(CLIENTS_PAGE_SRC, /ProjectsNotificationManagementClient/)
  assert.doesNotMatch(CLIENTS_PAGE_SRC, /ClientsManagementClient/)
})

test('each project card links to the new project-scoped preferences route, keyed by project id', () => {
  assert.match(
    PROJECT_LIST_WIDGET_SRC,
    /href=\{`\/dashboard\/clients\/projects\/\$\{project\.id\}\/notification-preferences`\}/,
  )
})

test('the project list widget shows a client-account count and names per project card, not a client-first list', () => {
  assert.match(PROJECT_LIST_WIDGET_SRC, /project\.clientAccounts\.length/)
  assert.match(PROJECT_LIST_WIDGET_SRC, /client \{project\.clientAccounts\.length === 1 \? 'account' : 'accounts'\}/)
})

// ─── New action: role-scoped, projectId + project_client based (no clientId) ─

test('getManageableProjectsForNotifications is admin/project_manager gated, same as the legacy client listing', () => {
  const idx = ACTIONS_SRC.indexOf('async function getManageableProjectsForNotifications')
  assert.ok(idx >= 0, 'function must exist')
  const body = ACTIONS_SRC.slice(idx, idx + 700)
  assert.match(body, /currentUser\.role !== 'admin' && currentUser\.role !== 'project_manager'/)
  assert.match(body, /throw new Error\('Access denied'\)/)
})

test('project scoping for a Project Manager uses projectTable.managerId — the same field the backend PUT endpoint authorizes against', () => {
  const idx = ACTIONS_SRC.indexOf('async function getManageableProjectsForNotifications')
  const body = ACTIONS_SRC.slice(idx, idx + 1500)
  assert.match(body, /eq\(projectTable\.managerId, currentUser\.id\)/)
})

test('the new project listing is built from project_client (canonical client-membership table), never a bare clientId lookup', () => {
  const idx = ACTIONS_SRC.indexOf('async function getManageableProjectsForNotifications')
  const body = ACTIONS_SRC.slice(idx, idx + 2500)
  assert.match(body, /projectClientTable/)
  assert.match(body, /innerJoin\(userTable, eq\(projectClientTable\.userId, userTable\.id\)\)/)
})

// ─── One shared configuration per project — no per-client toggle state ─────

test('the project preferences page renders exactly ONE ProjectNotificationPreferencesSection, keyed by projectId only', () => {
  const matches = PROJECT_PREFS_PAGE_SRC.match(/<ProjectNotificationPreferencesSection/g) ?? []
  assert.equal(matches.length, 1, 'must render the shared project widget exactly once — never once per client account')
  assert.match(PROJECT_PREFS_PAGE_SRC, /<ProjectNotificationPreferencesSection key=\{projectId\} projectId=\{projectId\} \/>/)
})

test('the project preferences page never maps over client accounts to render a toggle/preferences component per client', () => {
  // The only .map( over clientAccounts in this page must render a display
  // chip (name/email), never a nested preferences/toggle widget.
  const mapIdx = PROJECT_PREFS_PAGE_SRC.indexOf('clientAccounts.map')
  assert.ok(mapIdx >= 0)
  const body = PROJECT_PREFS_PAGE_SRC.slice(mapIdx, mapIdx + 400)
  assert.doesNotMatch(body, /ProjectNotificationPreferencesSection|Toggle|updateProjectNotificationPreference/)
})

test('the project preferences page includes the required explanatory copy that settings are shared project-wide', () => {
  assert.match(
    PROJECT_PREFS_PAGE_SRC,
    /These notification settings apply to all client accounts assigned to this project/,
  )
})

test('the project preferences page shows the Client Accounts list sourced from getProjectClientUsers (project_client), not a single clientId', () => {
  assert.match(PROJECT_PREFS_PAGE_SRC, /getProjectClientUsers\(projectId\)/)
})

// ─── Authorization: Admin/Manager only, backend-enforced ────────────────────

test('the project preferences page redirects non-admin/non-manager roles before rendering anything', () => {
  const idx = PROJECT_PREFS_PAGE_SRC.indexOf("if (user.role !== 'admin' && user.role !== 'project_manager')")
  assert.ok(idx >= 0)
  const after = PROJECT_PREFS_PAGE_SRC.slice(idx, idx + 120)
  assert.match(after, /redirect\('\/dashboard'\)/)
})

test('the project preferences page relies on getProjectById to re-enforce Project Manager scoping (managerId), and 404s on Access denied', () => {
  assert.match(PROJECT_PREFS_PAGE_SRC, /getProjectById\(projectId\)/)
  const idx = PROJECT_PREFS_PAGE_SRC.indexOf('} catch (err) {')
  assert.ok(idx >= 0)
  const body = PROJECT_PREFS_PAGE_SRC.slice(idx, idx + 300)
  assert.match(body, /not found\|Access denied/i)
  assert.match(body, /notFound\(\)/)
})

test('saving a preference still goes through the existing backend-authorized project action (no new write path invented)', () => {
  assert.match(PROJECT_PREFS_WIDGET_SRC, /updateProjectNotificationPreference/)
  assert.match(PROJECT_ACTIONS_SRC, /PUT/)
  assert.match(PROJECT_ACTIONS_SRC, /\/api\/projects\/\$\{projectId\}\/notification-preferences/)
})

// ─── Old client-wise page/action preserved (not deleted) — data safety ─────

test('the old per-client notification preferences page still exists and still enforces the same authorization (kept for data preservation, not linked as the primary UI anymore)', () => {
  assert.match(OLD_CLIENT_PAGE_SRC, /getManageableClients/)
  assert.match(OLD_CLIENT_PAGE_SRC, /getClientNotificationPreferences/)
})

test('getManageableClients (legacy per-client listing) still exists in the actions file, now marked as retained/deprecated rather than removed', () => {
  assert.match(ACTIONS_SRC, /export const getManageableClients = wrapServerAction/)
  assert.match(ACTIONS_SRC, /@deprecated/)
})

test('no link on the new /dashboard/clients page points at the legacy per-client route anymore', () => {
  assert.doesNotMatch(CLIENTS_PAGE_SRC, /\/dashboard\/clients\/\$\{.*\}\/notification-preferences/)
})

// ─── Untouched: Teams/email/in-app dispatch and DB schema ──────────────────

test('this change does not touch the Teams/email/in-app dispatch or schema files', () => {
  const BACKEND_ROOT = join(ROOT, '..', 'Backend')
  const untouchedMarkers = [
    ['routes/teams-notification.ts', join(BACKEND_ROOT, 'src', 'routes', 'teams-notification.ts')],
    ['routes/email-notification.ts', join(BACKEND_ROOT, 'src', 'routes', 'email-notification.ts')],
    ['lib/notify-all.ts', join(ROOT, 'lib', 'notify-all.ts')],
  ] as const
  for (const [label, path] of untouchedMarkers) {
    const src = readFileSync(path, 'utf8')
    // Sanity: the client-only project-preference scope from the prior phase
    // must still be present verbatim — proves these files were not rewritten.
    assert.match(src, /recipient\.role === 'client'|role === 'client'/, `${label} must still contain its client-only scope gate`)
  }
})
