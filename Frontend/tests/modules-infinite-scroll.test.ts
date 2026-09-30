// Modules / Service Areas: pagination replaced by infinite scroll (20 per
// batch) using the Ticket List's shared hook; module name opens Module Detail.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INITIAL_FILTER_KEY, MODULES_BATCH_SIZE, moduleBatchFilters } from '../lib/module-list-batches.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const PAGE = read('app/dashboard/modules/modules-page-client.tsx')
const SERVER_PAGE = read('app/dashboard/modules/page.tsx')
const QUERIES = read('app/actions/modules/queries.ts')
const HOOK = read('lib/use-infinite-ticket-list.ts')
const TICKETS = read('app/dashboard/tickets/tickets-page-client.tsx')

// Server paging math used by getModules (LIMIT/OFFSET + COUNT(*) OVER()) and
// the client's hasMore = page < totalPages.
function simulateScroll(total: number) {
  const limit = MODULES_BATCH_SIZE
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const batches: number[] = []
  let page = 0, hasMore = true
  while (hasMore) {
    page += 1
    const offset = (page - 1) * limit
    batches.push(Math.max(0, Math.min(limit, total - offset)))
    hasMore = page < totalPages
    if (page > 100) throw new Error('runaway')
  }
  return { requests: page, batches, loaded: batches.reduce((a, b) => a + b, 0) }
}

test('batch requests: 20 per batch, server-side filters, KPI counts only with the first batch', () => {
  assert.equal(MODULES_BATCH_SIZE, 20)
  assert.deepEqual(moduleBatchFilters({ sortBy: 'created', page: 1 }), {
    page: 1, limit: 20, sortBy: 'created', sortOrder: 'desc', includeStatusCounts: true,
  })
  assert.deepEqual(moduleBatchFilters({ search: ' Authentication ', projectId: '64', status: 'active', sortBy: 'name', page: 3 }), {
    page: 3, limit: 20, search: 'Authentication', projectId: 64, status: 'active', sortBy: 'name', sortOrder: 'asc', includeStatusCounts: false,
  })
  assert.equal(moduleBatchFilters({ sortBy: 'tickets', page: 2, projectId: 'all', status: 'all' }).sortOrder, 'desc')
  assert.equal(INITIAL_FILTER_KEY, '|all|all|created', 'matches the default filterKey of the page')
})

test('cases: empty, fewer than 20, exactly 20, more than 20 — and no request after the last batch', () => {
  assert.deepEqual(simulateScroll(0), { requests: 1, batches: [0], loaded: 0 })
  assert.deepEqual(simulateScroll(7), { requests: 1, batches: [7], loaded: 7 })
  assert.deepEqual(simulateScroll(20), { requests: 1, batches: [20], loaded: 20 }, 'exactly 20 → one batch, then stop')
  assert.deepEqual(simulateScroll(43), { requests: 3, batches: [20, 20, 3], loaded: 43 })
  assert.deepEqual(simulateScroll(80), { requests: 4, batches: [20, 20, 20, 20], loaded: 80 })
})

test('server: first paint fetches ONE batch (not every module); getModules pages in the database', () => {
  assert.match(SERVER_PAGE, /getModules\(moduleBatchFilters\(\{ sortBy: 'created', page: 1 \}\)\)/)
  assert.doesNotMatch(SERVER_PAGE, /getModulesByProjectIds|getModulesTicketStats/)
  assert.match(QUERIES, /\.orderBy\(orderBy, desc\(moduleTable\.id\)\)\s*\n\s*\.limit\(limit\)\s*\n\s*\.offset\(offset\)/, 'stable order → batches never overlap or skip')
  assert.match(QUERIES, /LOWER\(COALESCE\(\$\{project\.projectName\}, ''\)\) LIKE \$\{q\}/, 'search also matches the project')
  assert.match(QUERIES, /case 'tickets': \{/, 'Most Tickets sort is server-side')
  assert.match(QUERIES, /if \(filters\?\.includeStatusCounts\) \{/)
  // Role scope unchanged: managers only their projects.
  assert.match(QUERIES, /\} else if \(role === 'project_manager'\) \{[\s\S]{0,200}eq\(project\.managerId, userId\)/)
})

test('client: shared infinite-scroll hook + sentinel; search/filter/sort reset the list', () => {
  assert.match(PAGE, /useInfiniteTicketList<ModuleWithRelations>\(\{/)
  assert.match(PAGE, /useLoadMoreSentinel\(scrollContainerRef, loadMoreRef, loadMore, hasMore\)/)
  assert.match(PAGE, /const filterKey = `\$\{debouncedSearch\}\|\$\{selectedProject\}\|\$\{selectedStatus\}\|\$\{sortBy\}`/)
  assert.match(PAGE, /resetKey: filterKey,/)
  assert.match(PAGE, /initialTickets: isInitialFilters \? \(initialPage\.modules as unknown as ModuleWithRelations\[\]\) : \[\],/)
  assert.match(PAGE, /startPage: isInitialFilters \? 1 : 0,/)
  // Stale meta never applied to a newer result set.
  assert.match(PAGE, /if \(key === filterKeyRef\.current\) \{/)
  // Pagination UI gone; loading / end states shown under the list.
  assert.doesNotMatch(PAGE, /Page \{currentPage\} of \{totalPages\}|goToNextPage|ITEMS_PER_PAGE/)
  assert.match(PAGE, /Loading more modules\.\.\./)
  assert.match(PAGE, /'All modules \/ service areas loaded'/)
  assert.match(PAGE, /No modules \/ service areas found/)
  assert.match(PAGE, /const nothingFound = visibleModules\.length === 0 && !hasMore && !loadingMore/)
  assert.match(PAGE, /Showing <span className="font-medium text-foreground">\{totalCount\}<\/span>/, 'total from the server, not the loaded rows')
})

test('duplicate / stale requests prevented by the shared hook (unchanged for the Ticket List)', () => {
  assert.match(HOOK, /if \(loadingRef\.current \|\| !hasMoreRef\.current\) return/)
  assert.match(HOOK, /if \(myRequestId !== requestIdRef\.current\) return/)
  assert.match(HOOK, /const pageRef = useRef\(startPage\)/)
  assert.match(HOOK, /pageRef\.current = startPage/)
  assert.match(HOOK, /startPage = 1,/, 'default keeps the Ticket List behaviour')
  assert.doesNotMatch(TICKETS, /startPage/)
})

test('module name opens Module Detail — same destination as "View Module"', () => {
  assert.match(PAGE, /export function moduleDetailHref\(moduleId: number\): string \{\s*\n\s*return `\/dashboard\/modules\/\$\{moduleId\}`/)
  assert.match(PAGE, /<Link href=\{moduleDetailHref\(mod\.id\)\} className="block group\/cell">/)
  assert.match(PAGE, /<Link href=\{moduleDetailHref\(mod\.id\)\} className="cursor-pointer flex items-center">\s*\n[\s\S]{0,120}View Module/)
  assert.doesNotMatch(PAGE, /className="block group\/cell"[^>]*moduleId=/)
})
