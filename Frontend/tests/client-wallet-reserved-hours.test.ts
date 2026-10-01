// Client Support Wallet shows Reserved Hours exactly like the Manager wallet
// detail page — same wallet row, same labels, no new calculation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const CLIENT = read('app/dashboard/support-wallet/support-wallet-client.tsx')
const CLIENT_PAGE = read('app/dashboard/support-wallet/page.tsx')
const MANAGER = read('app/dashboard/wallets/[id]/wallet-detail-client.tsx')
const QUERIES = read('app/actions/wallet/queries.ts')

const summary = (src: string, marker: string) => src.slice(src.indexOf(marker), src.indexOf('</div>\n\n', src.indexOf(marker)) + 200)
const labels = (src: string) => [...src.matchAll(/uppercase tracking-wider">([A-Za-z ]+ Hours)<\/p>/g)].map((m) => m[1])

test('client summary shows the same four cards, in the same order, as the manager detail page', () => {
  const client = labels(summary(CLIENT, 'data-tour="wallet-summary"'))
  const manager = labels(summary(MANAGER, 'data-tour="wallet-detail-summary"'))
  assert.deepEqual(client.slice(0, 4), ['Purchased Hours', 'Reserved Hours', 'Consumed Hours', 'Remaining Hours'])
  assert.deepEqual(client.slice(0, 4), manager.slice(0, 4))
  assert.doesNotMatch(CLIENT, />Used Hours</)
})

test('values are the stored wallet columns — no client-side recalculation', () => {
  for (const src of [CLIENT, MANAGER]) {
    assert.match(src, /text-amber-600 dark:text-amber-400 mt-1">\{wallet\.reservedHours\}<\/p>/)
    assert.match(src, /text-blue-600 dark:text-blue-400 mt-1">\{wallet\.consumedHours\}<\/p>/)
    assert.match(src, />\{wallet\.remainingHours\}<\/p>/)
  }
  assert.doesNotMatch(CLIENT, /wallet\.consumedHours \+ wallet\.reservedHours/, 'Used = consumed + reserved is gone')
})

test('responsive: 1 column on phones, 2 on small screens, 4 on desktop (wraps, no horizontal scroll)', () => {
  assert.match(CLIENT, /data-tour="wallet-summary" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"/)
})

test('same data source, authorization unchanged: a client only ever gets their own COMPANY wallet row', () => {
  assert.match(CLIENT_PAGE, /if \(user\.role !== 'client'\) \{\s*\n\s*redirect\('\/dashboard'\)/)
  assert.match(CLIENT_PAGE, /const wallets = await getWallets\(\)/)
  // List: restricted to the wallets of the companies the caller may see (client → own company).
  assert.match(QUERIES, /const scope = await walletScopeConditions\(currentUser\)\s*\n\s*if \(scope === null\) return \[\]/)
  assert.match(QUERIES, /\.where\(inArray\(supportWallet\.companyId, companyIds\)\)/)
  // Detail: a client of another company is refused.
  assert.match(QUERIES, /if \(currentUser\.role === 'client' && \(w\.companyId == null \|\| w\.companyId !== await companyIdOfUser\(db, currentUser\.id\)\)\) \{\s*\n\s*throw new Error\('Access denied'\)/)
  // Both pages read the full support_wallet row (reservedHours included).
  assert.match(QUERIES, /const wallets = await db\s*\n\s*\.select\(\)\s*\n\s*\.from\(supportWallet\)/)
})
