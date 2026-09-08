import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fmtTz } from '../lib/datetime.ts'

// ============================================================================
// Dashboard clock (CurrentDate) — must use the Profile timezone, not the
// browser/device timezone
// ============================================================================
// Root cause: components/dashboard/page-header.tsx's CurrentDate computed
// dateStr/timeStr via date-fns's format(new Date(), ...), which always
// formats in whatever timezone the JS runtime (the visitor's browser) is
// running in — completely bypassing the existing TimezoneProvider context
// (components/timezone-provider.tsx, seeded from currentUser.timezone in
// app/dashboard/layout.tsx) and lib/datetime.ts's fmtTz/resolveDisplayTimezone,
// which every OTHER timestamp in the app already goes through (see e.g.
// components/dashboard/activity-log-panel.tsx). The fix wires CurrentDate to
// the same useUserTimezone()/fmtTz() pair instead of adding a second
// timezone system.
//
// CurrentDate itself can't be mounted under plain node:test (it needs React
// + the TimezoneProvider context), so these tests are split into:
//   (a) source-level regression guards on page-header.tsx's wiring
//   (b) direct fmtTz() scenario checks using the EXACT patterns CurrentDate
//       renders with ('EEEE, MMMM d, yyyy' and 'h:mm a'), proving the
//       underlying timezone math for every example the task named.

const ROOT = join(import.meta.dirname, '..')
const PAGE_HEADER_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'page-header.tsx'), 'utf8')

// ─── Source wiring: CurrentDate reuses the existing timezone system ───────

test('CurrentDate reads the Profile timezone via the existing TimezoneProvider context', () => {
  assert.match(PAGE_HEADER_SRC, /import \{ useUserTimezone \} from '@\/components\/timezone-provider'/)
  assert.match(PAGE_HEADER_SRC, /const userTimezone = useUserTimezone\(\)/)
})

test('CurrentDate formats both the date and the time through fmtTz (lib/datetime.ts), not date-fns format(new Date())', () => {
  assert.match(PAGE_HEADER_SRC, /import \{ fmtTz \} from '@\/lib\/datetime'/)
  assert.match(PAGE_HEADER_SRC, /setDateStr\(fmtTz\(now, 'EEEE, MMMM d, yyyy', userTimezone\)\)/)
  assert.match(PAGE_HEADER_SRC, /setTimeStr\(fmtTz\(now, 'h:mm a', userTimezone\)\)/)
  // Regression guard: must never revert to formatting new Date() directly
  // with date-fns (that's browser-local time, the original bug).
  assert.ok(!PAGE_HEADER_SRC.includes("from 'date-fns'"), 'must not reintroduce a raw date-fns format() call')
})

test('no hardcoded timezone anywhere in the dashboard clock (must always come from the profile/context)', () => {
  // A hardcoded IANA zone (Asia/Kolkata or otherwise) would defeat the whole
  // point — the displayed zone must always be data-driven. Check literal
  // string matches for common zones directly, rather than a generic
  // "letters/letters in quotes" regex that risks false positives against
  // unrelated content (e.g. Tailwind classes like "bg-slate-800/80" or
  // import paths like "@/lib/datetime").
  const commonZones = [
    'Asia/Kolkata', 'Asia/Calcutta', 'America/New_York', 'Europe/London',
    'America/Los_Angeles', 'America/Chicago', 'Asia/Dubai', 'Asia/Singapore',
    'Australia/Sydney', 'Europe/Paris', 'Europe/Berlin', 'UTC', 'GMT',
  ]
  for (const zone of commonZones) {
    assert.ok(!PAGE_HEADER_SRC.includes(`'${zone}'`) && !PAGE_HEADER_SRC.includes(`"${zone}"`),
      `page-header.tsx must not hardcode the timezone "${zone}"`)
  }
})

test('the clock re-renders when the resolved timezone changes, without requiring a code change or page reload', () => {
  assert.match(PAGE_HEADER_SRC, /\}, \[userTimezone\]\)/)
})

test('the clock keeps live-updating on an interval (unchanged 30s cadence, no removal of the polling)', () => {
  assert.match(PAGE_HEADER_SRC, /setInterval\(update, 30000\)/)
  assert.match(PAGE_HEADER_SRC, /clearInterval\(interval\)/)
})

test('dashboard UI/markup is unchanged — same icons, layout classes and structure', () => {
  assert.match(PAGE_HEADER_SRC, /<Calendar size=\{14\}/)
  assert.match(PAGE_HEADER_SRC, /<Clock size=\{14\}/)
  assert.match(PAGE_HEADER_SRC, /hidden sm:flex items-center gap-2 px-3 py-1\.5 rounded-xl/)
})

// ─── TimezoneProvider is seeded from the real profile value, not a guess ──

