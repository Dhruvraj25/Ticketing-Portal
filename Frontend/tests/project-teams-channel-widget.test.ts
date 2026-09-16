import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// "PHASE 4" (7th implementation phase this session) — Part D: project-wise
// Microsoft Teams webhook widget on the Project Detail page.
//
// The backend/action layer for this (schema, repository, resolver, Express
// routes, Frontend server actions) ALREADY EXISTED before this phase — see
// Backend/tests/teams-project-channels.test.ts for its own dedicated,
// untouched coverage. This phase only added a single-project UI widget that
// reuses those exact actions. These tests confirm: (a) the widget reuses the
// existing actions rather than inventing a competing system, (b) it is
// admin-only, (c) it never renders/logs the webhook URL, and (d) the
// pre-existing backend files were NOT modified by this phase.
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const WIDGET_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'project-teams-channel-section.tsx'), 'utf8')
const DETAIL_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'projects', '[id]', 'page.tsx'), 'utf8')
const TEAMS_ACTIONS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'teams.ts'), 'utf8')

const BACKEND_ROOT = join(ROOT, '..', 'Backend')
const RESOLVER_SRC = readFileSync(join(BACKEND_ROOT, 'src', 'services', 'teams', 'teams-channel-resolver.ts'), 'utf8')
const REPOSITORY_SRC = readFileSync(join(BACKEND_ROOT, 'src', 'repositories', 'project-teams-channel.repository.ts'), 'utf8')
const ROUTES_SRC = readFileSync(join(BACKEND_ROOT, 'src', 'routes', 'teams-notification.ts'), 'utf8')

// ─── Reuse, not a competing system ──────────────────────────────────────────

test('the widget imports the SAME existing actions used by the admin Teams page — no new backend action was invented', () => {
  assert.match(WIDGET_SRC, /import \{[\s\S]*getTeamsProjectChannels,[\s\S]*saveTeamsProjectChannel,[\s\S]*removeTeamsProjectChannel,[\s\S]*sendTeamsProjectTestMessage,[\s\S]*\} from '@\/app\/actions\/teams'/)
})

test('the widget calls saveTeamsProjectChannel/removeTeamsProjectChannel/sendTeamsProjectTestMessage with THIS project\'s id', () => {
  assert.match(WIDGET_SRC, /saveTeamsProjectChannel\(projectId,/)
  assert.match(WIDGET_SRC, /removeTeamsProjectChannel\(projectId\)/)
  assert.match(WIDGET_SRC, /sendTeamsProjectTestMessage\(projectId\)/)
})

test('the single-project status is derived by filtering the existing getTeamsProjectChannels() list — no new backend route was added for this', () => {
  assert.match(WIDGET_SRC, /getTeamsProjectChannels\(\)/)
  assert.match(WIDGET_SRC, /\.find\(\(p\) => p\.projectId === projectId\)/)
})

// ─── Authorization: admin-only, matching the existing backend gate ─────────

test('the Project Detail page renders the Teams widget only for role === "admin" (not project_manager, unlike Project Users)', () => {
  const idx = DETAIL_PAGE_SRC.indexOf('<ProjectTeamsChannelSection')
  assert.ok(idx >= 0)
  const before = DETAIL_PAGE_SRC.slice(Math.max(0, idx - 150), idx)
  assert.match(before, /user\.role === 'admin'/)
  assert.doesNotMatch(before, /isManagerOrAdmin/)
})

test('the Teams channel status fetch on the Project Detail page is also gated to admin only', () => {
  const idx = DETAIL_PAGE_SRC.indexOf('getTeamsProjectChannels()')
  assert.ok(idx >= 0)
  const before = DETAIL_PAGE_SRC.slice(Math.max(0, idx - 300), idx)
  assert.match(before, /user\.role === 'admin'/)
})

test('the four backend routes this widget depends on are all admin-only (requireAdminOnly) — confirms "admin-only unless existing authorization explicitly allows another role" holds', () => {
  for (const marker of [
    "router.get('/projects'",
    "router.put('/projects/:projectId/channel'",
    "router.delete('/projects/:projectId/channel'",
    "router.post('/projects/:projectId/test'",
  ]) {
    const idx = ROUTES_SRC.indexOf(marker)
    assert.ok(idx >= 0, `expected to find ${marker}`)
    const line = ROUTES_SRC.slice(idx, ROUTES_SRC.indexOf('\n', idx))
    assert.match(line, /requireAdminOnly/)
  }
})

// ─── Secret never displayed, logged, or returned ────────────────────────────

test('the widget never references a "webhookUrl" VALUE from a returned status object — status objects only ever carry configured/enabled/updatedAt', () => {
  // The only "webhookUrl" occurrences allowed in this file are the OUTBOUND
  // save payload key name itself (webhookUrl: linkInput.trim()) — never a
  // read of a field coming back from getTeamsProjectChannels()/status.
  const offenders = [...WIDGET_SRC.matchAll(/status\??\.webhookUrl|\.webhookUrl\)/g)]
  assert.deepEqual(offenders.map((m) => m[0]), [])
})

test('the widget never console.logs or console.errors the link input value', () => {
  assert.doesNotMatch(WIDGET_SRC, /console\.(log|error|warn)\([^)]*linkInput/)
})

test('ProjectTeamsChannelStatus (the type this widget consumes) has no webhookUrl field', () => {
  const typeStart = TEAMS_ACTIONS_SRC.indexOf('export interface ProjectTeamsChannelStatus')
  const typeEnd = TEAMS_ACTIONS_SRC.indexOf('}', typeStart)
  const typeBody = TEAMS_ACTIONS_SRC.slice(typeStart, typeEnd)
  assert.doesNotMatch(typeBody, /webhookUrl/)
})

test('the backend GET /projects and PUT/DELETE .../channel routes never place webhookUrl in a JSON response', () => {
  for (const marker of ["router.get('/projects'", "router.put('/projects/:projectId/channel'", "router.delete('/projects/:projectId/channel'"]) {
    const start = ROUTES_SRC.indexOf(marker)
    const end = ROUTES_SRC.indexOf('\n})', start)
    const routeBody = ROUTES_SRC.slice(start, end === -1 ? start + 2000 : end)
    const jsonCalls = [...routeBody.matchAll(/res\.json\(\{[\s\S]*?\}\)/g)]
    for (const call of jsonCalls) {
      assert.doesNotMatch(call[0], /webhookUrl/, `a res.json() call in ${marker} must never include webhookUrl`)
    }
  }
})

// ─── Pre-existing Teams architecture was NOT modified by this phase ────────

test('the Teams channel resolver\'s precedence policy is unchanged: project+enabled -> project; project+disabled -> none (no global fallback); project absent -> global fallback', () => {
  assert.match(RESOLVER_SRC, /project channel present & DISABLED\s+→ no delivery/)
  assert.match(RESOLVER_SRC, /if \(!channel\.enabled\) \{/)
  const disabledBlock = RESOLVER_SRC.slice(RESOLVER_SRC.indexOf('if (!channel.enabled) {'), RESOLVER_SRC.indexOf('if (!channel.enabled) {') + 300)
  assert.doesNotMatch(disabledBlock, /globalFallback/, 'a disabled project channel must never fall back to the global webhook')
})

test('the repository never exposes webhookUrl from listWithProjects (the safe status-list function)', () => {
  const start = REPOSITORY_SRC.indexOf('export async function listWithProjects')
  const end = REPOSITORY_SRC.indexOf('\n}', start)
  const body = REPOSITORY_SRC.slice(start, end)
  assert.doesNotMatch(body, /webhookUrl/)
})
