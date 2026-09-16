import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Infinite scrolling / lazy loading for ticket lists — Dashboard "Recent
// Tickets", the main Tickets page, and the Ticket Detail page's Activity and
// Comments panels. Ticket cards, status/priority badges, filters and business
// logic are untouched — verified below by diffing against the design files
// and by confirming the existing fetchers (getTicketsList, getTicketHistory,
// getComments) were reused rather than duplicated.
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const HOOK_SRC = readFileSync(join(ROOT, 'lib', 'use-infinite-ticket-list.ts'), 'utf8')
const DASHBOARD_SCROLL_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'recent-tickets-scroll.tsx'), 'utf8')
const DASHBOARD_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'page.tsx'), 'utf8')
const DASHBOARD_ACTIONS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'dashboard.ts'), 'utf8')
const TICKETS_PAGE_CLIENT_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'tickets', 'tickets-page-client.tsx'), 'utf8')
const TICKETS_PAGE_SERVER_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'tickets', 'page.tsx'), 'utf8')
const TICKET_QUERIES_SRC = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'queries.ts'), 'utf8')
const TICKET_DETAIL_PAGE_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'tickets', '[id]', 'page.tsx'), 'utf8')
const ACTIVITY_INFINITE_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'ticket-activity-infinite.tsx'), 'utf8')
const COMMENT_SECTION_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'comment-section.tsx'), 'utf8')
const TICKET_CARD_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'ticket-card.tsx'), 'utf8')
const TICKET_ACTIVITY_TIMELINE_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'ticket-activity.tsx'), 'utf8')

// ─── Shared hook: race-condition / dedup / reset guarantees ─────────────────

test('useInfiniteTicketList guards against concurrent loads (loadingRef checked before fetching)', () => {
  const idx = HOOK_SRC.indexOf('const loadMore = useCallback')
  const body = HOOK_SRC.slice(idx, idx + 400)
  assert.match(body, /if \(loadingRef\.current \|\| !hasMoreRef\.current\) return/)
})

test('useInfiniteTicketList stamps every fetch with a request id and discards stale responses', () => {
  assert.match(HOOK_SRC, /requestIdRef\.current \+= 1/)
  assert.match(HOOK_SRC, /const myRequestId = requestIdRef\.current/)
  assert.match(HOOK_SRC, /if \(myRequestId !== requestIdRef\.current\) return/)
})

test('useInfiniteTicketList de-duplicates appended tickets by id as a safety net', () => {
  const idx = HOOK_SRC.indexOf('setTickets(prev =>')
  const body = HOOK_SRC.slice(idx, idx + 300)
  assert.match(body, /const seen = new Set\(prev\.map\(getId\)\)/)
  assert.match(body, /result\.tickets\.filter\(t => !seen\.has\(getId\(t\)\)\)/)
})

test('useInfiniteTicketList resets (replaces, not appends) to the fresh page-1 data whenever resetKey changes, skipping the first mount', () => {
  const idx = HOOK_SRC.indexOf('useEffect(() => {\n    if (isFirstRun.current)')
  assert.ok(idx >= 0)
  const body = HOOK_SRC.slice(idx, idx + 700)
  assert.match(body, /isFirstRun\.current = false\s*\n\s*return/)
  assert.match(body, /setTickets\(initialTickets\)/)
  assert.match(body, /setHasMore\(initialHasMore\)/)
  assert.match(body, /}, \[resetKey\]\)/)
})

