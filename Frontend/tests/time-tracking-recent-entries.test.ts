// Time Tracking → Recent Entries: working Export, working "View all entries",
// internal scrolling. Timer + billing rules are reused, not duplicated.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { entryStatus, TIME_ENTRY_EXPORT_HEADERS, timeEntryExportFilename, timeEntryExportRows, type ExportableTimeEntry } from '../lib/time-entry-export.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const CLIENT = read('app/dashboard/time-tracking/time-tracking-client.tsx')
const ACTIONS = read('app/actions/tickets/timelogs.ts')
const REPORTS = read('app/actions/reports/developer-reports.ts')
const REPORT_TYPES = read('app/actions/reports/types.ts')
const REPORT_CENTER = read('app/dashboard/reports/view/report-center-client.tsx')

const entry = (over: Partial<ExportableTimeEntry> = {}): ExportableTimeEntry => ({
  id: 1, ticketId: 1998, startTime: '2026-09-30T04:41:12.553Z', endTime: '2026-09-30T04:43:33.494Z',
  durationMinutes: 135, description: 'Started working', isBillable: true,
  ticketNumber: 'TKT-MUL7YXIW-AKA9', ticketTitle: 'Create new purchase invoice report', userName: 'Hem Maheshwari', ...over,
})

test('export rows: date, ticket, duration, billable (from server rule), status (timer rule), resource', () => {
  assert.deepEqual([...TIME_ENTRY_EXPORT_HEADERS], ['Date', 'Ticket ID', 'Ticket Title', 'Duration', 'Minutes', 'Billable', 'Status', 'Resource', 'Description'])
  assert.deepEqual(timeEntryExportRows([entry()])[0], [
    '2026-09-30', 'TKT-MUL7YXIW-AKA9', 'Create new purchase invoice report', '2h 15m', 135, 'Billable', 'Stopped', 'Hem Maheshwari', 'Started working',
  ])
  const [paused] = timeEntryExportRows([entry({ description: 'Started working [Paused at 2m]', isBillable: false })])
  assert.equal(paused[5], 'Non-Billable')
  assert.equal(paused[6], 'Paused')
  assert.equal(paused[8], 'Started working', 'internal pause marker not exported')
  assert.equal(entryStatus({ endTime: null, description: null }), 'Running')
  assert.equal(timeEntryExportRows([entry({ ticketNumber: null, ticketTitle: null })])[0][1], '#1998', 'deleted ticket still identified')
  assert.deepEqual(timeEntryExportRows([]), [])
  assert.match(timeEntryExportFilename(new Date('2026-09-30T10:00:00Z')), /^time-entries-2026-09-30\.xlsx$/)
})

test('export data is the current developer\'s own entries, classified by the shared billing rule', () => {
  const fn = ACTIONS.slice(ACTIONS.indexOf('export const getMyTimeEntriesForExport'))
  assert.match(fn, /if \(currentUser\.role !== 'developer'\) return \[\]/)
  assert.match(fn, /\.where\(eq\(timeLog\.userId, currentUser\.id\)\)/)
  assert.match(fn, /isBillable: timeLogIsBillable,/)
})

test('Export button: wired, disabled while exporting, empty + error feedback, real download via shared helpers', () => {
  assert.match(CLIENT, /onClick=\{handleExport\}\s*\n\s*disabled=\{exporting\}/)
  assert.match(CLIENT, /\{exporting \? 'Exporting…' : 'Export'\}/)
  assert.match(CLIENT, /There are no time entries to export yet\./)
  assert.match(CLIENT, /Export failed\. Please try again\./)
  assert.match(CLIENT, /const xlsx = buildXlsx\(\[\{/)
  assert.match(CLIENT, /downloadFile\(xlsx, timeEntryExportFilename\(\), XLSX_MIME\)/)
  // One download helper, shared with the Report Center export.
  assert.match(read('components/dashboard/report-center/report-export.tsx'), /import \{ downloadFile \} from '@\/lib\/download-file'/)
  assert.doesNotMatch(read('components/dashboard/report-center/report-export.tsx'), /function downloadFile\(/)
})

test('View all entries is a real link to the Worklog report — allowed for developers and scoped to their own entries', () => {
  assert.match(CLIENT, /export const VIEW_ALL_ENTRIES_HREF = '\/dashboard\/reports\/view\?report=worklog'/)
  assert.match(CLIENT, /<Link\s*\n\s*href=\{VIEW_ALL_ENTRIES_HREF\}[\s\S]{0,200}View all entries\s*\n\s*<\/Link>/)
  assert.doesNotMatch(CLIENT, /<button[^>]*>\s*View all entries/)
  assert.match(REPORT_TYPES, /const devReports: ReportType\[\] = \[[\s\S]*?'worklog'/)
  assert.match(REPORT_CENTER, /const reportParam = searchParams\.get\('report'\)[\s\S]*?handleGenerateReport\(presetFilters\)/)
  // Worklog / Billable / Non-Billable reports: a developer only sees their own entries.
  assert.equal((REPORTS.match(/if \(currentUser\.role === 'developer'\) conditions\.push\(eq\(timeLog\.userId, currentUser\.id\)\)/g) || []).length, 3)
})

test('Recent Entries: fixed header/footer, entries scroll internally, height follows the Timer card on desktop', () => {
  assert.match(CLIENT, /<div className="relative min-h-0">\s*\n\s*<div data-tour="time-tracker-entries" className="flex flex-col max-h-\[28rem\] lg:max-h-none lg:absolute lg:inset-0/)
  assert.match(CLIENT, /<div className="shrink-0 px-5 py-4 border-b/, 'header does not scroll')
  assert.match(CLIENT, /data-testid="recent-entries-scroll" className="flex-1 min-h-0 overflow-y-auto/, 'only the list scrolls')
  assert.match(CLIENT, /<div className="shrink-0 px-5 py-2\.5 text-center border-t/, 'View all stays visible')
  assert.match(CLIENT, /\.slice\(0, RECENT_ENTRIES_LIMIT\)/)
  assert.doesNotMatch(CLIENT, /recentEntries\.slice\(0, 8\)/)
})

test('timer logic untouched by this change (still the shared server state)', () => {
  assert.match(CLIENT, /setTimer\(await getMyTimerState\(\)\)/)
  assert.match(CLIENT, /sessionElapsedSeconds\(/)
})
