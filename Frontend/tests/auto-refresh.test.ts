import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Portal-wide background auto-refresh
// ============================================================================
// AutoRefreshProvider (components/dashboard/auto-refresh-provider.tsx) is a
// single controller mounted once in app/dashboard/layout.tsx, replacing the
// old per-page <TicketAutoRefresh /> (which only ever covered the ticket
// detail page). It cannot be mounted under plain node:test (needs React +
// next/navigation's useRouter + TourProvider's useTour context), so these
// tests are source-level regression guards on:
//   (a) the controller's own behavior contract (idle threshold, activity
//       events, no window.location.reload, overlay/focus/suppression guards,
//       visibility handling, single-timer discipline)
//   (b) it being mounted exactly once, at the dashboard layout
//   (c) the old per-page component being fully retired (no duplicate timers)
//   (d) the two pages with genuine unsaved-state risk (Create Ticket,
//       Profile) registering a suppression guard

const ROOT = join(import.meta.dirname, '..')
const PROVIDER_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'auto-refresh-provider.tsx'), 'utf8')
const LAYOUT_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'layout.tsx'), 'utf8')
const TICKET_DETAIL_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'tickets', '[id]', 'page.tsx'), 'utf8')
const NEW_TICKET_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'tickets', 'new', 'page.tsx'), 'utf8')
const PROFILE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'profile', 'profile-client.tsx'), 'utf8')

// ─── Idle threshold + polling cadence ──────────────────────────────────────

test('idle threshold is exactly 30 seconds', () => {
  assert.match(PROVIDER_SRC, /const IDLE_MS = 30_000/)
})

test('the idle check reschedules itself after every fire, so it keeps checking every 30s while inactive', () => {
  const fnBody = PROVIDER_SRC.slice(PROVIDER_SRC.indexOf('const scheduleIdleCheck'))
  const closing = fnBody.indexOf('}, [clearIdleTimer')
  const scheduleBody = fnBody.slice(0, closing)
  // The setTimeout callback must call scheduleIdleCheck() again itself,
  // regardless of whether a refresh actually fired that tick.
  assert.match(scheduleBody, /scheduleIdleCheck\(\)/)
})

// ─── Activity detection ─────────────────────────────────────────────────────

test('activity detection covers mouse movement, mouse click, keyboard input, scrolling and touch', () => {
  assert.match(PROVIDER_SRC, /'mousemove'/)
  assert.match(PROVIDER_SRC, /'mousedown'/)
  assert.match(PROVIDER_SRC, /'click'/)
  assert.match(PROVIDER_SRC, /'keydown'/)
  assert.match(PROVIDER_SRC, /'scroll'/)
  assert.match(PROVIDER_SRC, /'touchstart'/)
})

