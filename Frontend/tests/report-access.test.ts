import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPORT_TYPE_OPTIONS } from '../lib/report-types.ts'

// ============================================================================
// Client Reports — authorization, routing & tenant-isolation regression suite
// ============================================================================
// checkAccess() (app/actions/reports/types.ts) can't be imported directly
// here: it pulls in '@/lib/types', a path alias node's native TS loader
// (--experimental-strip-types) can't resolve outside the Next.js bundler —
// the same constraint the rest of this test directory works around by
// keeping imports dependency-free or reading source text (see
// notification-utils.test.mjs's BRIDGE_EVENT_TYPES pattern). These tests
// read the real source instead of re-implementing the access matrix, so
// they stay honest to whatever checkAccess() actually does.

const ROOT = join(import.meta.dirname, '..')
const CHECK_ACCESS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'reports', 'types.ts'), 'utf8')
const QUERIES_SRC = readFileSync(join(ROOT, 'app', 'actions', 'reports', 'queries.ts'), 'utf8')
const TICKET_REPORTS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'reports', 'ticket-reports.ts'), 'utf8')
const DASHBOARD_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'page.tsx'), 'utf8')
const REPORT_FILTERS_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'report-center', 'report-filters.tsx'), 'utf8')
// /dashboard/reports/view is now a server-side role dispatcher (page.tsx)
// that renders one of two client components: ReportCenterClient (admin/
// manager/developer — the original, unchanged generic Report Center) or
// ClientReportsView (the new dedicated 4-report page).
const REPORT_VIEW_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'reports', 'view', 'page.tsx'), 'utf8')
const REPORT_CENTER_CLIENT_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'reports', 'view', 'report-center-client.tsx'), 'utf8')
const CLIENT_REPORTS_VIEW_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'reports', 'view', 'client-reports-view.tsx'), 'utf8')

function extractArrayBlock(name: string): string {
  const re = new RegExp(`const ${name}: ReportType\\[\\] = \\[([\\s\\S]*?)\\]`)
  const m = CHECK_ACCESS_SRC.match(re)
  assert.ok(m, `could not find "${name}" in app/actions/reports/types.ts — checkAccess() may have been restructured`)
  return m![1]
}

function includesType(block: string, type: string): boolean {
  return new RegExp(`['"]${type}['"]`).test(block)
}

const clientReports = extractArrayBlock('clientReports')
const managerReports = extractArrayBlock('managerReports')
const devReports = extractArrayBlock('devReports')

// ─── Report catalog sanity ──────────────────────────────────────────────────

test('report catalog: every REPORT_TYPE_OPTIONS entry is well-formed', () => {
  for (const opt of REPORT_TYPE_OPTIONS) {
    assert.ok(opt.value && opt.label && opt.category, `malformed report option: ${JSON.stringify(opt)}`)
  }
})

// ─── checkAccess: the 4 required Client Reports ────────────────────────────

test('checkAccess: client is authorized for ticket_summary (Total/In Progress/Pending/Closed cards)', () => {
  assert.ok(includesType(clientReports, 'ticket_summary'), 'client must be able to run ticket_summary')
})

test('checkAccess: client is NEVER authorized for internal/admin-only reports', () => {
  const adminOrInternalOnly = [
    'worklog', 'billable_hours', 'non_billable_hours',
    'sla_compliance', 'sla_breach', 'team_performance',
    'developer_productivity', 'developer_workload', 'assignment', 'analytics',
  ]
  for (const type of adminOrInternalOnly) {
    assert.ok(!includesType(clientReports, type), `client must NOT be authorized for '${type}' (internal/admin-only report)`)
  }
})

test('checkAccess: manager retains full worklog/billable-hours access (client fix must not narrow it)', () => {
  assert.ok(includesType(managerReports, 'worklog'), 'manager access to worklog must be unaffected')
  assert.ok(includesType(managerReports, 'billable_hours'), 'manager access to billable_hours must be unaffected')
})

