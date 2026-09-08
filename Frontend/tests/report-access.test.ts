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
const REPORT_VIEW_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'reports', 'view', 'page.tsx'), 'utf8')

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

// ─── Client Dashboard "Reports" cards route through a real report ─────────

test('ClientReportsSection routes through the report system, not the raw ticket list', () => {
  const start = DASHBOARD_SRC.indexOf('function ClientReportsSection')
  assert.ok(start >= 0, 'ClientReportsSection not found in app/dashboard/page.tsx')
  const end = DASHBOARD_SRC.indexOf('\n}', DASHBOARD_SRC.indexOf('return (', start))
  const body = DASHBOARD_SRC.slice(start, end)

  assert.match(body, /title: 'Total Tickets'/)
  assert.match(body, /title: 'In Progress'/)
  assert.match(body, /title: 'Pending for Approval \(Client\)'/)
  assert.match(body, /title: 'Closed'/)

  // Each card must open /dashboard/reports/view (a real report), never the
  // bare ticket list — that was the "Billable Hours -> Worklog"-style wrong-
  // destination bug for the client's own Reports section.
  assert.ok(!body.includes("href: '/dashboard/tickets"), 'client report cards must not link straight to the ticket list')
  assert.match(body, /href: '\/dashboard\/reports\/view\?report=ticket_summary'/, 'Total Tickets must open ticket_summary with no status filter')
  assert.match(body, /href: '\/dashboard\/reports\/view\?report=ticket_summary&status=in_progress'/)
  assert.match(body, /href: '\/dashboard\/reports\/view\?report=ticket_summary&status=client_review'/)
  assert.match(body, /href: '\/dashboard\/reports\/view\?report=ticket_summary&status=closed'/)

  // Only real, existing TicketStatus values are used — never an invented one.
  const usedStatuses = [...body.matchAll(/status=([a-z_]+)'/g)].map(m => m[1])
  for (const s of usedStatuses) {
    assert.ok(['in_progress', 'client_review', 'closed'].includes(s), `unexpected/invented status "${s}" in ClientReportsSection`)
  }
})

test('ClientReportsSection stays gated to the client role only', () => {
  const start = DASHBOARD_SRC.indexOf('function ClientReportsSection')
  assert.ok(start >= 0, 'ClientReportsSection not found in app/dashboard/page.tsx')
  const nextFn = DASHBOARD_SRC.indexOf('\nfunction ', start + 1)
  const body = DASHBOARD_SRC.slice(start, nextFn === -1 ? undefined : nextFn)
  assert.match(body, /if \(userRole !== 'client'\) return null/, 'ClientReportsSection must stay gated to role === client')
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

test('Report Center page passes the current user role into ReportFilters', () => {
  assert.match(REPORT_VIEW_PAGE_SRC, /userRole=\{formData\.role/)
})

test('getReportFormData returns the caller\'s role so the dropdown can be scoped', () => {
  assert.match(QUERIES_SRC, /return \{ \.\.\.data, role \}/)
})
