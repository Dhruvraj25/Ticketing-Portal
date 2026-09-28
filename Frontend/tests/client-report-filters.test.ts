import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// PHASE 5 — Restore Filter Section in Client Reports
// ============================================================================
// checkAccess()/report handlers pull in '@/lib/types', a path alias node's
// native TS loader can't resolve outside the Next.js bundler (same
// constraint as tests/report-access.test.ts). These tests read the real
// source instead of re-implementing the query logic.

const ROOT = join(import.meta.dirname, '..')
const REPORT_FILTERS_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'report-center', 'report-filters.tsx'), 'utf8')
const QUERIES_SRC = readFileSync(join(ROOT, 'app', 'actions', 'reports', 'queries.ts'), 'utf8')
const PROJECT_REPORTS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'reports', 'project-reports.ts'), 'utf8')
const WALLET_REPORTS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'reports', 'wallet-reports.ts'), 'utf8')
const CLIENT_REPORTS_VIEW_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'reports', 'view', 'client-reports-view.tsx'), 'utf8')
const REPORT_CENTER_CLIENT_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'reports', 'view', 'report-center-client.tsx'), 'utf8')

function functionBody(src: string, startMarker: string, nextMarker = 'export async function'): string {
  const start = src.indexOf(startMarker)
  assert.ok(start >= 0, `could not find "${startMarker}"`)
  const next = src.indexOf(nextMarker, start + startMarker.length)
  return src.slice(start, next === -1 ? undefined : next)
}

// ─── Bug fix 1: the "__all__" sentinel was sent to the backend as a real filter value ─

test('report-filters.tsx: handleApply treats the "__all__" sentinel the same as "not selected" for every field', () => {
  const body = functionBody(REPORT_FILTERS_SRC, 'function handleApply', 'function handleReset')
  for (const field of ['projectId', 'moduleId', 'developerId', 'clientId', 'status', 'priority']) {
    assert.match(body, new RegExp(`if \\(${field} && ${field} !== ALL_VALUE\\)`), `${field} must be guarded against the ALL_VALUE sentinel`)
  }
})

test('report-filters.tsx: activeFilterCount does not count the "__all__" sentinel as an active filter', () => {
  assert.match(REPORT_FILTERS_SRC, /activeFilterCount = \[.*\]\.filter\(v => v && v !== ALL_VALUE\)\.length/)
})

test('report-filters.tsx: ALL_VALUE constant matches the literal sentinel used in every SelectItem', () => {
  assert.match(REPORT_FILTERS_SRC, /const ALL_VALUE = '__all__'/)
  const allValueSelectItems = [...REPORT_FILTERS_SRC.matchAll(/<SelectItem value="__all__">/g)]
  assert.ok(allValueSelectItems.length >= 4, 'expected multiple "All X" sentinel options (project, module, client, status, priority)')
})

// ─── Bug fix 2 / data-exposure: Client field hidden for the client role ────

