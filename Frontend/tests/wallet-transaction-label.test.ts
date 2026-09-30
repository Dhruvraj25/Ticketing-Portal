// Transaction history shows ticket reservations as "Reserved" (display only).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isReservationTransaction, transactionDisplayType } from '../lib/wallet-transaction-label.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const CLIENT = read('app/dashboard/support-wallet/support-wallet-client.tsx')
const MANAGER = read('app/dashboard/wallets/[id]/wallet-detail-client.tsx')
const TICKET_WALLET = read('lib/ticket-wallet.ts')

// Real rows from wallet_transaction (#48 reservation, #33 manual adjustment).
const reservation = { transactionType: 'Adjustment', hours: 20, previousBalance: 76, newBalance: 56, remarks: '[Reserved] 20h reserved for ticket #TKT-MUNS7HIC-I9CP - Auth' }
const manualAdjustment = { transactionType: 'Adjustment', hours: 0, previousBalance: 450, newBalance: 450, remarks: '' }

test('a ticket reservation displays as Reserved; the stored type is unchanged', () => {
  assert.equal(transactionDisplayType(reservation), 'Reserved')
  assert.equal(reservation.transactionType, 'Adjustment')
})

test('genuine adjustments, releases, recharges and deductions keep their labels', () => {
  assert.equal(transactionDisplayType(manualAdjustment), 'Adjustment')
  assert.equal(transactionDisplayType({ transactionType: 'Adjustment', remarks: null }), 'Adjustment')
  assert.equal(transactionDisplayType({ transactionType: 'Adjustment', remarks: '[Released] 4h reservation released' }), 'Adjustment')
  assert.equal(transactionDisplayType({ transactionType: 'Add Hours', remarks: '[Reserved] odd' }), 'Add Hours')
  assert.equal(transactionDisplayType({ transactionType: 'Deduct Hours', remarks: '6h deducted on ticket close' }), 'Deduct Hours')
  assert.equal(isReservationTransaction({ transactionType: 'Adjustment', remarks: 'note mentioning [Reserved] later' }), false)
})

test('the prefix the helper relies on is exactly what the reservation code writes', () => {
  assert.match(TICKET_WALLET, /transactionType: 'Adjustment', hours: h,/)
  assert.match(TICKET_WALLET, /remarks: `\[Reserved\] \$\{h\}h reserved for ticket #/)
})

test('both history tables render the display type; amount sign and Balance After are untouched', () => {
  for (const src of [CLIENT, MANAGER]) {
    assert.match(src, /<TransactionTypeBadge type=\{transactionDisplayType\(t\)\} \/>/)
    assert.match(src, /\[RESERVED_DISPLAY_TYPE\]: \{ label: 'Reserved', color: 'bg-amber-50/)
    assert.match(src, /'Adjustment': \{ label: 'Adjustment'/)
  }
  assert.match(CLIENT, /'Add Hours': \{ label: 'Recharge'/)
  assert.match(CLIENT, /'Deduct Hours': \{ label: 'Deducted'/)
  // Client amount: a reservation lowers the balance → "-20" (76 → 56).
  assert.match(CLIENT, /\(t\.transactionType === 'Adjustment' && t\.newBalance < t\.previousBalance\)/)
  assert.ok(reservation.newBalance < reservation.previousBalance)
  assert.match(CLIENT, /\{t\.newBalance\}<\/td>/)
})
