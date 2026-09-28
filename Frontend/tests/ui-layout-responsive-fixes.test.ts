import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// UI layout fixes — Client Report filter section overlap + Project Detail
// Ticket Status Breakdown label overflow. Presentational-only: these tests
// assert the responsive Tailwind classes changed AND that no filtering/data
// logic, API calls, or shared UI primitives (Badge, Select) were touched.
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const REPORT_FILTERS_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'report-center', 'report-filters.tsx'), 'utf8')
const ANALYTICS_SECTION_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'project-analytics-section.tsx'), 'utf8')
const BADGE_SRC = readFileSync(join(ROOT, 'components', 'ui', 'badge.tsx'), 'utf8')

// ─── Issue 1: Client Report filter section overlap ─────────────────────────

test('report-filters.tsx: the advanced-filters grid stacks to a single column on mobile, 2 on tablet, 4 on desktop', () => {
  assert.match(REPORT_FILTERS_SRC, /grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4/)
  assert.doesNotMatch(REPORT_FILTERS_SRC, /grid-cols-2 md:grid-cols-4/, 'the old grid (2 columns even on the narrowest phone) must be gone')
})

test('report-filters.tsx: the Report Type + Filters/Generate action row wraps onto its own line below `sm` instead of a rigid single flex row', () => {
  assert.match(REPORT_FILTERS_SRC, /flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4/)
})

test('report-filters.tsx: every filter field has min-w-0 so it can shrink inside its grid cell instead of forcing overflow', () => {
  const gridStart = REPORT_FILTERS_SRC.indexOf('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4')
  const gridEnd = REPORT_FILTERS_SRC.indexOf('</motion.div>', gridStart)
  assert.notEqual(gridEnd, -1)
  const gridBlock = REPORT_FILTERS_SRC.slice(gridStart, gridEnd)
  const fieldWrappers = gridBlock.match(/space-y-1\.5 min-w-0/g) || []
  assert.ok(fieldWrappers.length >= 7, `expected every filter field wrapper to have min-w-0, found ${fieldWrappers.length}`)
})

test('report-filters.tsx: no filtering/business logic was touched — handleApply, handleReset, and ALL_VALUE semantics are unchanged', () => {
  // Optional 2nd param = client Report Type preset (Total/Open/In Process/Resolved).
  assert.match(REPORT_FILTERS_SRC, /function handleApply\(typeOverride\?: ReportType, presetOverride\?: ClientReportPreset\) \{/)
  assert.match(REPORT_FILTERS_SRC, /const ALL_VALUE = '__all__'/)
  assert.match(REPORT_FILTERS_SRC, /if \(projectId && projectId !== ALL_VALUE\) filters\.projectId = Number\(projectId\)/)
  assert.match(REPORT_FILTERS_SRC, /const showClientFilter = userRole !== 'client'/)
})

test('report-filters.tsx: every original filter field is still present (no filter was removed)', () => {
  for (const label of ['Date From', 'Date To', 'Project', 'Support Engineer / Developer', 'Module / Service Area', 'Client', 'Status', 'Priority']) {
    assert.ok(REPORT_FILTERS_SRC.includes(label), `expected filter field "${label}" to still be present`)
  }
})

// ─── Issue 2: Project Detail Ticket Status Breakdown label overflow ────────

test('project-analytics-section.tsx: the shared Badge primitive itself is untouched (fix is local to this component only)', () => {
  assert.doesNotMatch(BADGE_SRC, /whitespace-normal|break-words|max-w-full/, 'components/ui/badge.tsx must not be modified — it is used across the whole app')
})

test('project-analytics-section.tsx: each status grid cell has min-w-0 (the CSS grid min-width:auto trap that lets a non-wrapping child overflow its cell)', () => {
  const start = ANALYTICS_SECTION_SRC.indexOf("grid grid-cols-2 sm:grid-cols-4 gap-3")
  assert.notEqual(start, -1)
  const block = ANALYTICS_SECTION_SRC.slice(start, start + 700)
  assert.match(block, /bg-muted\/20 border border-border\/30 min-w-0/)
})

test('project-analytics-section.tsx: the status Badge is locally overridden to wrap instead of overflowing (whitespace-normal + break-words + max-w-full)', () => {
  const start = ANALYTICS_SECTION_SRC.indexOf('Ticket Status Breakdown')
  const block = ANALYTICS_SECTION_SRC.slice(start, start + 2000)
  assert.match(block, /max-w-full whitespace-normal break-words/)
})

test('project-analytics-section.tsx: ticket status data/labels come from the SAME TICKET_STATUS_CONFIG source — no new status list, no renamed status, no count logic touched', () => {
  assert.match(ANALYTICS_SECTION_SRC, /TICKET_STATUS_CONFIG\[status as keyof typeof TICKET_STATUS_CONFIG\]\?\.label \|\| status/)
  assert.match(ANALYTICS_SECTION_SRC, /Object\.entries\(analytics\.ticketStatusMap\)\.map\(\(\[status, count\]\) =>/)
  assert.match(ANALYTICS_SECTION_SRC, /\{String\(count\)\}/, 'the raw count value must still be rendered unchanged')
})

test('project-analytics-section.tsx: the data-fetching calls (getProjectDetailAnalytics/getModuleAnalytics) are unchanged — UI-only fix', () => {
  assert.match(ANALYTICS_SECTION_SRC, /getProjectDetailAnalytics\(projectId\)/)
  assert.match(ANALYTICS_SECTION_SRC, /getModuleAnalytics\(projectId\)/)
})

test('project-analytics-section.tsx: no page-width or horizontal-scroll workaround was introduced', () => {
  assert.doesNotMatch(ANALYTICS_SECTION_SRC, /overflow-x-scroll|overflow-x-auto|min-w-\[/)
})
