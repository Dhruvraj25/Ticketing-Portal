import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Tickets page (/dashboard/tickets) desktop layout fix.
//
// Root cause: when the ticket-list scroll container's self-closing-div bug
// was fixed (infinite-scroll phase), the "Right Panel" (Quick Actions /
// Analytics / Insights) div stayed nested ONE LEVEL TOO DEEP — inside the
// "Main Ticket Area" (`flex-1 min-w-0`) div instead of being its sibling at
// the flex-container level. A block-level child inside a non-flex `flex-1`
// wrapper stacks vertically, so the sidebar rendered BELOW the ticket list
// at 100% width instead of beside it.
//
// Fix: replaced the broken flex/nesting with a single responsive CSS grid
// (`grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,0.9fr)]`) whose two
// children — the ticket-list column and the <aside> sidebar — are true
// siblings, each carrying min-w-0.
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'tickets', 'tickets-page-client.tsx'), 'utf8')

test('SECTION 3 uses a responsive grid (not the old broken flex nesting) for the ticket list + sidebar', () => {
  assert.match(SRC, /className="grid grid-cols-1 lg:grid-cols-\[minmax\(0,2fr\)_minmax\(280px,0\.9fr\)\] gap-6"/)
})

test('the ticket-list column and the right sidebar are direct siblings inside the grid (not nested inside one another)', () => {
  const gridIdx = SRC.indexOf('lg:grid-cols-[minmax(0,2fr)')
  assert.ok(gridIdx >= 0)
  const gridOpenTagEnd = SRC.indexOf('>', gridIdx)
  const ticketColIdx = SRC.indexOf('<div className="min-w-0">', gridOpenTagEnd)
  const asideIdx = SRC.indexOf('<aside', gridOpenTagEnd)
  assert.ok(ticketColIdx > gridOpenTagEnd, 'ticket column must be inside the grid')
  assert.ok(asideIdx > ticketColIdx, 'the sidebar must come after the ticket column opens')

  // The <aside> must NOT be nested inside the ticket-list column's own scroll
  // div — i.e. it must appear at or after that column's closing </div>, not
  // between the scroll container's opening and closing tags.
  const scrollDivOpenIdx = SRC.indexOf('data-tour="ticket-list"', ticketColIdx)
  const paginationDivIdx = SRC.indexOf('data-tour="ticket-pagination"', scrollDivOpenIdx)
  assert.ok(asideIdx > paginationDivIdx, 'sidebar must render after the ticket-list scroll container is fully closed, not inside it')
})

test('both grid columns carry min-w-0, so long ticket content can never force the grid wider than the viewport', () => {
  assert.match(SRC, /<div className="min-w-0">/) // ticket-list column
  assert.match(SRC, /<aside data-tour="tickets-right-panel" className="min-w-0/) // sidebar
})

test('the grid ratio approximates 65-70% / 30-35% (2fr vs 0.9fr, and a floor of 280px for the sidebar)', () => {
  const ticketFr = 2
  const sidebarFr = 0.9
  const ticketShare = ticketFr / (ticketFr + sidebarFr)
  assert.ok(ticketShare >= 0.65 && ticketShare <= 0.70, `ticket column share ${ticketShare} must be within 65-70%`)
  assert.match(SRC, /minmax\(280px,0\.9fr\)/)
})

test('no more fixed pixel width (w-[320px]) or shrink-0 on the sidebar — the grid track now owns its width', () => {
  assert.doesNotMatch(SRC, /tickets-right-panel" className="hidden lg:block w-\[320px\]/)
})

test('the sidebar is no longer unconditionally hidden below lg — it stacks under the ticket list on mobile/tablet instead of disappearing (grid-cols-1 default)', () => {
  const asideIdx = SRC.indexOf('<aside data-tour="tickets-right-panel"')
  const asideTag = SRC.slice(asideIdx, SRC.indexOf('>', asideIdx))
  assert.doesNotMatch(asideTag, /\bhidden\b/)
})

test('TicketRightPanel (Quick Actions / Analytics / Insights) is rendered unchanged — same component, same props', () => {
  assert.match(SRC, /<TicketRightPanel userRole=\{user\.role\}\s*\/>/)
})

test('the ticket-list scroll container keeps its exact internal-scroll classes and infinite-scroll wiring (max-h, overflow-y-auto, sentinel ref)', () => {
  assert.match(SRC, /max-h-\[900px\] overflow-y-auto overscroll-behavior-contain scroll-smooth/)
  assert.match(SRC, /ref=\{scrollContainerRef\}/)
  assert.match(SRC, /<div ref=\{loadMoreRef\} aria-hidden="true" \/>/)
})

test('the ticket-list uses a FIXED height (900px), matching the Dashboard\'s Recent Tickets panel — not a viewport-relative calc() that can collapse on shorter viewports', () => {
  assert.doesNotMatch(SRC, /max-h-\[calc\(100dvh/)
  const RECENT_TICKETS_SCROLL_SRC = readFileSync(join(ROOT, 'components', 'dashboard', 'recent-tickets-scroll.tsx'), 'utf8')
  assert.match(RECENT_TICKETS_SCROLL_SRC, /max-h-\[900px\]/)
})
