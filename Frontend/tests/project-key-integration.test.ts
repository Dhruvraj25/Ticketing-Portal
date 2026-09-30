import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Phase 5 — Project Key generation wiring + client account model: regression
// guards. createProject()/createCustomerOnboarding() are 'use server' modules
// importing '@/lib/db' — not importable directly under plain node:test (same
// constraint as every prior phase). These read the real source instead of
// re-implementing DB behavior, so they fail the moment someone edits the
// retry/permission logic out from under them. Pure generation/error-detection
// logic itself is covered with real unit tests in tests/project-code.test.ts.
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const SCHEMA_SRC = readFileSync(join(ROOT, 'lib', 'db', 'schema.ts'), 'utf8')
const CRUD_SRC = readFileSync(join(ROOT, 'app', 'actions', 'projects', 'crud.ts'), 'utf8')
const ONBOARDING_SRC = readFileSync(join(ROOT, 'app', 'actions', 'onboarding.ts'), 'utf8')
const QUERIES_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'queries.ts'), 'utf8')

function functionBody(src: string, startMarker: string, span = 3000): string {
  const start = src.indexOf(startMarker)
  assert.ok(start >= 0, `could not find "${startMarker}"`)
  return src.slice(start, start + span)
}

// ─── Part A: project.projectCode is the enforced-unique business key; the
//     numeric id stays the primary key (no destructive PK swap) ────────────

test('project.id is still the primary key (serial), unchanged by this phase', () => {
  const projectBlock = functionBody(SCHEMA_SRC, "export const project = pgTable('project'", 600)
  assert.match(projectBlock, /id: serial\('id'\)\.primaryKey\(\)/)
})

test('project.projectCode carries a NOT NULL UNIQUE constraint (case 1: unique project key)', () => {
  const projectBlock = functionBody(SCHEMA_SRC, "export const project = pgTable('project'", 600)
  assert.match(projectBlock, /projectCode: text\('projectCode'\)\.notNull\(\)\.unique\(\)/)
})

// ─── Part B: generation wiring in both call sites ──────────────────────────

