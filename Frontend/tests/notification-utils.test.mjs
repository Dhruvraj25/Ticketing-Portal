// ============================================================================
// Notification Dispatcher — Verification Suite (Phase 13)
// ============================================================================
// Runs with:  node --test tests/
// Node 24 natively type-strips the .ts helper module — no build step needed.
//
// Covers:
//   1. Dedup-key construction (Phase 6)
//   2. Recipient deduplication across roles (Phase 9)
//   3. Channel resolution
//   4. Wallet threshold-crossing logic (Phase 8)
//   5. Static audit: no business code calls legacy notification entry points
//      directly — everything must go through the unified dispatcher (Phase 5)
// ============================================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildDedupKey,
  dedupeRecipients,
  resolveChannels,
  ALL_CHANNELS,
  shouldNotifyWalletLow,
  shouldNotifyWalletEmpty,
  WALLET_LOW_THRESHOLD,
  shouldSendTeamsForUser,
} from '../lib/notification-utils.ts'

// ─── Phase 6: Dedup keys ────────────────────────────────────────────────────

test('buildDedupKey produces the canonical (event, scope, user) key', () => {
  assert.equal(buildDedupKey('ticket_created', 'u1', 'ticket:42'), 'ticket_created:ticket:42:u1')
  assert.equal(buildDedupKey('wallet_low', 'u2', 'wallet:7'), 'wallet_low:wallet:7:u2')
})

test('buildDedupKey defaults the scope so no-scope events still dedup', () => {
  assert.equal(buildDedupKey('welcome', 'u1'), 'welcome:default:u1')
})

test('buildDedupKey distinguishes scopes — same user, different entity, different key', () => {
  const a = buildDedupKey('wallet_low', 'u1', 'wallet:1')
  const b = buildDedupKey('wallet_low', 'u1', 'wallet:2')
  assert.notEqual(a, b)
})

// ─── Phase 9: Recipient deduplication ───────────────────────────────────────

test('dedupeRecipients collapses the same user across multiple roles', () => {
  const recipients = [
    { userId: 'u-manager', inApp: { title: 'A', message: 'm' } },
    { userId: 'u-dev', inApp: { title: 'B', message: 'd' } },
    // Same manager also resolved as project owner + assigned resource
    { userId: 'u-manager', email: { templateData: { x: 1 } } },
    { userId: 'u-manager', teams: { payload: { x: 2 } } },
  ]
  const deduped = dedupeRecipients(recipients)
  assert.equal(deduped.length, 2)
  const manager = deduped.find((r) => r.userId === 'u-manager')
  assert.ok(manager)
  // Channels from every occurrence merged — one notification set per user.
  assert.deepEqual(manager.channels?.sort(), ['email', 'inApp', 'teams'])
  assert.ok(manager.inApp, 'keeps in-app data')
  assert.ok(manager.email, 'keeps email data')
  assert.ok(manager.teams, 'keeps teams data')
})

test('dedupeRecipients keeps distinct users intact', () => {
  const recipients = [
    { userId: 'u1', inApp: { title: 'T', message: 'M' } },
    { userId: 'u2', inApp: { title: 'T', message: 'M' } },
  ]
  assert.equal(dedupeRecipients(recipients).length, 2)
})

test('dedupeRecipients returns empty for empty input', () => {
  assert.deepEqual(dedupeRecipients([]), [])
})

// ─── Channel resolution ─────────────────────────────────────────────────────

test('resolveChannels defaults to all three channels', () => {
  assert.deepEqual(resolveChannels(undefined), ALL_CHANNELS)
  assert.deepEqual(resolveChannels([]), ALL_CHANNELS)
})

test('resolveChannels honors explicit channel lists and dedupes', () => {
  assert.deepEqual(resolveChannels(['email']), ['email'])
  assert.deepEqual(resolveChannels(['inApp', 'email', 'inApp']), ['inApp', 'email'])
})

// ─── Phase 8: Wallet threshold-crossing ─────────────────────────────────────

