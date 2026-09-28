import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatActivityEntry, ACTION_LABELS, DETAIL_LINE_ACTIONS } from '../lib/ticket-activity-format.ts'

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
  assert.equal(out.text, 'Customer feedback submitted by Suketu Bhatt')
})

test('Requirement 4: review update logs "Customer Feedback Updated by [user]"', () => {
  const out = formatActivityEntry({ action: 'review_updated', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'Customer feedback updated by Suketu Bhatt')
})

// ─── Requirement 5: Estimate approved — "Estimate approved By [actor]" ────
// Capital "By" is deliberate — the only action with this capitalization,
// per the approved client-facing wording. Hours no longer live in the main
// line; they render as a secondary detail line from ticketHistory.newValue
// (see DETAIL_LINE_ACTIONS test below and app/actions/estimates.ts).

test('Requirement 5: client estimate approval — "Estimate approved By [actor]"', () => {
  const out = formatActivityEntry({ action: 'estimate_approved', userName: 'Suketu Bhatt', userRole: 'client', newValue: '3h estimate approved' })
  assert.equal(out.text, 'Estimate approved By Suketu Bhatt')
})

test('Requirement 5: estimate_approved is the one action that capitalizes "By"', () => {
  const out = formatActivityEntry({ action: 'estimate_approved', userName: 'A. Client', userRole: 'client' })
  assert.equal(out.text, 'Estimate approved By A. Client')
  assert.doesNotMatch(out.text, / by /, 'must use capital "By", not lowercase "by"')
})

test('Requirement 5: estimate_approved detail line carries the hours (DETAIL_LINE_ACTIONS)', () => {
  assert.ok(DETAIL_LINE_ACTIONS.has('estimate_approved'))
})

// ─── Requirement 6: Manager forwards ticket → Customer Feedback requested ──

test('Requirement 6: forwarded_to_client, internal view — "Customer Feedback requested by [Support Manager Name]"', () => {
  const out = formatActivityEntry({ action: 'forwarded_to_client', userName: 'Priya Shah', userRole: 'project_manager' })
  assert.equal(out.text, 'Customer feedback requested by Priya Shah')
})

test('Requirement 6: forwarded_to_client, client view — name redacted, role label shown', () => {
  const out = formatActivityEntry({ action: 'forwarded_to_client', userName: '', userRole: 'project_manager' })
  assert.equal(out.text, 'Customer feedback requested by Support Manager / Project Manager')
})

// ─── Requirement 7: Customer revision request ──────────────────────────────
// Phase 3 renamed this label from "Customer requested revision" to the
// actor-neutral "Revision requested" — the label must never presume WHO
// performed the action; the "by {actor}" suffix already carries that.

test('Requirement 7: client-initiated revision request — "Revision requested by [Client Name]"', () => {
  const out = formatActivityEntry({ action: 'revision_requested', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'Revision requested by Suketu Bhatt')
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

test('estimate_approved with no resolvable actor omits the "By" clause (hours live in the detail line, not here)', () => {
  const out = formatActivityEntry({ action: 'estimate_approved', userName: '', userRole: null, newValue: '5h estimate approved' })
  assert.equal(out.text, 'Estimate approved')
})

test('unknown action falls back to a humanized label with no crash', () => {
  const out = formatActivityEntry({ action: 'some_future_action', userName: 'X', userRole: 'admin' })
  assert.equal(out.text, 'some future action by X')
})

// ============================================================================
// Phase 3 — Fix Activity Log Event Names and Actor Names
// ============================================================================
// Bug 1: rejectEstimate() wrote action: 'revision_requested' for what is
// semantically an ESTIMATE REJECTION, colliding with genuine revision
// requests. Fixed to write 'estimate_rejected' (a label that already existed
// in ACTION_LABELS, unused until now — see estimates.ts).
// Bug 2: 'revision_requested's label baked in an actor-type assumption
// ("Customer requested revision") instead of staying actor-neutral. See the
// Requirement 7 test above for the renamed label itself.

// ─── Case 4: estimate rejected ─────────────────────────────────────────────

test('Case 4: estimate rejected — "Estimate hours request rejected by [user]" (not "Customer requested revision")', () => {
  const out = formatActivityEntry({ action: 'estimate_rejected', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'Estimate hours request rejected by Suketu Bhatt')
})

test('Case 4: estimate_rejected and revision_requested are now DISTINCT labels, never collide', () => {
  assert.notEqual(ACTION_LABELS.estimate_rejected.label, ACTION_LABELS.revision_requested.label)
  assert.equal(ACTION_LABELS.estimate_rejected.label, 'Estimate hours request rejected')
  assert.equal(ACTION_LABELS.revision_requested.label, 'Revision requested')
})

// ─── Case 1: client requests revision (post-fix, exact wording) ───────────

test('Case 1: client requests revision — correct actor and message', () => {
  const out = formatActivityEntry({ action: 'revision_requested', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'Revision requested by Suketu Bhatt')
})

// ─── Cases 2 & 3: manager/admin "Rework" — real actor, both roles ─────────

test('Case 2: admin performs Rework — real actor name, not a role word', () => {
  const out = formatActivityEntry({ action: 'rework_requested', userName: 'Priya Shah', userRole: 'admin' })
  assert.equal(out.text, 'Sent back for rework by Priya Shah')
})

test('Case 3: project_manager performs Rework — real actor name, not a role word', () => {
  const out = formatActivityEntry({ action: 'rework_requested', userName: 'Priya Shah', userRole: 'project_manager' })
  assert.equal(out.text, 'Sent back for rework by Priya Shah')
})

// ─── Case 5: different users each get their own name, never hardcoded ─────

test('Case 5: different users performing the same action each get their own name', () => {
  const names = ['Suketu Bhatt', 'Priya Shah', 'Jordan Lee', 'A. Client', 'Zephyrine Quortlebaum']
  for (const name of names) {
    const out = formatActivityEntry({ action: 'revision_requested', userName: name, userRole: 'client' })
    assert.equal(out.text, `Revision requested by ${name}`)
  }
})

// ============================================================================
// Client Activity Log Visibility & Message Mapping audit — exact wording for
// every client-facing message in the approved catalog. Actor is always the
// value formatActivityEntry() is handed — it never hardcodes a name; getTicketHistory()
// (app/actions/tickets/queries.ts) is what decides, per viewer, whether that
// value is a real name (self) or a role-label fallback (internal actor).
// ============================================================================

test('Catalog 1: Customer feedback submitted — "Customer Feedback Submitted by {actor}"', () => {
  const out = formatActivityEntry({ action: 'review_submitted', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'Customer feedback submitted by Suketu Bhatt')
})

test('Catalog 2: Support request completed — "Support request marked as completed by {actor}"', () => {
  const out = formatActivityEntry({ action: 'client_approved', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'Support request marked as completed by Suketu Bhatt')
})

test('Catalog 3: Customer feedback requested — "Customer Feedback requested by {actor}"', () => {
  const out = formatActivityEntry({ action: 'forwarded_to_client', userName: 'Priya Shah', userRole: 'project_manager' })
  assert.equal(out.text, 'Customer feedback requested by Priya Shah')
})

test('Catalog 4: Revision approved — "Revision approved by {actor}"', () => {
  const out = formatActivityEntry({ action: 'revision_approved', userName: '', userRole: 'project_manager' })
  assert.equal(out.text, 'Revision approved by Support Manager / Project Manager')
})

test('Catalog 5: Estimate approved — "Estimate approved By {actor}" (capital B)', () => {
  const out = formatActivityEntry({ action: 'estimate_approved', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'Estimate approved By Suketu Bhatt')
})

test('Catalog 6: Estimate updated — internal actor always renders as the role label to a client ("Estimate updated by Support Manager / Project Manager")', () => {
  // getTicketHistory() blanks userName for internal actors viewed by a client
  // (updateEstimate is project_manager/admin-only — never the client's own
  // action), so this is the exact scenario a client will see.
  const out = formatActivityEntry({ action: 'estimate_modified', userName: '', userRole: 'project_manager' })
  assert.equal(out.text, 'Estimate updated by Support Manager / Project Manager')
})

test('Catalog 7: Estimate hours rejected — "Estimate hours request rejected by {actor}"', () => {
  const out = formatActivityEntry({ action: 'estimate_rejected', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'Estimate hours request rejected by Suketu Bhatt')
})

test('Catalog 8: Estimate sent for approval — "Estimate hours sent for approval by Support Manager / Project Manager"', () => {
  const out = formatActivityEntry({ action: 'estimate_created', userName: '', userRole: 'project_manager' })
  assert.equal(out.text, 'Estimate hours sent for approval by Support Manager / Project Manager')
})

test('Catalog 9: Ticket creation — "New support request created by {actor}"', () => {
  const out = formatActivityEntry({ action: 'created', userName: 'Suketu Bhatt', userRole: 'client' })
  assert.equal(out.text, 'New support request created by Suketu Bhatt')
})