test('TimezoneProvider is seeded from currentUser.timezone (the saved Profile -> Personal Information value)', () => {
  const layoutSrc = readFileSync(join(ROOT, 'app', 'dashboard', 'layout.tsx'), 'utf8')
  assert.match(layoutSrc, /<TimezoneProvider timezone=\{currentUser!\.timezone\}>/)
})

test('useUserTimezone never throws without a provider and never silently invents a value (nullable context, resolved downstream by fmtTz)', () => {
  const providerSrc = readFileSync(join(ROOT, 'components', 'timezone-provider.tsx'), 'utf8')
  assert.match(providerSrc, /createContext<string \| null>\(null\)/)
  assert.ok(!providerSrc.includes("'Asia/Kolkata'") && !providerSrc.includes('"Asia/Kolkata"'),
    'the provider itself must not hardcode any timezone')
})

// ─── fmtTz scenario checks — the exact patterns CurrentDate renders with ──

const DATE_PATTERN = 'EEEE, MMMM d, yyyy'
const TIME_PATTERN = 'h:mm a'

test('Profile timezone = Asia/Kolkata -> dashboard clock shows India date/time', () => {
  // 2026-09-08T23:45:00Z is 2026-09-09, 05:15 AM in Asia/Kolkata (UTC+5:30).
  const instant = new Date(Date.UTC(2026, 8, 8, 23, 45, 0))
  assert.equal(fmtTz(instant, DATE_PATTERN, 'Asia/Kolkata'), 'Wednesday, September 9, 2026')
  assert.equal(fmtTz(instant, TIME_PATTERN, 'Asia/Kolkata'), '5:15 AM')
})

test('Profile timezone = America/New_York -> dashboard clock shows New York date/time (DST-aware)', () => {
  // Same instant, but New York is still on 2026-09-08 (UTC-4 in September, EDT).
  const instant = new Date(Date.UTC(2026, 8, 8, 23, 45, 0))
  assert.equal(fmtTz(instant, DATE_PATTERN, 'America/New_York'), 'Tuesday, September 8, 2026')
  assert.equal(fmtTz(instant, TIME_PATTERN, 'America/New_York'), '7:45 PM')

  // Winter (EST, UTC-5) — same wall-clock pattern, different offset, proving
  // this goes through Intl.DateTimeFormat with the IANA zone name (DST-aware)
  // rather than a fixed offset.
  const winterInstant = new Date(Date.UTC(2026, 0, 15, 17, 0, 0))
  assert.equal(fmtTz(winterInstant, TIME_PATTERN, 'America/New_York'), '12:00 PM')
})

test('Profile timezone = Europe/London -> dashboard clock shows London date/time (DST-aware)', () => {
  // Summer (BST, UTC+1).
  const summerInstant = new Date(Date.UTC(2026, 6, 1, 23, 30, 0))
  assert.equal(fmtTz(summerInstant, DATE_PATTERN, 'Europe/London'), 'Thursday, July 2, 2026')
  assert.equal(fmtTz(summerInstant, TIME_PATTERN, 'Europe/London'), '12:30 AM')

  // Winter (GMT, UTC+0) — same instant-of-day, different DST offset.
  const winterInstant = new Date(Date.UTC(2026, 0, 1, 23, 30, 0))
  assert.equal(fmtTz(winterInstant, DATE_PATTERN, 'Europe/London'), 'Thursday, January 1, 2026')
  assert.equal(fmtTz(winterInstant, TIME_PATTERN, 'Europe/London'), '11:30 PM')
})

test('date rolls over correctly around midnight in the profile timezone, not the underlying UTC instant', () => {
  // A single UTC instant that is a DIFFERENT calendar date in three
  // different profile timezones — proving the date (not just the time)
  // comes from the resolved zone.
  const instant = new Date(Date.UTC(2026, 8, 8, 23, 45, 0)) // 2026-09-08 23:45 UTC
  assert.equal(fmtTz(instant, DATE_PATTERN, 'UTC'), 'Tuesday, September 8, 2026')
  assert.equal(fmtTz(instant, DATE_PATTERN, 'Asia/Kolkata'), 'Wednesday, September 9, 2026', 'already past midnight in India')
  assert.equal(fmtTz(instant, DATE_PATTERN, 'America/Los_Angeles'), 'Tuesday, September 8, 2026', 'still afternoon on the US west coast')
})

test('three different profile timezones produce three different displayed times for the SAME instant (never the browser/server zone)', () => {
  const instant = new Date(Date.UTC(2026, 8, 8, 12, 0, 0))
  const kolkata = fmtTz(instant, TIME_PATTERN, 'Asia/Kolkata')
  const newYork = fmtTz(instant, TIME_PATTERN, 'America/New_York')
  const london = fmtTz(instant, TIME_PATTERN, 'Europe/London')
  assert.notEqual(kolkata, newYork)
  assert.notEqual(newYork, london)
  assert.notEqual(kolkata, london)
  assert.equal(kolkata, '5:30 PM')
  assert.equal(newYork, '8:00 AM')
  assert.equal(london, '1:00 PM')
})
