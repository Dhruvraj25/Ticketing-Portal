import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  WALLET_CREATE_THRESHOLD_PERCENT,
  isAtOrBelowCreateThreshold,
  checkWalletSufficiency,
  buildWalletThresholdError,
  buildWalletInsufficientError,
  buildManagerApprovalInsufficientError,
} from '../lib/wallet-validation.ts'
import { getFriendlyError } from '../lib/error-utils.ts'

// ============================================================================
// Phase — Support Wallet Balance, Ticket Creation & Estimate Validation.
// Pure, DB-free unit tests for lib/wallet-validation.ts. Covers spec cases
// 1-4, 12-14, 18 (threshold/sufficiency arithmetic) plus an explicit
// production-error-serialization proof (see the last section).
// ============================================================================

test('WALLET_CREATE_THRESHOLD_PERCENT is 10%', () => {
  assert.equal(WALLET_CREATE_THRESHOLD_PERCENT, 0.10)
})

// ─── isAtOrBelowCreateThreshold — the 10%-of-limit rule (spec's own examples) ─

test('case A2: wallet limit 100h, remaining 50h -> CAN create (above threshold)', () => {
  assert.equal(isAtOrBelowCreateThreshold({ remainingHours: 50, totalPurchasedHours: 100 }), false)
})

test('remaining 20h of 100h limit -> CAN create (above threshold, spec example)', () => {
  assert.equal(isAtOrBelowCreateThreshold({ remainingHours: 20, totalPurchasedHours: 100 }), false)
})

test('case A2 (exact threshold): wallet limit 100h, remaining 10h (exactly 10%) -> CANNOT create', () => {
  assert.equal(isAtOrBelowCreateThreshold({ remainingHours: 10, totalPurchasedHours: 100 }), true)
})

test('case A3: remaining 5h of 100h limit (below 10%) -> CANNOT create', () => {
  assert.equal(isAtOrBelowCreateThreshold({ remainingHours: 5, totalPurchasedHours: 100 }), true)
})

test('case A4: remaining 0h -> CANNOT create', () => {
  assert.equal(isAtOrBelowCreateThreshold({ remainingHours: 0, totalPurchasedHours: 100 }), true)
})

test('totalPurchasedHours = 0 never divides by zero and still blocks at remainingHours <= 0', () => {
  assert.equal(isAtOrBelowCreateThreshold({ remainingHours: 0, totalPurchasedHours: 0 }), true)
  assert.equal(isAtOrBelowCreateThreshold({ remainingHours: -1, totalPurchasedHours: 0 }), true)
})

test('scales correctly for a different limit (50h limit, 5h remaining = exactly 10%)', () => {
  assert.equal(isAtOrBelowCreateThreshold({ remainingHours: 5, totalPurchasedHours: 50 }), true)
  assert.equal(isAtOrBelowCreateThreshold({ remainingHours: 5.01, totalPurchasedHours: 50 }), false)
})

// ─── checkWalletSufficiency (reused, not reimplemented) — cases 12-14 ──────

test('case D12: balance 20h, estimate 20h (exact match) -> ALLOWED', () => {
  const result = checkWalletSufficiency(20, 20)
  assert.equal(result.ok, true)
})

test('case D13: balance 20h, estimate 20.01h -> REJECTED', () => {
  const result = checkWalletSufficiency(20.01, 20)
  assert.equal(result.ok, false)
})

test('case D14: balance 20h, estimate 30h -> REJECTED', () => {
  const result = checkWalletSufficiency(30, 20)
  assert.equal(result.ok, false)
})

test('case F18: sufficiency check never treats a within-balance request as insufficient (would-be-negative guard is the caller\'s job via this same function)', () => {
  // 30h requested against 20h remaining would leave -10h if ever allowed —
  // checkWalletSufficiency is exactly what every call site uses to prevent that.
  assert.equal(checkWalletSufficiency(30, 20).ok, false)
  assert.equal(checkWalletSufficiency(20, 20).ok, true)
})

// ─── Error builders — section 7 (structured codes) + section 4 (dynamic values) ─

