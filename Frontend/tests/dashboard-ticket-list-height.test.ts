// Dashboard (all roles share app/dashboard/page.tsx): the Recent Tickets list
// fills the height beside Analytics on desktop and scrolls internally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8')
const PAGE = read('app/dashboard/page.tsx')
const SCROLL = read('components/dashboard/recent-tickets-scroll.tsx')

test('desktop: the ticket section fills the grid row set by Analytics (sized at the cell, not the cards)', () => {
  assert.match(PAGE, /<div className="lg:col-span-2 relative lg:min-h-\[640px\]">\s*\n\s*<div data-tour="dashboard-recent-tickets" className="space-y-3 lg:space-y-0 lg:absolute lg:inset-0 lg:flex lg:flex-col lg:gap-3">/)
  assert.match(PAGE, /<div className="grid grid-cols-1 lg:grid-cols-3 gap-5">/, 'same two-column grid for every role')
  assert.match(PAGE, /<SidebarSection user=\{user\} \/>/, 'Analytics column unchanged')
})

test('only the list scrolls; header + "View all" stay visible', () => {
  assert.match(PAGE, /<div className="flex items-center justify-between shrink-0">/)
  assert.match(PAGE, /View all <ArrowRight/)
  assert.match(PAGE, /scrollClassName="lg:flex-1 lg:min-h-0 lg:max-h-none"/)
  assert.match(SCROLL, /className=\{cn\('max-h-\[900px\] overflow-y-auto overscroll-behavior-contain rounded-2xl', scrollClassName\)\}/)
})

test('single column keeps the previous behaviour; cards and data untouched', () => {
  // < lg: normal flow, list capped at 900px (the lg: classes do not apply).
  assert.match(SCROLL, /'max-h-\[900px\] overflow-y-auto/)
  // Same data / infinite loading as before.
  assert.match(SCROLL, /fetchPage: \(page\) => getRecentTicketsPage\(page\)/)
  assert.match(SCROLL, /<TicketList\s*\n\s*tickets=\{tickets\}/)
})