test('shouldNotifyWalletLow fires only when crossing the threshold', () => {
  assert.equal(shouldNotifyWalletLow(100, 15), true)   // crossed: 100 → 15
  assert.equal(shouldNotifyWalletLow(100, 20), true)   // crossed exactly
  assert.equal(shouldNotifyWalletLow(21, 20), true)    // crossed exactly at boundary
  assert.equal(shouldNotifyWalletLow(20, 15), false)   // already below — no new crossing
  assert.equal(shouldNotifyWalletLow(15, 10), false)   // stays below — no repeat
  assert.equal(shouldNotifyWalletLow(100, 120), false) // increased — no alert
  assert.equal(shouldNotifyWalletLow(100, 100), false) // unchanged — no alert
})

test('shouldNotifyWalletLow honors a custom threshold', () => {
  assert.equal(shouldNotifyWalletLow(30, 25, 25), true)
  assert.equal(shouldNotifyWalletLow(25, 20, 25), false)
})

test('shouldNotifyWalletLow never fires on repeated low-balance closes', () => {
  // The historical bug: alerts re-fired on EVERY ticket close while low.
  assert.equal(shouldNotifyWalletLow(10, 8), false)
  assert.equal(shouldNotifyWalletLow(8, 5), false)
  assert.equal(shouldNotifyWalletLow(5, 2), false)
})

test('shouldNotifyWalletEmpty fires only when crossing to zero', () => {
  assert.equal(shouldNotifyWalletEmpty(5, 0), true)
  assert.equal(shouldNotifyWalletEmpty(0, 0), false)   // already empty — no repeat
  assert.equal(shouldNotifyWalletEmpty(0, 5), false)   // recharged — no alert
  assert.equal(shouldNotifyWalletEmpty(5, 3), false)   // not at zero
})

test('default wallet-low threshold constant is 20h', () => {
  assert.equal(WALLET_LOW_THRESHOLD, 20)
})

// ─── Phase 3: Client Teams toggle ───────────────────────────────────────────

test('shouldSendTeamsForUser gates client accounts on their preference', () => {
  assert.equal(shouldSendTeamsForUser('client', true), true)
  assert.equal(shouldSendTeamsForUser('client', false), false)
  // Schema default is OFF — a client with no preference set must not receive Teams.
  assert.equal(shouldSendTeamsForUser('client', undefined), false)
  assert.equal(shouldSendTeamsForUser('client', null), false)
})

test('shouldSendTeamsForUser never gates internal staff', () => {
  assert.equal(shouldSendTeamsForUser('admin', false), true)
  assert.equal(shouldSendTeamsForUser('project_manager', false), true)
  assert.equal(shouldSendTeamsForUser('developer', false), true)
  assert.equal(shouldSendTeamsForUser('admin', undefined), true)
  assert.equal(shouldSendTeamsForUser(null, false), true)
})

// ─── Phase 5: Static audit — single entry point ─────────────────────────────

const ROOT = join(import.meta.dirname, '..')

// Business logic must never call the legacy entry points directly.
const LEGACY_CALL_PATTERNS = [
  'sendNotificationToUser(',   // old email bridge helper
  'sendTeamsNotificationToUser(', // old teams bridge helper
  'sendTeamsNotification(',    // old teams helper
  'queueEmailToUser(',         // deprecated frontend queue
  'queueEmail(',
  'notifyAll(',                // old dispatcher (now a deprecated wrapper)
  'createNotification(',       // must be called by dispatcher only
]

// Files that legitimately define/use these symbols internally (the dispatcher
// infrastructure itself, the notification CRUD action, and the deprecated queue
// kept mounted for the legacy cron route).
const ALLOWLIST = [
  'app/actions/notifications.ts',
  'app/api/email/',
  'lib/email-backend.ts',
  'lib/teams-backend.ts',
  'lib/notify-all.ts',
  'lib/notification-utils.ts',
  'lib/email/',
]

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