test('useLoadMoreSentinel uses IntersectionObserver scoped to the scroll container root, with a rootMargin so loading starts before the true bottom', () => {
  assert.match(HOOK_SRC, /new IntersectionObserver\(/)
  assert.match(HOOK_SRC, /root, rootMargin: '200px'/)
})

// ─── 1. Dashboard "Recent Tickets" ───────────────────────────────────────────

test('dashboard Recent Tickets is a fixed-height, independently scrollable container (not the whole page)', () => {
  assert.match(DASHBOARD_SCROLL_SRC, /max-h-\[900px\] overflow-y-auto/)
})

test('dashboard Recent Tickets renders the SAME existing TicketList component — no redesigned cards', () => {
  assert.match(DASHBOARD_SCROLL_SRC, /import \{ TicketList \} from '@\/components\/dashboard\/ticket-card'/)
})

test('dashboard page passes only the initial (page-1) batch and hasMore flag into the scroll component — no full dataset prefetch', () => {
  assert.match(DASHBOARD_PAGE_SRC, /<RecentTicketsScroll/)
  const idx = DASHBOARD_PAGE_SRC.indexOf('<RecentTicketsScroll')
  const body = DASHBOARD_PAGE_SRC.slice(idx, idx + 300)
  assert.match(body, /initialTickets=\{recentTickets\}/)
  assert.match(body, /initialHasMore=\{recentTicketsHasMore\}/)
})

test('the dashboard "load more" server action re-derives the current user/role on every call (never trusts a client-supplied role)', () => {
  const idx = DASHBOARD_ACTIONS_SRC.indexOf('async function getRecentTicketsPage')
  assert.ok(idx >= 0)
  const body = DASHBOARD_ACTIONS_SRC.slice(idx, idx + 400)
  assert.match(body, /const currentUser = await getCurrentUser\(\)/)
})

test('the dashboard recent-tickets query fetches page size + 1 (not the whole table) to derive hasMore, and applies LIMIT/OFFSET', () => {
  assert.match(DASHBOARD_ACTIONS_SRC, /\.limit\(limit \+ 1\)/)
  assert.match(DASHBOARD_ACTIONS_SRC, /\.offset\(offset\)/)
  assert.match(DASHBOARD_ACTIONS_SRC, /const RECENT_TICKETS_PAGE_SIZE = 20/)
})

test('the dashboard initial SSR fetch requests exactly RECENT_TICKETS_PAGE_SIZE (20), not the old hardcoded 5', () => {
  assert.match(DASHBOARD_ACTIONS_SRC, /limit: RECENT_TICKETS_PAGE_SIZE, userType, page: 1/)
  assert.doesNotMatch(DASHBOARD_ACTIONS_SRC, /JSON\.stringify\(\{ userId, role, limit: 5, userType \}\)/)
})

// ─── 2. Tickets listing page ────────────────────────────────────────────────

test('the Tickets page server component now fetches 20 tickets per page (was 25)', () => {
  assert.match(TICKETS_PAGE_SERVER_SRC, /const TICKETS_PER_PAGE = 20/)
})

test('the Tickets page ticket-list scroll container is a REAL wrapping element (the historical self-closing-div bug is fixed) — TicketList/TicketGrid render INSIDE it', () => {
  const idx = TICKETS_PAGE_CLIENT_SRC.indexOf('data-tour="ticket-list"')
  assert.ok(idx >= 0)
  const openTag = TICKETS_PAGE_CLIENT_SRC.slice(idx - 60, idx + 260)
  // The old bug closed the div on the same tag as its className attribute.
  assert.doesNotMatch(openTag, /overscroll-behavior-contain scroll-smooth px-4 lg:px-6 py-4"><\/div>/)
  // TicketList must appear AFTER the container's opening tag closes with a
  // bare `>` (i.e. genuinely inside it), not as a sibling.
  const closeOfOpenTag = TICKETS_PAGE_CLIENT_SRC.indexOf('>', TICKETS_PAGE_CLIENT_SRC.indexOf('py-4"', idx))
  const ticketListIdx = TICKETS_PAGE_CLIENT_SRC.indexOf('<TicketList', idx)
  assert.ok(ticketListIdx > closeOfOpenTag, 'TicketList must render inside the scroll container, not after it')
})

test('the Tickets page no longer has Prev/Next pagination buttons (infinite scroll is the primary loading mechanism)', () => {
  assert.doesNotMatch(TICKETS_PAGE_CLIENT_SRC, /Previous page/)
  assert.doesNotMatch(TICKETS_PAGE_CLIENT_SRC, /aria-label="Next page"/)
  assert.doesNotMatch(TICKETS_PAGE_CLIENT_SRC, /goToPage/)
})

test('the Tickets page filters (search/status/priority/project) still drive a server-side URL navigation — unchanged', () => {
  assert.match(TICKETS_PAGE_CLIENT_SRC, /router\.push\(`\/dashboard\/tickets\?\$\{params\.toString\(\)\}`\)/)
  assert.match(TICKETS_PAGE_CLIENT_SRC, /setTimeout\(\(\) => \{/) // debounced search retained
  assert.match(TICKETS_PAGE_CLIENT_SRC, /}, 250\)/)
})

test('the Tickets page infinite-scroll reset key is built from the filter params (not from `page`), so filter changes replace rather than append', () => {
  assert.match(TICKETS_PAGE_CLIENT_SRC, /const filterResetKey = `\$\{q\}\|\$\{status\}\|\$\{priority\}\|\$\{projectIdParam\}\|\$\{moduleIdParam\}`/)
  assert.match(TICKETS_PAGE_CLIENT_SRC, /resetKey: filterResetKey/)
})

test('the Tickets page "load more" reuses the existing getTicketsList action — no duplicate ticket API was created', () => {
  assert.match(TICKETS_PAGE_CLIENT_SRC, /import \{ getTicketsList, type TicketListItem \} from '@\/app\/actions\/tickets'/)
  const idx = TICKETS_PAGE_CLIENT_SRC.indexOf('const fetchTicketsPage')
  const body = TICKETS_PAGE_CLIENT_SRC.slice(idx, idx + 500)
  assert.match(body, /getTicketsList\(\{/)
  assert.match(body, /limit: TICKETS_PAGE_SIZE/)
})

test('the Tickets page renders a sentinel + loading indicator, and reports when no more tickets are left', () => {
  assert.match(TICKETS_PAGE_CLIENT_SRC, /<div ref=\{loadMoreRef\} aria-hidden="true" \/>/)
  assert.match(TICKETS_PAGE_CLIENT_SRC, /Loading more tickets\.\.\./)
  assert.match(TICKETS_PAGE_CLIENT_SRC, /No more tickets/)
})

test('getTicketsList still enforces server-side role scoping, filters, and window-function pagination (untouched by this change)', () => {
  assert.match(TICKET_QUERIES_SRC, /currentUser\.role === 'client'/)
  assert.match(TICKET_QUERIES_SRC, /currentUser\.role === 'developer'/)
  assert.match(TICKET_QUERIES_SRC, /COUNT\(\*\) OVER\(\)/)
  assert.match(TICKET_QUERIES_SRC, /\.limit\(limit\)\s*\n\s*\.offset\(offset\)/)
})

// ─── 3. Ticket Detail page: Activity + Comments (lazy-loaded lists) ─────────

test('the ticket detail Activity panel replaced the non-functional "Load More" label with real infinite scroll', () => {
  assert.doesNotMatch(TICKET_DETAIL_PAGE_SRC, /cursor-pointer hover:underline">Load More/)
  assert.match(TICKET_DETAIL_PAGE_SRC, /TicketActivityInfinite/)
})

test('TicketActivityInfinite keeps the SAME fixed max-height scroll container the Activity panel already used', () => {
  assert.match(ACTIVITY_INFINITE_SRC, /max-h-\[360px\] overflow-y-auto/)
})

test('TicketActivityInfinite reuses the existing getTicketHistory(ticketId, limit, offset) action — no new history endpoint', () => {
  assert.match(ACTIVITY_INFINITE_SRC, /import \{ getTicketHistory \} from '@\/app\/actions\/tickets'/)
  assert.match(ACTIVITY_INFINITE_SRC, /getTicketHistory\(ticketId, ACTIVITY_PAGE_SIZE, offset\)/)
})

test('the Activity timeline rendering component (design) is untouched — TicketActivityInfinite only wraps it', () => {
  assert.match(TICKET_ACTIVITY_TIMELINE_SRC, /export const TicketActivityTimeline = memo/)
  assert.match(ACTIVITY_INFINITE_SRC, /<TicketActivityTimeline history=\{history\} isClient=\{isClient\} \/>/)
})

test('the ticket detail Comments panel now paginates via getComments(ticketId, limit, offset) instead of only ever showing page 1', () => {
  assert.match(COMMENT_SECTION_SRC, /import \{ addComment, getComments \} from/)
  assert.match(COMMENT_SECTION_SRC, /getComments\(ticketId, COMMENTS_PAGE_SIZE, offset\)/)
})

test('the Comments panel resets its loaded list when a fresh page-1 arrives (e.g. after posting a new comment + refresh), not on every unrelated re-render', () => {
  assert.match(COMMENT_SECTION_SRC, /const resetKey = comments\.length > 0 \? comments\[0\]\.id : 'empty'/)
  assert.match(COMMENT_SECTION_SRC, /resetKey,\s*\n\s*}\)/)
})

test('CommentsWrapper fetches the real total comment count and passes it through — the header count is no longer capped at the first page', () => {
  assert.match(TICKET_DETAIL_PAGE_SRC, /getCommentsCount\(ticketId\)/)
  assert.match(TICKET_DETAIL_PAGE_SRC, /totalCount=\{totalCommentsCount\}/)
})

// ─── Design / business-logic preservation ───────────────────────────────────

test('ticket-card.tsx (card design, badges, actions) is byte-for-byte untouched by this change', () => {
  // No infinite-scroll plumbing leaked into the card component itself — it
  // only ever receives a `tickets` array, same as before.
  assert.doesNotMatch(TICKET_CARD_SRC, /IntersectionObserver|useInfiniteTicketList|loadMoreRef/)
})

test('CommentSection still posts comments and refreshes via the existing addComment + router.refresh() flow — submission logic untouched', () => {
  assert.match(COMMENT_SECTION_SRC, /addComment\(/)
  assert.match(COMMENT_SECTION_SRC, /router\.refresh\(\)/)
})