test('report-filters.tsx: the Client filter field is hidden entirely when userRole === "client"', () => {
  assert.match(REPORT_FILTERS_SRC, /const showClientFilter = userRole !== 'client'/)
  assert.match(REPORT_FILTERS_SRC, /\{showClientFilter && \(/)
})

test('report-filters.tsx: hiding the Client field is scoped to the client role only — other roles are unaffected', () => {
  // showClientFilter is true for admin/manager/developer/undefined — only
  // false for the literal 'client' role.
  assert.doesNotMatch(REPORT_FILTERS_SRC, /showClientFilter = userRole === 'admin'/)
  assert.doesNotMatch(REPORT_FILTERS_SRC, /showClientFilter = !userRole/)
})

// ─── Bug fix 3: projects list in getReportFormData was missing project_client (Standard Account) scoping ─

test('_getReportFormDataImpl: a client-role caller\'s projects list includes BOTH direct ownership AND project_client links', () => {
  const body = functionBody(QUERIES_SRC, 'async function _getReportFormDataImpl')
  assert.match(body, /projectClient\.userId, userId/, 'must query the project_client junction for the caller')
  assert.match(body, /or\(eq\(project\.clientId, userId\), inArray\(project\.id, \[\.\.\.ids\]\)\)/, 'must OR direct ownership with junction-linked project ids')
})

test('_getReportFormDataImpl: the projects org-scoping fix does not affect the admin/manager path (still unfiltered)', () => {
  const body = functionBody(QUERIES_SRC, 'async function _getReportFormDataImpl')
  assert.match(body, /if \(role === 'client'\) \{/, 'the fix must be gated to role === client only')
  // The final query still accepts an undefined filter (no WHERE clause) for
  // any other role, exactly as before.
  assert.match(body, /\.where\(projectFilter\)/)
})

// ─── Tenant isolation audit: project-reports.ts / wallet-reports.ts ───────
// Every client-accessible report handler must AND a role-derived, non-
// user-suppliable scope condition — never rely solely on a filter-supplied
// clientId/projectId. Confirmed safe by inspection (documented here as a
// regression guard, not a fix, since no gap was found).

test('getProjectSummaryReport / getProjectProgressReport: client role always pushes its own clientId condition (AND-safe against a manipulated filters.clientId)', () => {
  for (const fn of ['getProjectSummaryReport', 'getProjectProgressReport']) {
    const body = functionBody(PROJECT_REPORTS_SRC, `export async function ${fn}`)
    assert.match(body, /currentUser\.role === 'client'\) conditions\.push\(eq\(project\.clientId, currentUser\.id\)\)/, `${fn} must unconditionally scope a client-role caller to their own clientId`)
  }
})

test('getClientProjectReport: a client-role caller\'s own id always wins over any filter-supplied clientId (not just AND-safe, filter is fully ignored)', () => {
  const body = functionBody(PROJECT_REPORTS_SRC, 'export async function getClientProjectReport')
  assert.match(body, /if \(currentUser\.role === 'client'\) clientIds = \[currentUser\.id\]/)
  assert.match(body, /else if \(filters\.clientId\) clientIds = \[filters\.clientId\]/, 'the filter branch must be an ELSE — unreachable for a client-role caller')
})

test('wallet report handlers all AND a role-derived client scope before any filter-supplied clientId', () => {
  for (const fn of ['getSupportWalletReport', 'getWalletTransactionReport', 'getWalletHistoryReport']) {
    const body = functionBody(WALLET_REPORTS_SRC, `export async function ${fn}`)
    assert.match(body, /currentUser\.role === 'client'\) (conditions|walletConditions)\.push\(eq\(supportWallet\.clientId, currentUser\.id\)\)/, `${fn} must unconditionally scope a client-role caller to their own wallet`)
  }
})

test('getWalletConsumptionReport already uses the org-aware getClientOrgUserIds scope (unchanged by this phase)', () => {
  const body = functionBody(WALLET_REPORTS_SRC, 'export async function getWalletConsumptionReport')
  assert.match(body, /getClientOrgUserIds\(currentUser\.id, currentUser\.userType/)
})

// ─── Wiring: filter panel actually reuses the existing pipeline ───────────

test('ClientReportsView applies filters through the SAME getReportData action already used for the 4 preset cards (no new fetch path)', () => {
  const importCount = [...CLIENT_REPORTS_VIEW_SRC.matchAll(/getReportData/g)].length
  assert.ok(importCount >= 2, 'getReportData must be both imported and called (handleGenerateReport)')
  assert.match(CLIENT_REPORTS_VIEW_SRC, /onApply=\{handleGenerateReport\}/, 'the filter panel\'s Apply must drive the exact same handler the cards use')
})

test('ClientReportsView export/refresh continue to read from the same `report` state the filter panel updates (export/refresh reflect active filters)', () => {
  assert.match(CLIENT_REPORTS_VIEW_SRC, /<ReportExport[\s\S]*?columns=\{report\.columns\}/)
  assert.match(CLIENT_REPORTS_VIEW_SRC, /<ReportExport[\s\S]*?data=\{report\.data\}/)
})

test('report-center-client.tsx (admin/manager) is untouched by this phase — still renders ReportFilters with the full unscoped clients list', () => {
  assert.match(REPORT_CENTER_CLIENT_SRC, /<ReportFilters/)
  assert.match(REPORT_CENTER_CLIENT_SRC, /clients=\{formData\.clients\}/)
})

// ─── Developer filter is hidden for Client reports (other roles unchanged) ──

test('report-filters.tsx: Developer filter is rendered only when the role is not client', () => {
  assert.match(REPORT_FILTERS_SRC, /const showDeveloperFilter = userRole !== 'client'/)
  const guard = REPORT_FILTERS_SRC.indexOf('{showDeveloperFilter && (')
  const label = REPORT_FILTERS_SRC.indexOf('Support Engineer / Developer</Label>')
  assert.ok(guard !== -1 && label > guard, 'the Developer field (label + select) must sit inside the showDeveloperFilter guard')
  assert.ok(label - guard < 200, 'the guard must wrap the Developer field container itself (no empty wrapper left behind)')
})

test('report-filters.tsx: a client request never carries developerId (state, request and active-filter count)', () => {
  assert.match(REPORT_FILTERS_SRC, /useState\(userRole === 'client' \? '' : initialFilters\?\.developerId \|\| ''\)/)
  assert.match(REPORT_FILTERS_SRC, /if \(!isClient\) filters\.developerId = developerId/)
  assert.match(REPORT_FILTERS_SRC, /isClient \? '' : developerId/)
})

test('report-filters.tsx: non-client roles keep the Developer filter and still send developerId', () => {
  // Same select, same state setter, same request field as before — only gated for clients.
  assert.match(REPORT_FILTERS_SRC, /<Select value=\{developerId\} onValueChange=\{setDeveloperId\}>/)
  assert.match(REPORT_FILTERS_SRC, /filters\.developerId = developerId/)
})