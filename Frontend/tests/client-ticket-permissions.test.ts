// Client-account permissions: close (creator only), estimates (approvers), review (creator or approver).
// Refusals are RETURNED as { success: false, error } — never thrown into React
// (production Next.js strips thrown server-action messages → minified React error).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  actionFailure,
  canCloseTicket,
  canSubmitTicketReview,
  clientTicketActionDenial,
  closeTicketDeniedMessage,
  isTicketRaiser,
  NO_TICKET_ACCESS_MESSAGE,
  REVIEW_NOT_ALLOWED_MESSAGE,
  revisionDeniedMessage,
} from '../lib/client-ticket-rules.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const UPDATE = read('app/actions/tickets/update.ts')
const REVISIONS = read('app/actions/revisions.ts')
const REVIEWS = read('app/actions/reviews.ts')
const ESTIMATES = read('app/actions/estimates.ts')
const CLOSE_UI = read('components/dashboard/client-approval-actions.tsx')
const REVIEW_UI = read('components/dashboard/ticket-review-section.tsx')

const raiser = { id: 'raiser', userType: 'standard' }
const approver = { id: 'approver', userType: 'approver' }
const colleague = { id: 'colleague', userType: 'standard' }

// ─── Ticket #1995 regression ────────────────────────────────────────────────

test('Ticket #1995: Paramveersinh Kher cannot close Param kher\'s ticket — exact message', () => {
  const error = clientTicketActionDenial({
    actorId: 'paramveersinh', ticketClientId: 'param', raiserName: 'Param kher', actorOnProject: true, action: 'close',
  })
  assert.equal(error, 'This ticket was created by Param kher, so you cannot close this ticket.')
})

test('the creator name is dynamic (Hiral Nirka) and the creator themself is allowed', () => {
  assert.equal(
    clientTicketActionDenial({ actorId: 'other', ticketClientId: 'hiral', raiserName: 'Hiral Nirka', actorOnProject: true, action: 'close' }),
    'This ticket was created by Hiral Nirka, so you cannot close this ticket.',
  )
  assert.equal(
    clientTicketActionDenial({ actorId: 'hiral', ticketClientId: 'hiral', raiserName: 'Hiral Nirka', actorOnProject: true, action: 'close' }),
    null,
  )
})

test('Request For Revision uses the same creator-based message', () => {
  assert.equal(
    clientTicketActionDenial({ actorId: 'paramveersinh', ticketClientId: 'param', raiserName: 'Param kher', actorOnProject: true, action: 'revision' }),
    'This ticket was created by Param kher, so you cannot request a revision for this ticket.',
  )
})

