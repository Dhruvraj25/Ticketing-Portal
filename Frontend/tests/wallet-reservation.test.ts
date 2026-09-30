// Support Wallet hour reservations: approve → reserve, close → consume.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hoursOf, planClose, reservationShortfall } from '../lib/wallet-reservation.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const ESTIMATES = read('app/actions/estimates.ts')
const UPDATE = read('app/actions/tickets/update.ts')
const CREATE = read('app/actions/tickets/create.ts')
const RESERVATION = read('lib/wallet-reservation.ts')
const TICKET_WALLET = read('lib/ticket-wallet.ts')

// In-memory model of the SQL in lib/wallet-reservation.ts (same guards).
function wallet(total: number) {
  const w = { total, reserved: 0, consumed: 0, remaining: total }
  const ok = () => w.remaining === w.total - w.consumed - w.reserved && w.remaining >= 0 && w.reserved >= 0
  return {
    w, ok,
    reserve(h: number) { if (w.remaining < h) return false; w.reserved += h; w.remaining -= h; return true },
    release(h: number) { const r = Math.min(w.reserved, h); w.reserved -= r; w.remaining += r },
    close(deduction: number, reserved: number) {
      const release = Math.min(w.reserved, planClose(deduction, reserved).releaseReserved)
      if (w.remaining + release < deduction) return false
      w.consumed += deduction; w.reserved -= release; w.remaining += release - deduction; return true
    },
  }
}

test('example: 10h wallet, 6h estimate approved → 6 reserved, 4 available; close → 6 used, 4 available', () => {
  const x = wallet(10)
  assert.ok(x.reserve(reservationShortfall(6, 0)))
  assert.deepEqual(x.w, { total: 10, reserved: 6, consumed: 0, remaining: 4 })
  assert.ok(x.ok())
  // A new 5h estimate cannot be approved while 6h are reserved (only 4 available).
  assert.equal(x.reserve(5), false)
  assert.deepEqual(x.w, { total: 10, reserved: 6, consumed: 0, remaining: 4 }, 'failed reservation writes nothing')
  // Close: reserved hours become consumed; available unchanged.
  assert.ok(x.close(6, 6))
  assert.deepEqual(x.w, { total: 10, reserved: 0, consumed: 6, remaining: 4 })
  assert.ok(x.ok())
})

test('multiple tickets hold separate reservations; each close settles only its own', () => {
  const x = wallet(10)
  assert.ok(x.reserve(3)); assert.ok(x.reserve(4))
  assert.deepEqual(x.w, { total: 10, reserved: 7, consumed: 0, remaining: 3 })
  assert.equal(x.reserve(4), false)
  assert.ok(x.close(3, 3))
  assert.deepEqual(x.w, { total: 10, reserved: 4, consumed: 3, remaining: 3 })
  assert.ok(x.close(4, 4))
  assert.deepEqual(x.w, { total: 10, reserved: 0, consumed: 7, remaining: 3 })
  assert.ok(x.ok())
})

test('additional hours reserve only the new part; the same hours are never reserved twice', () => {
  assert.equal(reservationShortfall(6 + 2, 6), 2, 'approved +2h on a reserved 6h estimate')
  assert.equal(reservationShortfall(6, 6), 0, 're-approval of an already reserved amount reserves nothing')
  assert.equal(reservationShortfall(4, 6), 0, 'never negative')
  const x = wallet(10)
  x.reserve(6); x.reserve(reservationShortfall(8, 6))
  assert.deepEqual(x.w, { total: 10, reserved: 8, consumed: 0, remaining: 2 })
  assert.ok(x.close(8, 8))
  assert.deepEqual(x.w, { total: 10, reserved: 0, consumed: 8, remaining: 2 })
})

test('legacy ticket (approved before reservations, holds 0) is charged in full at close, as before', () => {
  const p = planClose(6, 0)
  assert.deepEqual(p, { consume: 6, releaseReserved: 0, availableChange: -6, extraRequired: 6 })
  const x = wallet(10)
  assert.ok(x.close(6, 0))
  assert.deepEqual(x.w, { total: 10, reserved: 0, consumed: 6, remaining: 4 })
  const y = wallet(5)
  assert.equal(y.close(6, 0), false, 'never negative — close refused, nothing written')
  assert.deepEqual(y.w, { total: 5, reserved: 0, consumed: 0, remaining: 5 })
})