test('activity listeners are passive (never block scrolling/input) and any activity resets the idle countdown', () => {
  assert.match(PROVIDER_SRC, /passive:\s*true/)
  assert.match(PROVIDER_SRC, /const markActivity = \(\) => \{[\s\S]*?scheduleIdleCheck\(\)/)
})

// ─── Never a full reload ───────────────────────────────────────────────────

test('refresh never uses window.location.reload() — only router.refresh()', () => {
  assert.doesNotMatch(PROVIDER_SRC, /location\.reload/)
  assert.match(PROVIDER_SRC, /router\.refresh\(\)/)
})

// ─── Form / unsaved-changes / modal / dropdown protection ─────────────────

test('a focused input, textarea, select or contenteditable element blocks the refresh', () => {
  assert.match(PROVIDER_SRC, /tag === 'INPUT' \|\| tag === 'TEXTAREA' \|\| tag === 'SELECT'/)
  assert.match(PROVIDER_SRC, /isContentEditable === true/)
  assert.match(PROVIDER_SRC, /if \(focusedEditableRef\.current\) return false/)
})

test('any open dialog, alert-dialog, select, dropdown-menu or popover blocks the refresh', () => {
  assert.match(PROVIDER_SRC, /data-slot="dialog-content"/)
  assert.match(PROVIDER_SRC, /data-slot="alert-dialog-content"/)
  assert.match(PROVIDER_SRC, /data-slot="select-content"/)
  assert.match(PROVIDER_SRC, /data-slot="dropdown-menu-content"/)
  assert.match(PROVIDER_SRC, /data-slot="popover-content"/)
  assert.match(PROVIDER_SRC, /if \(document\.querySelector\(OPEN_OVERLAY_SELECTOR\)\) return false/)
})

test('a guided tour in progress blocks the refresh', () => {
  assert.match(PROVIDER_SRC, /import \{ useTour \} from '@\/components\/tour\/tour-provider'/)
  assert.match(PROVIDER_SRC, /if \(tourActiveRef\.current\) return false/)
})

test('components can explicitly veto the refresh via useAutoRefreshGuard for genuinely unsaved state', () => {
  assert.match(PROVIDER_SRC, /export function useAutoRefreshGuard\(suppress: boolean\)/)
  assert.match(PROVIDER_SRC, /if \(suppressRef\.current > 0\) return false/)
})

test('Create Ticket page suppresses background refresh for as long as it is mounted', () => {
  assert.match(NEW_TICKET_SRC, /import \{ useAutoRefreshGuard \} from '@\/components\/dashboard\/auto-refresh-provider'/)
  assert.match(NEW_TICKET_SRC, /useAutoRefreshGuard\(true\)/)
})

test('Profile page suppresses background refresh only while there are unsaved edits (isDirty)', () => {
  assert.match(PROFILE_SRC, /import \{ useAutoRefreshGuard \} from '@\/components\/dashboard\/auto-refresh-provider'/)
  assert.match(PROFILE_SRC, /useAutoRefreshGuard\(isDirty\)/)
  // Dirty-check must cover every editable profile field, including the
  // password fields, so an in-progress password change is never lost.
  assert.match(PROFILE_SRC, /fullName !== user\.name/)
  assert.match(PROFILE_SRC, /currentPassword !== ''/)
  assert.match(PROFILE_SRC, /newPassword !== ''/)
  assert.match(PROFILE_SRC, /confirmPassword !== ''/)
})

// ─── Tab visibility handling ────────────────────────────────────────────────

test('the idle timer is fully cleared (not just skipped) while the tab is hidden — no work while backgrounded', () => {
  assert.match(PROVIDER_SRC, /document\.visibilityState === 'visible'\) \{[\s\S]*?\} else \{[\s\S]*?clearIdleTimer\(\)/)
})

test('returning to a visible tab refreshes once only if the last refresh is older than the 30s idle window', () => {
  const onVisibilityBody = PROVIDER_SRC.slice(
    PROVIDER_SRC.indexOf('const onVisibility'),
    PROVIDER_SRC.indexOf('const activityEvents'),
  )
  assert.match(onVisibilityBody, /Date\.now\(\) - lastRefreshRef\.current > IDLE_MS/)
  assert.match(onVisibilityBody, /doRefresh\(\)/)
})

test('a refreshing lock prevents overlapping/simultaneous refreshes', () => {
  assert.match(PROVIDER_SRC, /if \(refreshingRef\.current\) return/)
  assert.match(PROVIDER_SRC, /refreshingRef\.current = true/)
})

// ─── Cleanup / no memory leaks ──────────────────────────────────────────────

test('every listener and timer registered in the effect is removed in its cleanup function', () => {
  const effectBody = PROVIDER_SRC.slice(
    PROVIDER_SRC.indexOf('useEffect(() => {\n    const markActivity'),
  )
  assert.match(effectBody, /return \(\) => \{[\s\S]*clearIdleTimer\(\)[\s\S]*removeEventListener[\s\S]*\}/)
  assert.match(effectBody, /activityEvents\.forEach\(\(e\) => window\.removeEventListener\(e, markActivity, opts\)\)/)
  assert.match(effectBody, /removeEventListener\('focusin', onFocusIn\)/)
  assert.match(effectBody, /removeEventListener\('focusout', onFocusOut\)/)
  assert.match(effectBody, /removeEventListener\('visibilitychange', onVisibility\)/)
})

// ─── Exactly one controller, mounted once, no duplicate timers ────────────

test('AutoRefreshProvider is mounted exactly once, in the dashboard layout', () => {
  assert.match(LAYOUT_SRC, /import \{ AutoRefreshProvider \} from '@\/components\/dashboard\/auto-refresh-provider'/)
  const opens = (LAYOUT_SRC.match(/<AutoRefreshProvider>/g) ?? []).length
  assert.equal(opens, 1)
})

test('AutoRefreshProvider is nested inside TourProvider so useTour() is available', () => {
  const tourIdx = LAYOUT_SRC.indexOf('<TourProvider')
  const autoRefreshIdx = LAYOUT_SRC.indexOf('<AutoRefreshProvider>')
  assert.ok(tourIdx !== -1 && autoRefreshIdx !== -1 && tourIdx < autoRefreshIdx)
})

test('the old per-page TicketAutoRefresh component has been fully retired (no duplicate timers)', () => {
  assert.doesNotMatch(TICKET_DETAIL_SRC, /TicketAutoRefresh/)
  assert.throws(() => readFileSync(join(ROOT, 'components', 'dashboard', 'ticket-auto-refresh.tsx'), 'utf8'))
})

test('ticket detail page background refresh now comes from the centralized provider, not a page-local timer', () => {
  assert.doesNotMatch(TICKET_DETAIL_SRC, /setInterval/)
  assert.doesNotMatch(TICKET_DETAIL_SRC, /setTimeout.*refresh/i)
})
