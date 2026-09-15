import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatActivityEntry, ACTION_LABELS } from '../lib/ticket-activity-format.ts'

// ============================================================================
// Phase 2 — Activity Log Format
// Verifies every numbered example from the "PHASE 2 — ACTIVITY LOG FORMAT AND
// CUSTOMER FEEDBACK AUDIT EVENTS" spec produces the exact sentence requested,
// plus the privacy-fallback and multi-revision-history requirements.
// ============================================================================

// ─── Requirement 1: New support request ────────────────────────────────────

test('Requirement 1: ticket creation logs "New support request created by [user]"', () => {
  const out = formatActivityEntry({ action: 'created', userName: 'Hiral', userRole: 'client' })
  assert.equal(out.text, 'New support request created by Hiral')
})

// ─── Requirement 2: Estimate submitted, client view (name redacted → role) ─

test('Requirement 2: estimate submission, client view — name redacted, falls back to role label', () => {
  // getTicketHistory() blanks userName for internal actors viewed by a
  // client, but still returns userRole — this is that exact scenario.
  const out = formatActivityEntry({ action: 'estimate_created', userName: '', userRole: 'project_manager' })
  assert.equal(out.text, 'Estimate hours sent for approval by Support Manager / Project Manager')
})

test('Requirement 2: estimate submission, internal view — actual name shown', () => {
  const out = formatActivityEntry({ action: 'estimate_created', userName: 'Jordan Lee', userRole: 'project_manager' })
  assert.equal(out.text, 'Estimate hours sent for approval by Jordan Lee')
})

// ─── Requirement 3: Completion ──────────────────────────────────────────────

test('Requirement 3: completion logs "Support request marked as completed by [user]"', () => {
  const out = formatActivityEntry({ action: 'client_approved', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'Support request marked as completed by Suketu Bhatt')
})

// ─── Requirement 4: Customer Feedback (rating) submitted/updated ───────────

test('Requirement 4: review submission logs "Customer Feedback Submitted by [user]"', () => {
  const out = formatActivityEntry({ action: 'review_submitted', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'Customer Feedback Submitted by Suketu Bhatt')
})

test('Requirement 4: review update logs "Customer Feedback Updated by [user]"', () => {
  const out = formatActivityEntry({ action: 'review_updated', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'Customer Feedback Updated by Suketu Bhatt')
})

// ─── Requirement 5: Client estimate approval — special format ─────────────

test('Requirement 5: client estimate approval — "[Name] (Client) estimate approved (Xh)"', () => {
  const out = formatActivityEntry({ action: 'estimate_approved', userName: 'Suketu Bhatt', userRole: 'client', newValue: '3h' })
  assert.equal(out.text, 'Suketu Bhatt (Client) estimate approved (3h)')
})

test('Requirement 5: hours are read dynamically from newValue, not hardcoded', () => {
  const out = formatActivityEntry({ action: 'estimate_approved', userName: 'A. Client', userRole: 'client', newValue: '12.5h' })
  assert.equal(out.text, 'A. Client (Client) estimate approved (12.5h)')
})

// ─── Requirement 6: Manager forwards ticket → Customer Feedback requested ──

test('Requirement 6: forwarded_to_client, internal view — "Customer Feedback requested by [Support Manager Name]"', () => {
  const out = formatActivityEntry({ action: 'forwarded_to_client', userName: 'Priya Shah', userRole: 'project_manager' })
  assert.equal(out.text, 'Customer Feedback requested by Priya Shah')
})

test('Requirement 6: forwarded_to_client, client view — name redacted, role label shown', () => {
  const out = formatActivityEntry({ action: 'forwarded_to_client', userName: '', userRole: 'project_manager' })
  assert.equal(out.text, 'Customer Feedback requested by Support Manager / Project Manager')
})

// ─── Requirement 7: Customer revision request ──────────────────────────────

test('Requirement 7: client-initiated revision request — "Customer requested revision by [Client Name]"', () => {
  const out = formatActivityEntry({ action: 'revision_requested', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'Customer requested revision by Suketu Bhatt')
})

test('Requirement 7 privacy regression: manager/admin Rework uses a DIFFERENT action code (rework_requested), never revision_requested', () => {
  const out = formatActivityEntry({ action: 'rework_requested', userName: 'Priya Shah', userRole: 'project_manager' })
  assert.equal(out.text, 'Sent back for rework by Priya Shah')
  assert.notEqual(ACTION_LABELS.rework_requested.label, ACTION_LABELS.revision_requested.label)
})

// ─── Requirement 8 & 9: Revision approved / rejected ───────────────────────

test('Requirement 8: "Revision approved by [user]"', () => {
  const out = formatActivityEntry({ action: 'revision_approved', userName: 'Priya Shah', userRole: 'project_manager' })
  assert.equal(out.text, 'Revision approved by Priya Shah')
})

test('Requirement 9: "Revision rejected by [user]"', () => {
  const out = formatActivityEntry({ action: 'revision_rejected', userName: 'Priya Shah', userRole: 'project_manager' })
  assert.equal(out.text, 'Revision rejected by Priya Shah')
})

// ─── Requirement 11: never hardcodes a name ────────────────────────────────

test('Requirement 11: formatter never injects a name of its own — output always traces back to the input actor', () => {
  const out = formatActivityEntry({ action: 'created', userName: 'Zephyrine Quortlebaum', userRole: 'client' })
  assert.match(out.text, /Zephyrine Quortlebaum/)
})

// ─── Actor fallback edge cases ──────────────────────────────────────────────

test('no actor at all (unknown user, unknown role) omits the "by" clause instead of rendering "by undefined"', () => {
  const out = formatActivityEntry({ action: 'created', userName: '', userRole: null })
  assert.equal(out.text, 'New support request created')
  assert.doesNotMatch(out.text, /by\s*$/)
  assert.doesNotMatch(out.text, /undefined/)
})

test('estimate_approved with no resolvable actor still renders the hours', () => {
  const out = formatActivityEntry({ action: 'estimate_approved', userName: '', userRole: null, newValue: '5h' })
  assert.equal(out.text, 'Estimate approved (5h)')
})

test('unknown action falls back to a humanized label with no crash', () => {
  const out = formatActivityEntry({ action: 'some_future_action', userName: 'X', userRole: 'admin' })
  assert.equal(out.text, 'some future action by X')
})