test('fallback never shows undefined / null / Unknown / [object Object]', () => {
  for (const bad of [undefined, null, '', '   ', 'undefined', 'null', 'Unknown', '[object Object]']) {
    const msg = closeTicketDeniedMessage(bad as string | null | undefined)
    assert.equal(msg, 'This ticket was created by another client user, so you cannot close this ticket.')
    assert.doesNotMatch(revisionDeniedMessage(bad as string | null | undefined), /undefined|null|Unknown|\[object/)
  }
})

test('accounts outside the ticket\'s project learn nothing about the ticket', () => {
  assert.equal(
    clientTicketActionDenial({ actorId: 'x', ticketClientId: 'param', raiserName: 'Param kher', actorOnProject: false, action: 'close' }),
    NO_TICKET_ACCESS_MESSAGE,
  )
})

// ─── Server: structured results, checked before any write ──────────────────

test('clientApproveTicket returns a structured result and never lets an error reach React', () => {
  const action = UPDATE.slice(UPDATE.indexOf('export const clientApproveTicket'), UPDATE.indexOf('async function closeTicketAsClient'))
  assert.match(action, /Promise<ClientActionResult>/)
  assert.match(action, /try \{\s*\n\s*return await closeTicketAsClient\(ticketId\)\s*\n\s*\} catch \(err\) \{/)
  assert.match(action, /return \{ success: false, error: getFriendlyError\(err\) \}/, 'unexpected errors → safe message, no stack/internal details')
  assert.doesNotMatch(action, /throw /)
})

test('a rejected close changes nothing: refusal returns BEFORE status change, wallet, activity log and notifications', () => {
  const impl = UPDATE.slice(UPDATE.indexOf('async function closeTicketAsClient'))
  const refusal = impl.indexOf('if (!canCloseTicket(currentUser, t.clientId)) {')
  const refusalReturn = impl.indexOf('return { success: false, error: error ?? NO_TICKET_ACCESS_MESSAGE }')
  assert.ok(refusal !== -1 && refusalReturn > refusal)
  for (const sideEffect of ["status: 'closed'", 'consumeReservedHoursAtomic', "action: 'client_approved'", 'dispatchNotification(']) {
    const at = impl.indexOf(sideEffect)
    assert.ok(at > refusalReturn, `${sideEffect} must come after the refusal`)
  }
  assert.match(impl, /return \{ success: true \}\s*\n\}/)
})

test('requestRevision returns (not throws) client refusals, checked before any write', () => {
  const fn = REVISIONS.slice(REVISIONS.indexOf('export const requestRevision'))
  const refusal = fn.indexOf("action: 'revision',")
  assert.ok(refusal !== -1 && refusal < fn.indexOf('db.transaction('))
  assert.match(fn, /return \{ success: false as const, error: error \?\? NO_TICKET_ACCESS_MESSAGE \}/)
})

test('actionFailure extracts structured failures and ignores successes', () => {
  assert.equal(actionFailure({ success: false, error: 'nope' }), 'nope')
  assert.equal(actionFailure({ success: false }), 'Something went wrong. Please try again.')
  assert.equal(actionFailure({ success: true }), null)
  assert.equal(actionFailure(undefined), null)
  assert.equal(actionFailure({ id: 1 }), null, 'legacy success objects are not failures')
})

// ─── Frontend: results displayed, never thrown ─────────────────────────────

test('UI shows the message from the structured result in the existing error line', () => {
  assert.match(CLOSE_UI, /const res = await clientApproveTicket\(ticketId\)\s*\n[\s\S]*?const failure = actionFailure\(res\)\s*\n\s*if \(failure\) \{\s*\n\s*setError\(failure\)/)
  for (const f of ['components/dashboard/client-approval-actions.tsx', 'components/dashboard/revision-request-action.tsx', 'components/dashboard/manager-review-actions.tsx']) {
    assert.match(read(f), /const res = await requestRevision\(\{[\s\S]*?const failure = actionFailure\(res\)/, `${f} handles requestRevision results`)
  }
})

test('non-creator sees "Approval unavailable" with the reason instead of active buttons', () => {
  assert.match(CLOSE_UI, /\{mayClose \? 'Your Approval Required' : 'Approval unavailable'\}/)
  assert.match(CLOSE_UI, /<p>\{closeTicketDeniedMessage\(raisedByName\)\}<\/p>/)
  assert.match(CLOSE_UI, /\{mayClose && \(\s*\n\s*<div className="flex flex-wrap gap-2">/)
})

// ─── Unchanged: estimates + reviews ────────────────────────────────────────

test('rules: only the creator can close; review allowed for creator or approver', () => {
  assert.equal(canCloseTicket(raiser, 'raiser'), true)
  assert.equal(canCloseTicket(approver, 'raiser'), false)
  assert.equal(canCloseTicket(colleague, 'raiser'), false)
  assert.equal(canSubmitTicketReview(raiser, 'raiser'), true)
  assert.equal(canSubmitTicketReview(approver, 'raiser'), true)
  assert.equal(canSubmitTicketReview(colleague, 'raiser'), false)
  assert.equal(isTicketRaiser(colleague, 'raiser'), false)
})

test('server: submitReview allows the creator or a PROJECT-scoped approver, otherwise rejects', () => {
  const fn = REVIEWS.slice(REVIEWS.indexOf('export const submitReview'), REVIEWS.indexOf('export const updateReview'))
  assert.match(fn, /isTicketRaiser\(currentUser, t\.clientId\) \|\|\s*\n\s*\(currentUser\.userType === 'approver' && \(await approverCanActOnTicket\(currentUser\.id, t\)\)\)/)
  assert.match(fn, /if \(!mayReview\) throw new Error\(REVIEW_NOT_ALLOWED_MESSAGE\)/)
  assert.ok(REVIEW_NOT_ALLOWED_MESSAGE.length > 0)
  assert.match(REVIEW_UI, /canSubmitTicketReview\(\{ id: currentUserId, userType: currentUserType \}, ticketClientId\)/)
})

test('estimate approval permissions are unchanged (approver-only, project-scoped)', () => {
  for (const name of ['approveEstimate', 'rejectEstimate']) {
    const start = ESTIMATES.indexOf(`export const ${name} =`)
    const fn = ESTIMATES.slice(start, ESTIMATES.indexOf('export const', start + 10))
    assert.match(fn, /currentUser\.userType !== 'approver'/)
    assert.match(fn, /approverCanActOnTicket\(currentUser\.id, t\)/)
  }
})