test('checkAccess: developer cannot run manager-only reports (SLA, team performance)', () => {
  assert.ok(!includesType(devReports, 'sla_compliance'))
  assert.ok(!includesType(devReports, 'team_performance'))
})

test('checkAccess: admin bypasses every role list (unconditional access)', () => {
  assert.match(CHECK_ACCESS_SRC, /if \(userRole === 'admin'\) return true/)
})

// ─── Server-side enforcement (not just client-side hiding) ─────────────────

test('getReportData enforces checkAccess server-side before returning any data', () => {
  assert.match(QUERIES_SRC, /if \(!checkAccess\(currentUser\.role, filters\.reportType\)\) \{/)
  assert.match(QUERIES_SRC, /throw new Error\('Access denied to this report type'\)/)
})

// ─── Tenant isolation — ticket_summary/status/aging all org-scope clients ──

test('ticket_summary/status/aging reports scope clients to their own org (tenant isolation)', () => {
  const scopedFunctions = ['getTicketSummaryReport', 'getTicketStatusReport', 'getTicketAgingReport']
  for (const fn of scopedFunctions) {
    const start = TICKET_REPORTS_SRC.indexOf(`export async function ${fn}`)
    assert.ok(start >= 0, `${fn} not found in ticket-reports.ts`)
    const nextFn = TICKET_REPORTS_SRC.indexOf('export async function', start + 1)
    const body = TICKET_REPORTS_SRC.slice(start, nextFn === -1 ? undefined : nextFn)
    assert.match(body, /ticketClientScopeCondition\(currentUser\)/, `${fn} must scope role==='client' to the caller's own org (never another tenant's tickets)`)
  }
})

// ─── Client Dashboard no longer has an inline Reports KPI/card section ────

test('the old inline ClientReportsSection is fully removed from the dashboard', () => {
  assert.ok(!DASHBOARD_SRC.includes('ClientReportsSection'), 'ClientReportsSection must no longer exist anywhere in app/dashboard/page.tsx')
  assert.ok(!DASHBOARD_SRC.includes("title: 'Pending for Approval (Client)'"), 'the 4-card block must not still be inlined into the dashboard')
})

test('the main dashboard KPI cards (Total Tickets/Open/In Progress/Resolved) are untouched', () => {
  const start = DASHBOARD_SRC.indexOf('function StatsSection')
  assert.ok(start >= 0, 'StatsSection must still exist — it must NOT have been removed along with ClientReportsSection')
  const end = DASHBOARD_SRC.indexOf('\n}', DASHBOARD_SRC.indexOf('return (', start))
  const body = DASHBOARD_SRC.slice(start, end)
  assert.match(body, /title: 'Total Tickets'/)
  assert.match(body, /title: 'Open'/)
  assert.match(body, /title: 'In Progress'/)
  assert.match(body, /title: 'Resolved'/)
})

test('the Client Dashboard has a "Reports" entry point to the dedicated Client Reports page', () => {
  const idx = DASHBOARD_SRC.indexOf("user.role === 'client'")
  assert.ok(idx >= 0, 'no client-role-gated block found on the dashboard')
  const nearby = DASHBOARD_SRC.slice(idx, idx + 400)
  assert.match(nearby, /href="\/dashboard\/reports\/view"/, 'the Reports button must link to /dashboard/reports/view')
  assert.match(nearby, />\s*Reports\s*</, 'must be visibly labeled "Reports"')
})

// ─── /dashboard/reports/view — server-side role dispatch ──────────────────

test('the report view route dispatches by role SERVER-SIDE (getCurrentUser), not a client-side check', () => {
  assert.match(REPORT_VIEW_PAGE_SRC, /import \{ getCurrentUser \} from '@\/lib\/auth-utils'/)
  assert.match(REPORT_VIEW_PAGE_SRC, /const currentUser = await getCurrentUser\(\)/)
  assert.match(REPORT_VIEW_PAGE_SRC, /if \(currentUser\.role === 'client'\) \{/)
  assert.match(REPORT_VIEW_PAGE_SRC, /return <ReportCenterClient \/>/, 'every non-client role must still get the original, unchanged Report Center')
})

test('the client branch renders ClientReportsView using org-scoped stats, not a fresh/duplicate query', () => {
  assert.match(REPORT_VIEW_PAGE_SRC, /import \{ getConsolidatedDashboardData \} from '@\/app\/actions\/tickets'/)
  assert.match(REPORT_VIEW_PAGE_SRC, /const stats = await getConsolidatedDashboardData\(\)/)
  assert.match(REPORT_VIEW_PAGE_SRC, /<ClientReportsView/)
})

// ─── ClientReportsView — exactly 4 reports, each independently correct ────

test('ClientReportsView defines exactly 4 report cards', () => {
  const matches = [...CLIENT_REPORTS_VIEW_SRC.matchAll(/title: '([^']+)'/g)].map(m => m[1])
  assert.deepEqual(matches, ['Total Tickets', 'In Progress', 'Pending for Approval (Client)', 'Closed'])
})

test('ClientReportsView routes through the existing ticket_summary report, never the raw ticket list or a new report type', () => {
  assert.ok(!CLIENT_REPORTS_VIEW_SRC.includes("'/dashboard/tickets"), 'must never link straight to the ticket list')
  assert.match(CLIENT_REPORTS_VIEW_SRC, /report=ticket_summary/)
  assert.ok(!/report=(?!ticket_summary)[a-z_]+/.test(CLIENT_REPORTS_VIEW_SRC), 'must not introduce any report type other than ticket_summary')
  assert.match(CLIENT_REPORTS_VIEW_SRC, /import \{ getReportData \} from '@\/app\/actions\/reports'/, 'must reuse the existing getReportData action')
})

test('KNOWN ISSUE regression: each of the 4 cards maps to its own status — Total ≠ In Progress ≠ Pending ≠ Closed ≠ Total', () => {
  const cardBlockStart = CLIENT_REPORTS_VIEW_SRC.indexOf('const CLIENT_REPORT_CARDS')
  const cardBlockEnd = CLIENT_REPORTS_VIEW_SRC.indexOf(']\n', cardBlockStart)
  const block = CLIENT_REPORTS_VIEW_SRC.slice(cardBlockStart, cardBlockEnd)

  const total = block.match(/\{ title: 'Total Tickets', getValue:/)
  const inProgress = block.match(/\{ title: 'In Progress', status: '(\w+)'/)
  const pending = block.match(/\{ title: 'Pending for Approval \(Client\)', status: '(\w+)'/)
  const closed = block.match(/\{ title: 'Closed', status: '(\w+)'/)

  assert.ok(total, 'Total Tickets card not found')
  assert.ok(!block.match(/\{ title: 'Total Tickets', status:/), 'Total Tickets must have NO status filter (all tickets), never share a status with another card')
  assert.ok(inProgress && pending && closed, 'one or more of In Progress / Pending for Approval (Client) / Closed is missing its status')

  const statuses = [inProgress![1], pending![1], closed![1]]
  assert.equal(new Set(statuses).size, 3, `In Progress / Pending for Approval / Closed must each use a DIFFERENT status — got: ${statuses.join(', ')}`)
  assert.equal(inProgress![1], 'in_progress')
  assert.equal(pending![1], 'client_review')
  assert.equal(closed![1], 'closed')

  // Only real, existing TicketStatus values are used — never an invented one.
  const usedStatuses = [...CLIENT_REPORTS_VIEW_SRC.matchAll(/status=\$\{status\}|status: '([a-z_]+)'/g)].map(m => m[1]).filter(Boolean)
  for (const s of usedStatuses) {
    assert.ok(['in_progress', 'client_review', 'closed'].includes(s), `unexpected/invented status "${s}" in ClientReportsView`)
  }
})

test('KNOWN ISSUE regression: each card\'s href is built from its OWN status — clicking one can never open another', () => {
  assert.match(CLIENT_REPORTS_VIEW_SRC, /function cardHref\(status\?: string\): string \{/)
  const fnStart = CLIENT_REPORTS_VIEW_SRC.indexOf('function cardHref')
  const fnEnd = CLIENT_REPORTS_VIEW_SRC.indexOf('\n}', fnStart)
  const fn = CLIENT_REPORTS_VIEW_SRC.slice(fnStart, fnEnd)
  assert.match(fn, /report=ticket_summary&status=\$\{status\}/)
  assert.match(fn, /'\/dashboard\/reports\/view\?report=ticket_summary'/, 'no status -> plain ticket_summary link (Total Tickets)')
  // The cards map href={cardHref(card.status)} — each card's OWN status,
  // never a shared/hardcoded value.
  assert.match(CLIENT_REPORTS_VIEW_SRC, /href=\{cardHref\(card\.status\)\}/)
})

test('ClientReportsView never renders the generic admin/manager report-type dropdown', () => {
  // The ReportFilters TYPE is fine to import (it's the shared filters shape,
  // e.g. useState<ReportFiltersType> — note the substring "<ReportFilters"
  // also appears there, so match a real JSX tag boundary specifically);
  // the DROPDOWN COMPONENT must never be rendered here.
  assert.ok(!/<ReportFilters[\s/>]/.test(CLIENT_REPORTS_VIEW_SRC), 'a client must never see the generic multi-category report dropdown')
  assert.ok(!CLIENT_REPORTS_VIEW_SRC.includes("from '@/components/dashboard/report-center/report-filters'"), 'must not even import the dropdown component')
})

// ─── report-center-client.tsx — admin/manager/developer experience unchanged ─

test('ReportCenterClient (admin/manager/developer) still has the full generic filter-driven Report Center', () => {
  assert.match(REPORT_CENTER_CLIENT_SRC, /export function ReportCenterClient\(\)/)
  assert.match(REPORT_CENTER_CLIENT_SRC, /<ReportFilters/)
  assert.match(REPORT_CENTER_CLIENT_SRC, /getReportFormData/)
  assert.match(REPORT_CENTER_CLIENT_SRC, /getReportData/)
})

// ─── Admin/Manager Report Center routes are unaffected ─────────────────────

test('Admin dashboard KPI report links are unchanged (unaffected by the client fix)', () => {
  assert.match(DASHBOARD_SRC, /href: '\/dashboard\/reports\/view\?report=ticket_summary'/)
  assert.match(DASHBOARD_SRC, /href: '\/dashboard\/reports\/view\?report=ticket_status&status=open'/)
  assert.match(DASHBOARD_SRC, /href: '\/dashboard\/reports\/view\?report=ticket_status&status=in_progress'/)
  assert.match(DASHBOARD_SRC, /href: '\/dashboard\/reports\/view\?report=ticket_resolution'/)
})

// ─── Report Center dropdown is role-aware (fixes "opens an Admin report") ──

test('ReportFilters hides report types the current role cannot run', () => {
  assert.match(REPORT_FILTERS_SRC, /userRole/, 'ReportFilters must accept a userRole prop')
  assert.match(REPORT_FILTERS_SRC, /checkAccess\(userRole, opt\.value\)/, 'ReportFilters must filter REPORT_TYPE_OPTIONS through checkAccess')
})

test('ReportCenterClient passes the current user role into ReportFilters', () => {
  assert.match(REPORT_CENTER_CLIENT_SRC, /userRole=\{formData\.role/)
})

test('getReportFormData returns the caller\'s role so the dropdown can be scoped', () => {
  assert.match(QUERIES_SRC, /return \{ \.\.\.data, role \}/)
})