function isAllowed(rel) {
  return ALLOWLIST.some((a) => rel.startsWith(a))
}

test('no business code bypasses the unified dispatcher', () => {
  const offenders = []
  const files = walk(join(ROOT, 'app'), []).concat(walk(join(ROOT, 'lib'), []))
  for (const file of files) {
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/')
    if (isAllowed(rel)) continue
    const src = readFileSync(file, 'utf8')
    for (const pattern of LEGACY_CALL_PATTERNS) {
      if (src.includes(pattern)) {
        offenders.push(rel + ' → ' + pattern)
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'Legacy notification calls still exist — every event must go through dispatchNotification():\n' + offenders.join('\n'),
  )
})

test('no business code imports the deprecated frontend email queue', () => {
  const offenders = []
  const files = walk(join(ROOT, 'app'), [])
  for (const file of files) {
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/')
    if (rel.startsWith('app/api/email/')) continue // legacy cron mount (deprecated, kept mounted)
    const src = readFileSync(file, 'utf8')
    if (/from ['"]@\/lib\/email['"]/.test(src)) {
      offenders.push(rel + ' imports @/lib/email (deprecated queue)')
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'))
})

test('no business code calls the deprecated notifyAll wrappers', () => {
  const offenders = []
  const files = walk(join(ROOT, 'app'), [])
  for (const file of files) {
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/')
    const src = readFileSync(file, 'utf8')
    if (src.includes('notifyAllToUser(') || src.includes('notifyTeamsToUser(')) {
      offenders.push(rel + ' calls a deprecated notify-all wrapper')
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'))
})

// ─── Phase 1 regression: backend email bridge must never silently drop events ─

// The Express backend lives in the sibling Backend/ directory.
const BACKEND_EMAIL_ROUTE = join(ROOT, '..', 'Backend', 'src', 'routes', 'email-notification.ts')
const BACKEND_EMAIL_SERVICE = join(ROOT, '..', 'Backend', 'src', 'services', 'email', 'email.service.ts')

// Every event the frontend dispatcher may emit must have a switch case in the
// backend bridge (the historical bug: events fell through to 'default' and the
// email was silently dropped).
const BRIDGE_EVENT_TYPES = [
  'ticket_created',
  'ticket_assigned',
  'estimate_approved',
  'estimate_rejected',
  'additional_hours',
  'additional_hours_requested',
  'additional_hours_rejected',
  'ticket_resolved',
  'ticket_closed',
  'welcome',
  'customer_created',
  'account_activated',
  'wallet_low',
  'ticket_reopened',
  'ticket_reassigned',
  'ticket_revision_requested',
  'revision_requested',
  'estimate_requested',
  'additional_hours_approved',
  'wallet_empty',
  'support_hours_added',
  'support_hours_assigned',
  // Previously broken — must never regress:
  'password_reset',
  'new_project',
  'developer_started_work',
  'developer_completed_work',
  'revision_approved',
  'revision_rejected',
  'support_renewal_reminder',
  'login_credentials',
  // Previously missing entirely (audit finding: Manager Review / Rework had
  // no email-template coverage) — now implemented, must never regress:
  'manager_review',
  'rework',
]

test('backend email bridge covers every supported event type (no silent drops)', () => {
  const routeSrc = readFileSync(BACKEND_EMAIL_ROUTE, 'utf8')
  const missing = BRIDGE_EVENT_TYPES.filter((evt) => !routeSrc.includes(`'${evt}'`))
  assert.deepEqual(missing, [], 'Bridge is missing switch case(s): ' + missing.join(', '))
})

test('backend email service exports a send method for each bridge event', () => {
  const routeSrc = readFileSync(BACKEND_EMAIL_ROUTE, 'utf8')
  const serviceSrc = readFileSync(BACKEND_EMAIL_SERVICE, 'utf8')
  // The route imports send* methods from the service; each imported symbol
  // must actually be exported by the service.
  const imported = [...routeSrc.matchAll(/import \{([^}]+)\}/g)]
    .flatMap((m) => m[1].split(','))
    .map((s) => s.trim())
    .filter((s) => s.startsWith('send'))
  const missing = imported.filter((sym) => !new RegExp('export function ' + sym + '\\b').test(serviceSrc))
  assert.deepEqual(missing, [], 'Route imports missing from email.service.ts: ' + missing.join(', '))
})

test('login_credentials template + service method exist', () => {
  const templateFile = join(ROOT, '..', 'Backend', 'src', 'services', 'email', 'templates', 'login-credentials.ts')
  const templateSrc = readFileSync(templateFile, 'utf8')
  assert.ok(templateSrc.includes('loginCredentialsTemplate'), 'login-credentials template missing')
  const serviceSrc = readFileSync(BACKEND_EMAIL_SERVICE, 'utf8')
  assert.ok(serviceSrc.includes('sendLoginCredentials'), 'sendLoginCredentials not registered in email service')
})

test('onboarding wires the sendEmail checkbox to login_credentials dispatch', () => {
  const onboardingSrc = readFileSync(join(ROOT, 'app', 'actions', 'onboarding.ts'), 'utf8')
  assert.ok(onboardingSrc.includes("eventType: 'login_credentials'"), 'onboarding does not dispatch login_credentials')
  assert.ok(onboardingSrc.includes('if (!cu.sendEmail) continue') || onboardingSrc.includes('if (cu.sendEmail)'), 'onboarding does not gate on the sendEmail flag')
})

// ─── Manager Review / Rework — email template coverage (known-issue fix) ───

test('manager_review and rework templates + service methods exist', () => {
  const managerReviewTemplateSrc = readFileSync(
    join(ROOT, '..', 'Backend', 'src', 'services', 'email', 'templates', 'manager-review.ts'), 'utf8',
  )
  const reworkTemplateSrc = readFileSync(
    join(ROOT, '..', 'Backend', 'src', 'services', 'email', 'templates', 'rework.ts'), 'utf8',
  )
  assert.ok(managerReviewTemplateSrc.includes('managerReviewTemplate'), 'manager-review template missing')
  assert.ok(reworkTemplateSrc.includes('reworkTemplate'), 'rework template missing')

  const serviceSrc = readFileSync(BACKEND_EMAIL_SERVICE, 'utf8')
  assert.ok(serviceSrc.includes('sendManagerReview'), 'sendManagerReview not registered in email service')
  assert.ok(serviceSrc.includes('sendRework'), 'sendRework not registered in email service')
})

test('revisions.ts dispatches Manager Rework email under the rework template, not the client-Revision one', () => {
  const src = readFileSync(join(ROOT, 'app', 'actions', 'revisions.ts'), 'utf8')
  // The manager/admin branch's email.eventType must be 'rework' (its own
  // dedicated template), not 'revision_requested' (client-initiated).
  assert.match(src, /eventType:\s*'rework'/)
})

test('developer resolving a ticket notifies the manager (manager_review), never the client', () => {
  const src = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'update.ts'), 'utf8')
  const resolvedBlockStart = src.indexOf("if (newStatus === 'resolved'")
  const resolvedBlockEnd = src.indexOf("\n  }", src.indexOf('dispatchNotification', resolvedBlockStart))
  const resolvedBlock = src.slice(resolvedBlockStart, resolvedBlockEnd)
  assert.ok(resolvedBlock.includes("eventType: 'manager_review'"), 'developer-resolve path must dispatch manager_review')
  assert.ok(!resolvedBlock.includes('userId: t.clientId'), 'developer-resolve path must NOT notify the client (premature — manager has not reviewed yet)')
})

// ─── Requirement #9 — approval cycles must not be permanently deduplicated ──
// A dedup scope of just `ticket:${id}` blocks every cycle after the first
// forever (no windowMinutes is set on these dispatches). Every approval-style
// event that can legitimately repeat (estimate, additional-hours, revision/
// rework, manager/client review) must scope its dedup key to the specific
// cycle, not just the ticket.

test('approval-cycle dedup keys are distinct per cycle, so cycles 1/2/3 all send', () => {
  // Simulates three estimate re-submissions on the same ticket to the same
  // recipient: each submission gets a new estimateSubmittedAt timestamp.
  const cycle1 = buildDedupKey('estimate_requested', 'client-1', 'ticket:9:est:1000')
  const cycle2 = buildDedupKey('estimate_requested', 'client-1', 'ticket:9:est:2000')
  const cycle3 = buildDedupKey('estimate_requested', 'client-1', 'ticket:9:est:3000')
  assert.notEqual(cycle1, cycle2)
  assert.notEqual(cycle2, cycle3)
  assert.notEqual(cycle1, cycle3)

  // A retry of the SAME cycle (e.g. duplicate form submit) must still collapse.
  const retryOfCycle1 = buildDedupKey('estimate_requested', 'client-1', 'ticket:9:est:1000')
  assert.equal(cycle1, retryOfCycle1)
})

test('manager-review and client-review cycle keys advance with revisionCount', () => {
  // resolve -> rework -> resolve again is cycle 0 then cycle 1.
  const cycle0 = buildDedupKey('manager_review', 'manager-1', 'ticket:9:cycle:0')
  const cycle1 = buildDedupKey('manager_review', 'manager-1', 'ticket:9:cycle:1')
  assert.notEqual(cycle0, cycle1)

  const forwardCycle0 = buildDedupKey('ticket_resolved', 'client-1', 'ticket:9:cycle:0')
  const forwardCycle1 = buildDedupKey('ticket_resolved', 'client-1', 'ticket:9:cycle:1')
  assert.notEqual(forwardCycle0, forwardCycle1)
})

test('rework and revision-requested dedup keys never collide across event types', () => {
  // Before the fix both used eventType 'revision_requested' AND scope
  // `ticket:${id}` — identical keys meant a manager rework silently swallowed
  // if a client revision (or vice versa) had already notified that recipient.
  const reworkKey = buildDedupKey('rework', 'dev-1', 'revision:501')
  const clientRevisionKey = buildDedupKey('request_for_revision', 'dev-1', 'revision:502')
  assert.notEqual(reworkKey, clientRevisionKey)
})

test('regression: no dispatch site reverts to a bare ticket-only scope for cycle-repeatable events', () => {
  const estimatesSrc = readFileSync(join(ROOT, 'app', 'actions', 'estimates.ts'), 'utf8')
  const updateSrc = readFileSync(join(ROOT, 'app', 'actions', 'tickets', 'update.ts'), 'utf8')
  const revisionsSrc = readFileSync(join(ROOT, 'app', 'actions', 'revisions.ts'), 'utf8')

  // Each of these dedup scopes must carry a per-cycle discriminator.
  assert.match(estimatesSrc, /scope: `ticket:\$\{ticketId\}:est:\$\{estimateSubmittedAt\.getTime\(\)\}`/, 'estimate_requested must be cycle-scoped')
  assert.match(estimatesSrc, /scope: `ticket:\$\{ticketId\}:est:\$\{estimateCycleKey\}`/, 'estimate_rejected must be cycle-scoped')
  assert.match(estimatesSrc, /scope: `ticket:\$\{ticketId\}:hours:\$\{additionalHoursDeadline\.getTime\(\)\}`/, 'additional_hours_requested must be cycle-scoped')
  assert.match(estimatesSrc, /scope: `ticket:\$\{ticketId\}:hours:\$\{hoursCycleKey\}`/, 'additional_hours_rejected must be cycle-scoped')
  assert.match(updateSrc, /scope: `ticket:\$\{ticketId\}:cycle:\$\{t\.revisionCount \|\| 0\}`/, 'manager_review / forward-to-client must be cycle-scoped')
  assert.match(revisionsSrc, /scope: `revision:\$\{result\.revision\.id\}`/, 'rework / revision requested must be scoped per revision record')
})
