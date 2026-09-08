import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Support Hours — final KPI / usage-summary section removal regression suite
// ============================================================================
// The client's own Support Wallet page (app/dashboard/support-wallet) already
// had its aggregate KPI section and usage/utilization summary removed — these
// tests lock in the same removal on the admin/manager Support Wallets pages
// (list + detail), while asserting the required balance/transaction/billing
// content is still present.

const ROOT = join(import.meta.dirname, '..')
const WALLETS_LIST_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'wallets', 'wallets-page-client.tsx'), 'utf8')
const WALLET_DETAIL_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'wallets', '[id]', 'wallet-detail-client.tsx'), 'utf8')
const CLIENT_WALLET_SRC = readFileSync(join(ROOT, 'app', 'dashboard', 'support-wallet', 'support-wallet-client.tsx'), 'utf8')
const TOUR_CONFIG_SRC = readFileSync(join(ROOT, 'lib', 'tour', 'config.ts'), 'utf8')

// ─── Admin/Manager Support Wallets LIST page (/dashboard/wallets) ─────────

test('wallets list: the aggregate KPI section is removed', () => {
  assert.ok(!WALLETS_LIST_SRC.includes('WalletKpiCards'), 'WalletKpiCards component must be removed')
  assert.ok(!WALLETS_LIST_SRC.includes('data-tour="wallets-kpis"'), 'the wallets-kpis section must be removed from the page')
  assert.ok(!WALLETS_LIST_SRC.includes('Total Wallet Hours'), 'the KPI card labels must be gone')
  assert.ok(!WALLETS_LIST_SRC.includes('Low Balance Clients'))
  assert.ok(!WALLETS_LIST_SRC.includes('Wallet Recharge Requests'))
})

test('wallets list: required functionality (header, filters, table, export, pagination) is preserved', () => {
  assert.ok(WALLETS_LIST_SRC.includes('WalletPageHeader'))
  assert.ok(WALLETS_LIST_SRC.includes('WalletFilters'))
  assert.ok(WALLETS_LIST_SRC.includes('WalletTable'), 'the wallet balance table must remain')
  assert.ok(WALLETS_LIST_SRC.includes('WalletExportButton'), 'CSV export (billing-adjacent) must remain')
  assert.ok(WALLETS_LIST_SRC.includes('WalletPagination'))
})

// ─── Admin/Manager Support Wallet DETAIL page (/dashboard/wallets/[id]) ────

test('wallet detail: the usage/utilization summary section is removed', () => {
  assert.ok(!WALLET_DETAIL_SRC.includes('UtilizationChart'), 'UtilizationChart component must be removed')
  assert.ok(!WALLET_DETAIL_SRC.includes('data-tour="wallet-detail-utilization"'), 'the utilization section must be removed from the page')
  assert.ok(!WALLET_DETAIL_SRC.includes('Hour Utilization'))
})

test('wallet detail: balance, transactions, consumption and billing data are preserved', () => {
  // Balance summary cards (Purchased/Reserved/Consumed/Remaining) — required.
  assert.ok(WALLET_DETAIL_SRC.includes('data-tour="wallet-detail-summary"'), 'the wallet balance summary cards must remain')
  assert.ok(WALLET_DETAIL_SRC.includes('Purchased Hours'))
  assert.ok(WALLET_DETAIL_SRC.includes('Remaining Hours'))
  // Required transaction/history + consumption (billing-relevant) data.
  assert.ok(WALLET_DETAIL_SRC.includes("TabsTrigger value=\"transactions\""))
  assert.ok(WALLET_DETAIL_SRC.includes("TabsTrigger value=\"consumption\""))
  assert.ok(WALLET_DETAIL_SRC.includes("TabsTrigger value=\"alerts\""))
  assert.ok(WALLET_DETAIL_SRC.includes('Add Support Hours'), 'the Add Hours billing action must remain')
})

// ─── Client Support Wallet page stays the reference (already-clean) state ─

test('client support wallet page has no KPI or usage-summary section (reference state, unchanged)', () => {
  assert.ok(!CLIENT_WALLET_SRC.includes('Utilization'))
  assert.ok(!CLIENT_WALLET_SRC.includes('KpiCards'))
  assert.ok(CLIENT_WALLET_SRC.includes('data-tour="wallet-summary"'), 'balance cards must remain')
  assert.ok(CLIENT_WALLET_SRC.includes('data-tour="wallet-transactions"'), 'transaction history must remain')
})

// ─── Guided tour steps stay in sync (no step points at a removed element) ──

test('tour config no longer references the removed wallets KPI / utilization steps', () => {
  assert.ok(!TOUR_CONFIG_SRC.includes("'[data-tour=\"wallets-kpis\"]'"))
  assert.ok(!TOUR_CONFIG_SRC.includes("'[data-tour=\"wallet-detail-utilization\"]'"))
})

test('tour config still walks through the required wallet sections', () => {
  assert.ok(TOUR_CONFIG_SRC.includes("'[data-tour=\"wallets-header\"]'"))
  assert.ok(TOUR_CONFIG_SRC.includes("'[data-tour=\"wallets-table\"]'"))
  assert.ok(TOUR_CONFIG_SRC.includes("'[data-tour=\"wallet-detail-summary\"]'"))
  assert.ok(TOUR_CONFIG_SRC.includes("'[data-tour=\"wallet-detail-tabs\"]'"))
})