test('estimate revised after approval → reservation released back to available', () => {
  const x = wallet(10)
  x.reserve(6); x.release(6)
  assert.deepEqual(x.w, { total: 10, reserved: 0, consumed: 0, remaining: 10 })
  x.release(99)
  assert.deepEqual(x.w, { total: 10, reserved: 0, consumed: 0, remaining: 10 }, 'cannot release more than is reserved')
})

test('hoursOf sanitizes input', () => {
  assert.equal(hoursOf(null), 0); assert.equal(hoursOf(-3), 0); assert.equal(hoursOf('7'), 7); assert.equal(hoursOf(NaN), 0)
})

test('SQL primitives are single guarded UPDATEs (race-safe, never negative)', () => {
  assert.match(RESERVATION, /\.where\(and\(eq\(supportWallet\.id, walletId\), gte\(supportWallet\.remainingHours, h\)\)\)/)
  assert.match(RESERVATION, /sql`\$\{supportWallet\.remainingHours\} \+ \$\{release\} >= \$\{plan\.consume\}`/)
  assert.match(RESERVATION, /LEAST\(\$\{supportWallet\.reservedHours\}/)
})

test('approval reserves inside the same transaction as the status claim (no double reservation)', () => {
  const approve = ESTIMATES.slice(ESTIMATES.indexOf('export const approveEstimate'), ESTIMATES.indexOf('export const rejectEstimate'))
  const claim = approve.indexOf(".where(and(eq(ticket.id, ticketId), eq(ticket.status, 'estimate_pending')))")
  const reserve = approve.indexOf('await reserveHoursForTicket(tx, t, reservationShortfall(t.estimatedHours, t.reservedHours)')
  assert.ok(claim > 0 && reserve > claim)
  assert.match(approve, /if \(!claimed\) throw new Error\('Estimate is not pending your approval'\)/)
  assert.match(approve, /refreshWalletViews\(reservedWalletId\)/)

  const additional = ESTIMATES.slice(ESTIMATES.indexOf('export const approveAdditionalHours'), ESTIMATES.indexOf('export const declineAdditionalHours'))
  assert.match(additional, /eq\(ticket\.additionalHoursApproved, false\)/)
  assert.match(additional, /reserveHoursForTicket\(tx, t, reservationShortfall\(newTotalHours, t\.reservedHours\)/)

  const auto = ESTIMATES.slice(ESTIMATES.indexOf('export const processEstimateAutoApprovals'))
  assert.equal((auto.match(/reserveHoursForTicket\(tx, t,/g) || []).length, 2, 'estimate + additional auto-approvals reserve too')
  assert.match(auto, /if \(err instanceof WalletReservationError\) \{\s*\n\s*console\.warn/)

  const revise = ESTIMATES.slice(ESTIMATES.indexOf('export const updateEstimate'), ESTIMATES.indexOf('export const requestAdditionalHours'))
  assert.match(revise, /releaseTicketReservation\(tx, t,/)
})

test('close settles the reservation atomically with the status claim', () => {
  const close = UPDATE.slice(UPDATE.indexOf('async function closeTicketAsClient'))
  const claim = close.indexOf(".where(and(eq(ticket.id, ticketId), eq(ticket.status, 'client_review')))")
  const settle = close.indexOf('await consumeReservedHoursAtomic(tx, wallet.id, totalDeduction, reservedOnTicket)')
  assert.ok(claim > 0 && settle > claim)
  assert.match(close, /const ticketUpdate: Record<string, unknown> = \{ reservedHours: 0 \}/)
  assert.match(close, /if \(wallet\) refreshWalletViews\(wallet\.id\)/)
  assert.doesNotMatch(UPDATE, /deductWalletHoursAtomic/)
})

test('every wallet lookup for a ticket uses the shared resolver (raiser, else project owner)', () => {
  assert.doesNotMatch(ESTIMATES, /eq\(supportWallet\.clientId, t\.clientId\)/)
  assert.doesNotMatch(UPDATE, /eq\(supportWallet\.clientId, t\.clientId\)/)
  assert.doesNotMatch(CREATE, /eq\(supportWallet\.clientId, actualClientId\)/)
  assert.match(TICKET_WALLET, /select\(\{ ownerId: project\.clientId \}\)/)
  // Reservations are logged as Adjustment, never as consumption.
  assert.match(TICKET_WALLET, /transactionType: 'Adjustment', hours: h,/)
  assert.doesNotMatch(TICKET_WALLET, /transactionType: 'Deduct Hours'/)
})