test('buildWalletThresholdError carries code WALLET_BELOW_CLIENT_THRESHOLD and the exact spec message', () => {
  const err = buildWalletThresholdError()
  assert.equal((err as any).code, 'WALLET_BELOW_CLIENT_THRESHOLD')
  assert.equal(err.message, 'Your Support Wallet balance is at or below the 10% limit. Please recharge your wallet before creating a ticket.')
})

test('buildWalletInsufficientError carries code WALLET_INSUFFICIENT_FOR_ESTIMATE and interpolates the REAL numbers (never hardcoded)', () => {
  const err = buildWalletInsufficientError(30, 20)
  assert.equal((err as any).code, 'WALLET_INSUFFICIENT_FOR_ESTIMATE')
  assert.match(err.message, /20h remaining/)
  assert.match(err.message, /requires 30h/)

  const err2 = buildWalletInsufficientError(7.5, 3.25)
  assert.match(err2.message, /3\.25h remaining/)
  assert.match(err2.message, /requires 7\.5h/)
})

test('buildManagerApprovalInsufficientError uses the section 4 literal wording with the real dynamic values', () => {
  const err = buildManagerApprovalInsufficientError(30, 20)
  assert.equal((err as any).code, 'WALLET_INSUFFICIENT_FOR_ESTIMATE')
  assert.equal(
    err.message,
    "Client has insufficient Support Wallet balance for this estimate. The requested 30 hours exceeds the client's remaining 20 hours. Please recharge the client's wallet or reduce the estimate.",
  )
})

// ─── CRITICAL: production error-serialization proof ────────────────────────
// Next.js server actions strip custom Error properties (like `.code`) when
// crossing the server->client boundary in production builds — only
// `.message` reliably survives. These tests simulate exactly that: a PLAIN
// Error with no `.code` at all (what the browser actually receives), proving
// getFriendlyError() still resolves the correct, dynamic-value-preserving
// text via its clean-message passthrough fallback — not via the `.code`
// lookup, which would silently never fire in production. This is the reason
// buildWalletInsufficientError/buildManagerApprovalInsufficientError were
// deliberately kept short enough (<200 chars) and free of any
// SQL/Prisma/stack-trace-looking substring, and why NO ERROR_PATTERNS entry
// was added for these two dynamic messages (a pattern match would resolve to
// the STATIC ERROR_MESSAGES text and discard the real numbers).

test('SERIALIZATION-LOSS PROOF: WALLET_INSUFFICIENT_FOR_ESTIMATE message survives as plain Error(message) with no .code, dynamic numbers intact', () => {
  const original = buildWalletInsufficientError(30, 20)
  const asReceivedByBrowser = new Error(original.message) // .code stripped, exactly like production
  const friendly = getFriendlyError(asReceivedByBrowser)
  assert.equal(friendly, original.message)
  assert.match(friendly, /20h remaining/)
  assert.match(friendly, /requires 30h/)
})

test('SERIALIZATION-LOSS PROOF: manager-approval-stage message survives as plain Error(message) with no .code, dynamic numbers intact', () => {
  const original = buildManagerApprovalInsufficientError(30, 20)
  const asReceivedByBrowser = new Error(original.message)
  const friendly = getFriendlyError(asReceivedByBrowser)
  assert.equal(friendly, original.message)
  assert.match(friendly, /requested 30 hours/)
  assert.match(friendly, /remaining 20 hours/)
})

test('SERIALIZATION-LOSS PROOF: WALLET_BELOW_CLIENT_THRESHOLD message survives as plain Error(message) with no .code, via the ERROR_PATTERNS match (not passthrough)', () => {
  const original = buildWalletThresholdError()
  const asReceivedByBrowser = new Error(original.message)
  const friendly = getFriendlyError(asReceivedByBrowser)
  assert.equal(friendly, original.message)
})

test('non-wallet errors are unaffected by the new patterns/messages (no regression to existing error handling)', () => {
  assert.equal(getFriendlyError(new Error('A user with this email address already exists.')), 'A user with this email address already exists.')
  assert.equal(getFriendlyError(new Error('Access denied')), 'You do not have permission to perform this action.')
})