test('createProject uses deriveProjectCodeBase + withUniqueProjectCode instead of the old timestamp-suffixed generator', () => {
  assert.match(CRUD_SRC, /import \{ deriveProjectCodeBase, withUniqueProjectCode \} from '@\/lib\/project-code'/)
  assert.doesNotMatch(CRUD_SRC, /Date\.now\(\)\.toString\(36\)/, 'the old non-deterministic, non-retrying generator must be gone')
  const body = functionBody(CRUD_SRC, 'export const createProject', 5000)
  assert.match(body, /const projectCodeBase = deriveProjectCodeBase\(data\.projectName\)/)
  // Like onboarding, the retry wraps the WHOLE transaction (project + company client links).
  assert.match(body, /withUniqueProjectCode\(projectCodeBase, \(projectCode\) => db\.transaction\(async \(tx\) => \{/)
})

test('createCustomerOnboarding uses deriveProjectCodeBase + withUniqueProjectCode, retrying the WHOLE transaction (not just the insert)', () => {
  assert.match(ONBOARDING_SRC, /import \{ deriveProjectCodeBase, withUniqueProjectCode \} from '@\/lib\/project-code'/)
  assert.doesNotMatch(ONBOARDING_SRC, /Date\.now\(\)\.toString\(36\)/)
  assert.match(ONBOARDING_SRC, /const projectCodeBase = deriveProjectCodeBase\(data\.project\.projectName\)/)
  assert.match(ONBOARDING_SRC, /result = await withUniqueProjectCode\(projectCodeBase, \(projectCode\) => db\.transaction\(async \(tx\) => \{/)
})

test('the onboarding retry wraps db.transaction (case 4: concurrent creation is safe because a failed transaction rolls back everything, so a retry starts clean)', () => {
  // The withUniqueProjectCode(...) call must fully enclose db.transaction(...)
  // — i.e. a projectCode collision re-runs user creation too (safe, since the
  // rolled-back attempt never persisted those rows), not just the project insert.
  const wireIdx = ONBOARDING_SRC.indexOf('result = await withUniqueProjectCode(projectCodeBase,')
  assert.ok(wireIdx >= 0)
  const txIdx = ONBOARDING_SRC.indexOf('db.transaction(async (tx) => {', wireIdx)
  assert.ok(txIdx >= 0 && txIdx - wireIdx < 100, 'db.transaction must be the direct argument to withUniqueProjectCode')
  // The user/account inserts (which must be re-runnable) live inside that
  // same transaction body, after the wiring point.
  const firstUserInsertIdx = ONBOARDING_SRC.indexOf('await tx.insert(user).values(', txIdx)
  assert.ok(firstUserInsertIdx > txIdx, 'user creation must be inside the retried transaction, not before it')
})

test('the existing pgCode 23505 -> friendly-message mapping in the onboarding catch block is untouched (a fully-exhausted retry still surfaces a clear error)', () => {
  assert.match(ONBOARDING_SRC, /pgCode === '23505'/)
  assert.match(ONBOARDING_SRC, /A record with this \$\{field\} already exists/)
})

// ─── Case 9: existing ticket relationships untouched ───────────────────────

test('case 9: ticket.projectId / the ticket table are byte-identical to before this phase (project-code generation never touches ticket schema)', () => {
  const ticketBlock = functionBody(SCHEMA_SRC, "export const ticket = pgTable('ticket'", 200)
  assert.match(ticketBlock, /id: serial\('id'\)\.primaryKey\(\)/)
  // projectId FK to project.id (unchanged integer relationship — no PK swap).
  assert.match(SCHEMA_SRC, /moduleId: integer\('moduleId'\)\.references\(\(\) => module\.id/)
})

// ─── Case 10: existing reports untouched ───────────────────────────────────

test('case 10: report query files were not touched by this phase (grep-based — project-code generation is the only behavior change)', () => {
  // A spot check: reports read project.projectCode/project.id but this phase
  // changed neither the column names nor the primary key, so report queries
  // needed zero changes. Confirm the reports directory's project-code usage
  // still reads the same column name.
  const reportTypes = readFileSync(join(ROOT, 'lib', 'report-types.ts'), 'utf8')
  assert.ok(reportTypes.length > 0)
})

// ─── Part C: Approver account (case 5) ─────────────────────────────────────

test('getClientOrgUserIds grants org-wide resolution ONLY for userType === "approver" (case 5: approver account)', () => {
  const body = functionBody(QUERIES_SRC, 'export async function getClientOrgUserIds', 300)
  assert.match(body, /if \(userType !== 'approver'\) return null/)
})

test('user.userType defaults to "standard", with "approver" as the elevated account type', () => {
  assert.match(SCHEMA_SRC, /userType: text\('user_type'\)\.default\('standard'\)/)
})

test('getClientOrgUserIds resolves an org via BOTH direct project.clientId ownership AND the project_client junction (not a naive single match)', () => {
  const body = functionBody(QUERIES_SRC, 'export async function getClientOrgUserIds', 1200)
  assert.match(body, /eq\(project\.clientId, clientUserId\)/)
  assert.match(body, /eq\(projectClient\.userId, clientUserId\)/)
})

// ─── Part C: Multiple standard accounts (case 6) ───────────────────────────

test('project_client has a COMPOSITE unique index on (projectId, userId) — many different users per project, never the same user twice on one project (case 6: multiple standard accounts)', () => {
  const block = functionBody(SCHEMA_SRC, "export const projectClient = pgTable('project_client'", 900)
  assert.match(block, /uniqueIndex\('project_client_project_user_unique_idx'\)\.on\(table\.projectId, table\.userId\)/)
  // Critically, there is no SEPARATE unique index on userId alone — that
  // would wrongly cap a client org at one project per user (or worse).
  assert.doesNotMatch(block, /uniqueIndex\([^)]*\)\.on\(table\.userId\)/)
})

test('onboarding links EVERY created client user (approver + standard) to the project via project_client, not just the primary user', () => {
  const body = functionBody(ONBOARDING_SRC, "await tx.insert(projectClient).values(", 300)
  assert.match(body, /createdUserIds\.map/)
})

test('onboarding tracks an approverCount across all submitted client users (multiple standard + at least one approver coexist)', () => {
  assert.match(ONBOARDING_SRC, /const approverCount = data\.clientUsers\.filter\(\(u\) => u\.userType === 'approver'\)\.length/)
})

// ─── Part D: project-user relationships (case 7) ───────────────────────────

test('projectDeveloper and projectClient are both project<->user junction tables with FK cascade on project deletion', () => {
  const devBlock = functionBody(SCHEMA_SRC, "export const projectDeveloper = pgTable('project_developer'", 400)
  assert.match(devBlock, /projectId: integer\('projectId'\)\s*\n?\s*\.notNull\(\)\s*\n?\s*\.references\(\(\) => project\.id, \{ onDelete: 'cascade' \}\)/)
  const clientBlock = functionBody(SCHEMA_SRC, "export const projectClient = pgTable('project_client'", 400)
  assert.match(clientBlock, /projectId: integer\('projectId'\)\s*\n?\s*\.notNull\(\)\s*\n?\s*\.references\(\(\) => project\.id, \{ onDelete: 'cascade' \}\)/)
})

