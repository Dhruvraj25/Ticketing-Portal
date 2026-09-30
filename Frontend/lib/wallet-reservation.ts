// ────────────────────────────────────────────────────────────────────────────
// wallet-reservation — Support Wallet hour RESERVATIONS for approved estimates
// ────────────────────────────────────────────────────────────────────────────
// Wallet invariant (see recalculateWallet in app/actions/wallet/renewals.ts):
//   remaining (available) = totalPurchasedHours - consumedHours - reservedHours
//
// Lifecycle of a ticket's hours:
//   estimate approved          → reserve:  reserved += h, remaining -= h
//   additional hours approved  → reserve the additional hours the same way
//   estimate re-submitted      → release:  reserved -= h, remaining += h
//   ticket closed              → consume:  consumed += D, reserved -= R,
//                                           remaining -= (D - R)
// where D = the ticket's final deduction (its approved estimate incl. approved
// additional hours — unchanged existing rule) and R = the hours this ticket
// holds in reserve (ticket.reservedHours). Normally D === R, so closing moves
// hours from Reserved to Consumed and Available does not change again.
// Tickets approved before reservations existed hold R = 0 and are charged in
// full at close, exactly as before.
//
// Every write is ONE conditional UPDATE using SQL-expression arithmetic, so
// concurrent requests are serialized by Postgres on the wallet row and a
// balance can never go negative: if the guard fails, nothing is written and
// null is returned (the caller aborts its transaction).
//
// Plain module (no '@/' imports, db handle passed in) so the pure planning
// logic is unit-testable under `node --test`, like lib/wallet-validation.ts.
// ────────────────────────────────────────────────────────────────────────────

import { and, eq, gte, sql } from 'drizzle-orm'
import { supportWallet } from './db/schema.ts'

type DbLike = { update: typeof import('./db').db.update }

export interface WalletBalances {
  id: number
  reservedHours: number
  consumedHours: number
  remainingHours: number
}

const returningBalances = {
  id: supportWallet.id,
  reservedHours: supportWallet.reservedHours,
  consumedHours: supportWallet.consumedHours,
  remainingHours: supportWallet.remainingHours,
}

/** Whole, non-negative hours (NaN / negative / null → 0). */
export function hoursOf(value: unknown): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Hours to reserve so a ticket holds `target` in total (never negative). */
export function reservationShortfall(target: unknown, alreadyReserved: unknown): number {
  return Math.max(0, hoursOf(target) - hoursOf(alreadyReserved))
}

export interface ClosePlan {
  /** Hours moved to consumed (the ticket's final deduction). */
  consume: number
  /** Hours released from the wallet's reserved total. */
  releaseReserved: number
  /** Change to the available (remaining) balance: negative = more is taken. */
  availableChange: number
  /** Extra hours that must still be available (D > R, e.g. legacy tickets). */
  extraRequired: number
}

export function planClose(deduction: unknown, reserved: unknown): ClosePlan {
  const consume = hoursOf(deduction)
  const releaseReserved = hoursOf(reserved)
  return {
    consume,
    releaseReserved,
    availableChange: releaseReserved - consume,
    extraRequired: Math.max(0, consume - releaseReserved),
  }
}

/** Move `hours` from available to reserved. Null when not enough is available. */
export async function reserveWalletHoursAtomic(dbOrTx: DbLike, walletId: number, hours: number): Promise<WalletBalances | null> {
  const h = hoursOf(hours)
  if (h === 0) return null
  const rows = await dbOrTx
    .update(supportWallet)
    .set({
      reservedHours: sql`${supportWallet.reservedHours} + ${h}`,
      remainingHours: sql`${supportWallet.remainingHours} - ${h}`,
      updatedAt: new Date(),
    })
    .where(and(eq(supportWallet.id, walletId), gte(supportWallet.remainingHours, h)))
    .returning(returningBalances)
  return rows[0] ?? null
}

/**
 * Return up to `hours` from reserved to available. Never releases more than
 * the wallet actually holds in reserve, so reserved can't go negative.
 */
export async function releaseWalletReservationAtomic(dbOrTx: DbLike, walletId: number, hours: number): Promise<WalletBalances | null> {
  const h = hoursOf(hours)
  if (h === 0) return null
  const released = sql`LEAST(${supportWallet.reservedHours}, ${h})`
  const rows = await dbOrTx
    .update(supportWallet)
    .set({
      reservedHours: sql`${supportWallet.reservedHours} - ${released}`,
      remainingHours: sql`${supportWallet.remainingHours} + ${released}`,
      updatedAt: new Date(),
    })
    .where(eq(supportWallet.id, walletId))
    .returning(returningBalances)
  return rows[0] ?? null
}

/**
 * Close-time settlement (see planClose). Null when the wallet can't cover the
 * part of the deduction that was not reserved — nothing is written then.
 */
export async function consumeReservedHoursAtomic(
  dbOrTx: DbLike,
  walletId: number,
  deduction: number,
  reserved: number,
): Promise<WalletBalances | null> {
  const plan = planClose(deduction, reserved)
  if (plan.consume === 0 && plan.releaseReserved === 0) return null
  const release = sql`LEAST(${supportWallet.reservedHours}, ${plan.releaseReserved})`
  const rows = await dbOrTx
    .update(supportWallet)
    .set({
      consumedHours: sql`${supportWallet.consumedHours} + ${plan.consume}`,
      reservedHours: sql`${supportWallet.reservedHours} - ${release}`,
      remainingHours: sql`${supportWallet.remainingHours} + ${release} - ${plan.consume}`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(supportWallet.id, walletId),
      // available + what is released must cover the whole deduction
      sql`${supportWallet.remainingHours} + ${release} >= ${plan.consume}`,
    ))
    .returning(returningBalances)
  return rows[0] ?? null
}
