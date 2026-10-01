// ────────────────────────────────────────────────────────────────────────────
// wallet-validation — shared Support Wallet business rules for ticket
// creation, estimate submission/approval, and the final hour deduction.
//
// SOURCE OF TRUTH: the `supportWallet` table (one row per COMPANY, shared by
// all of its client users — lib/company-wallet.ts). The
// authoritative remaining-hours formula, already used elsewhere in this
// codebase (see recalculateWallet in app/actions/wallet/renewals.ts), is:
//   remaining = totalPurchasedHours - consumedHours - reservedHours
// This module never recomputes that formula independently — every function
// here reads the wallet's existing `remainingHours`/`totalPurchasedHours`
// columns as passed in by the caller, and the atomic deduction primitive
// updates them the same way every other wallet-consuming code path does
// (consumedHours += X, remainingHours -= X).
//
// Kept as a plain (non 'use server') module — importable directly under
// plain `node:test` — so the pure threshold/sufficiency logic can be unit
// tested without a database. DB access (the atomic deduction) is a thin
// wrapper that takes a Drizzle db/transaction handle as a parameter rather
// than importing one, for the same testability reason.
// ────────────────────────────────────────────────────────────────────────────

import { and, eq, gte, sql } from 'drizzle-orm'
import { supportWallet } from './db/schema.ts'
import { createAppError } from './error-utils.ts'
import { checkWalletSufficiency } from './historical-ticket.ts'

export { checkWalletSufficiency }

/** The client ticket-creation threshold: wallet remaining <= 10% of the purchased limit. */
export const WALLET_CREATE_THRESHOLD_PERCENT = 0.10

export interface WalletLimitInfo {
  remainingHours: number
  totalPurchasedHours: number
}

/**
 * True when the wallet's remaining balance is at or below 10% of its total
 * purchased limit. Role-agnostic — this only answers "is the wallet at/below
 * the line"; whether that should actually block the caller (client: yes,
 * admin/manager: no) is a decision made by each call site, not by the wallet.
 */
export function isAtOrBelowCreateThreshold(wallet: WalletLimitInfo): boolean {
  const threshold = wallet.totalPurchasedHours * WALLET_CREATE_THRESHOLD_PERCENT
  return wallet.remainingHours <= threshold
}

/** Structured error for the client 10% ticket-creation threshold (section 1/7). */
export function buildWalletThresholdError(
  code: 'WALLET_BELOW_CLIENT_THRESHOLD' = 'WALLET_BELOW_CLIENT_THRESHOLD',
): Error & { code: string } {
  return createAppError(
    'Your Support Wallet balance is at or below the 10% limit. Please recharge your wallet before creating a ticket.',
    code,
  )
}

/**
 * Structured error for "requested hours exceed remaining wallet balance"
 * (section 3/4/7) — the hard, no-role-bypass rule. Dynamic values are always
 * interpolated from the real numbers passed in (never hardcoded — section 4).
 *
 * DESIGN NOTE on message length: getFriendlyError() (lib/error-utils.ts)
 * resolves a thrown error's user-facing text in this priority order: (1) a
 * `.code` property looked up in the static ERROR_MESSAGES map, (2) a regex
 * match against ERROR_PATTERNS (also resolves to the STATIC map — it cannot
 * carry dynamic values through), (3) a clean-message passthrough when the
 * message is short (<200 chars) and contains no SQL/stack markers. Because
 * `.code` does not reliably survive a Next.js server action's client
 * boundary in production (see the module-level note below), and because a
 * static ERROR_MESSAGES entry can never contain THIS specific request's
 * numbers, this message is deliberately kept short enough to flow through
 * the passthrough fallback intact — so the real remaining/requested hours
 * always reach the user. No ERROR_PATTERNS entry is registered for this
 * dynamic variant (a pattern match would divert it to the generic static
 * message and silently discard the numbers) — only for the non-dynamic
 * WALLET_BELOW_CLIENT_THRESHOLD message, where static and dynamic are
 * identical text anyway.
 */
export function buildWalletInsufficientError(
  requestedHours: number,
  remainingHours: number,
  code: 'WALLET_INSUFFICIENT_FOR_ESTIMATE' = 'WALLET_INSUFFICIENT_FOR_ESTIMATE',
): Error & { code: string } {
  return createAppError(
    `Insufficient Support Wallet balance. You have ${remainingHours}h remaining, but this requires ${requestedHours}h. ` +
    `Please recharge the wallet or reduce the estimated hours.`,
    code,
  )
}

/** Structured error for the manager-approval-stage recheck (section 4's literal wording). Same passthrough-length discipline as buildWalletInsufficientError. */
export function buildManagerApprovalInsufficientError(requestedHours: number, remainingHours: number): Error & { code: string } {
  return createAppError(
    `Client has insufficient Support Wallet balance for this estimate. The requested ${requestedHours} hours exceeds ` +
    `the client's remaining ${remainingHours} hours. Please recharge the client's wallet or reduce the estimate.`,
    'WALLET_INSUFFICIENT_FOR_ESTIMATE',
  )
}

export interface AtomicDeductionResult {
  id: number
  consumedHours: number
  remainingHours: number
}

/**
 * Race-safe deduction primitive (section 6/12/21). A single UPDATE with a
 * WHERE clause guarding sufficiency, using SQL-expression increment/decrement
 * (not a read-then-write of a JS-computed number) — two concurrent callers
 * each issue their own atomic UPDATE against the CURRENT row value at
 * execution time; Postgres serializes conflicting updates to the same row,
 * so the WHERE clause is evaluated against the true current balance for
 * each caller, never a stale value read earlier in JS. If no row matches
 * (wallet missing, or remainingHours < hours at the moment of the UPDATE),
 * returns null — the caller MUST treat that as "insufficient balance, do not
 * proceed" and roll back/abort whatever transaction it's part of.
 *
 * Accepts a Drizzle db or transaction handle so it can run inside an
 * existing db.transaction() when the deduction must be atomic together with
 * other writes (e.g. a ticket status change), or standalone otherwise.
 */
export async function deductWalletHoursAtomic(
  dbOrTx: { update: typeof import('./db').db.update },
  walletId: number,
  hours: number,
): Promise<AtomicDeductionResult | null> {
  if (hours <= 0) return null
  const rows = await dbOrTx
    .update(supportWallet)
    .set({
      consumedHours: sql`${supportWallet.consumedHours} + ${hours}`,
      remainingHours: sql`${supportWallet.remainingHours} - ${hours}`,
      updatedAt: new Date(),
    })
    .where(and(eq(supportWallet.id, walletId), gte(supportWallet.remainingHours, hours)))
    .returning({
      id: supportWallet.id,
      consumedHours: supportWallet.consumedHours,
      remainingHours: supportWallet.remainingHours,
    })
  return rows[0] ?? null
}
