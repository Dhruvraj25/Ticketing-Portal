import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_CHANNELS,
  canonicalNotificationEvent,
  defaultNotificationEnabled,
  indexPreferences,
  isNotificationEnabled,
  buildUserSettings,
  type NotificationPreferenceRow,
} from '../lib/notification-catalog.ts'

// ─── Catalog parity with the backend (src/lib/notification-preferences.ts) ─
// The UI renders exactly the events/channels/labels the backend dispatchers
// enforce. Keep this in sync when the backend catalog changes.

test('catalog mirrors the backend event list (28 events, backend order preserved)', () => {
  assert.equal(NOTIFICATION_EVENTS.length, 28)
  const keys = NOTIFICATION_EVENTS.map(e => e.eventType)
  assert.deepEqual(keys, [
    // Ticket workflow
    'ticket_created', 'ticket_assigned', 'manager_review', 'client_review',
    'rework', 'request_for_revision', 'ticket_closed', 'ticket_reopened',
    // Approvals
    'estimate_requested', 'estimate_approved', 'estimate_rejected',
    'additional_hours_requested', 'additional_hours_approved', 'additional_hours_rejected',
    // Work activity
    'developer_started_work', 'developer_completed_work', 'revision_approved', 'revision_rejected',
    // Support wallet
    'wallet_low', 'wallet_empty', 'support_hours_added',
    // Account & product
    'customer_created', 'account_activated', 'welcome', 'new_project',
    'password_reset', 'login_credentials', 'support_renewal_reminder',
  ])
})

test('every catalog event has the labels/groups the settings UI shows', () => {
  // Subset named in the product spec must be present with display labels.
  const byType = new Map(NOTIFICATION_EVENTS.map(e => [e.eventType, e]))
  assert.equal(byType.get('ticket_assigned')?.label, 'Ticket assigned to me')
  assert.equal(byType.get('manager_review')?.label, 'Ticket ready for manager review')
  assert.equal(byType.get('client_review')?.label, 'Ticket awaiting my review')
  assert.equal(byType.get('rework')?.label, 'Rework requested')
  assert.equal(byType.get('request_for_revision')?.label, 'Revision requested')
  assert.equal(byType.get('ticket_closed')?.label, 'Ticket closed')
  assert.ok(byType.get('estimate_approved'))
})

test('channels are in_app, email, teams — one row per channel', () => {
  assert.deepEqual(NOTIFICATION_CHANNELS, ['in_app', 'email', 'teams'])
})

test('alias spellings resolve to the canonical preference key', () => {
  assert.equal(canonicalNotificationEvent('ticket_resolved'), 'client_review')
  assert.equal(canonicalNotificationEvent('awaiting_client_review'), 'client_review')
  assert.equal(canonicalNotificationEvent('revision_requested'), 'request_for_revision')
  assert.equal(canonicalNotificationEvent('ticket_revision_requested'), 'request_for_revision')
  assert.equal(canonicalNotificationEvent('ticket_reassigned'), 'ticket_assigned')
  assert.equal(canonicalNotificationEvent('estimate_approved'), 'estimate_approved')
  assert.equal(canonicalNotificationEvent('bogus_event'), null)
  assert.equal(canonicalNotificationEvent(null), null)
})

test('client channel defaults: Email/In-App ON, Teams follows customer toggle', () => {
  // Customer-level Teams switch OFF (default)
  assert.equal(defaultNotificationEnabled('email', { role: 'client', enableTeamsNotifications: false }), true)
  assert.equal(defaultNotificationEnabled('in_app', { role: 'client', enableTeamsNotifications: false }), true)
  assert.equal(defaultNotificationEnabled('teams', { role: 'client', enableTeamsNotifications: false }), false)
  // Customer-level Teams switch ON
  assert.equal(defaultNotificationEnabled('teams', { role: 'client', enableTeamsNotifications: true }), true)
  // Internal staff always receive Teams unless they opt out per event
  assert.equal(defaultNotificationEnabled('teams', { role: 'admin' }), true)
  assert.equal(defaultNotificationEnabled('teams', { role: 'project_manager' }), true)
})

test('buildUserSettings: explicit rows override defaults per (channel, event)', () => {
  const rows: NotificationPreferenceRow[] = [
    { clientId: 'client-a', channel: 'email', eventType: 'ticket_assigned', enabled: false },
    { clientId: 'client-a', channel: 'teams', eventType: 'ticket_closed', enabled: true },
  ]
  const byUser = new Map<string, Map<string, boolean>>()
  byUser.set('client-a', indexPreferences(rows))

  const settings = buildUserSettings(
    { role: 'client', enableTeamsNotifications: false },
    byUser,
    'client-a',
  )
  const byType = new Map(settings.map(s => [s.eventType, s]))

  // Explicit OFF for email wins over the Email default.
  assert.equal(byType.get('ticket_assigned')?.email, false)
  // Teams default OFF (customer toggle off) but explicit ON row wins.
  assert.equal(byType.get('ticket_closed')?.teams, true)
  assert.equal(byType.get('ticket_closed')?.email, true) // no explicit email row → default
  assert.equal(byType.get('ticket_closed')?.inApp, true)
  // No rows at all → untouched event keeps channel defaults.
  assert.equal(byType.get('rework')?.inApp, true)
  assert.equal(byType.get('rework')?.email, true)
  assert.equal(byType.get('rework')?.teams, false)
})

test('buildUserSettings leaves other users untouched (client-wise, never global)', () => {
  const rows: NotificationPreferenceRow[] = [
    { clientId: 'client-a', channel: 'email', eventType: 'ticket_assigned', enabled: false },
    { clientId: 'client-b', channel: 'email', eventType: 'ticket_closed', enabled: false },
  ]
  const byUser = new Map<string, Map<string, boolean>>()
  byUser.set('client-a', indexPreferences(rows.filter(r => r.clientId === 'client-a')))
  byUser.set('client-b', indexPreferences(rows.filter(r => r.clientId === 'client-b')))

  const a = new Map(buildUserSettings({ role: 'client', enableTeamsNotifications: false }, byUser, 'client-a').map(s => [s.eventType, s]))
  const b = new Map(buildUserSettings({ role: 'client', enableTeamsNotifications: false }, byUser, 'client-b').map(s => [s.eventType, s]))

  // Client A disabled email for ticket_assigned; Client B kept the default ON.
  assert.equal(a.get('ticket_assigned')?.email, false)
  assert.equal(b.get('ticket_assigned')?.email, true)
  // Client B disabled email for ticket_closed; Client A kept the default ON.
  assert.equal(b.get('ticket_closed')?.email, false)
  assert.equal(a.get('ticket_closed')?.email, true)
})

// ─── Email preference enforcement is independent of Teams / In-App ─────────
// "Email OFF, Teams ON, In-App ON" must mean exactly that: Email suppressed,
// Teams and In-App unaffected. Each channel is looked up under its own
// `${channel}:${event}` key, so an explicit row for one channel can never
// leak into another.

test('Email OFF does not affect Teams or In-App for the same event', () => {
  const client = { role: 'client', enableTeamsNotifications: true }
  const rows = indexPreferences([
    { clientId: 'c1', channel: 'email', eventType: 'client_review', enabled: false },
    { clientId: 'c1', channel: 'teams', eventType: 'client_review', enabled: true },
    { clientId: 'c1', channel: 'in_app', eventType: 'client_review', enabled: true },
  ])
  assert.equal(isNotificationEnabled(rows, 'email', 'client_review', client), false, 'Email must be OFF')
  assert.equal(isNotificationEnabled(rows, 'teams', 'client_review', client), true, 'Teams must remain allowed')
  assert.equal(isNotificationEnabled(rows, 'in_app', 'client_review', client), true, 'In-App must remain allowed')
})

test('Email ON sends regardless of Teams/In-App being disabled', () => {
  const client = { role: 'client', enableTeamsNotifications: false }
  const rows = indexPreferences([
    { clientId: 'c1', channel: 'teams', eventType: 'ticket_closed', enabled: false },
    { clientId: 'c1', channel: 'in_app', eventType: 'ticket_closed', enabled: false },
  ])
  assert.equal(isNotificationEnabled(rows, 'email', 'ticket_closed', client), true, 'Email defaults ON and is untouched by other channels')
  assert.equal(isNotificationEnabled(rows, 'teams', 'ticket_closed', client), false)
  assert.equal(isNotificationEnabled(rows, 'in_app', 'ticket_closed', client), false)
})

// ─── Per-event Email ON/OFF — the events explicitly named in the audit ─────

test('Email ON/OFF is enforced independently for every audited workflow event', () => {
  const client = { role: 'client' }
  for (const eventType of ['ticket_assigned', 'manager_review', 'client_review', 'rework', 'request_for_revision', 'ticket_closed']) {
    const onRows = indexPreferences([{ clientId: 'c1', channel: 'email', eventType, enabled: true }])
    const offRows = indexPreferences([{ clientId: 'c1', channel: 'email', eventType, enabled: false }])
    assert.equal(isNotificationEnabled(onRows, 'email', eventType, client), true, `${eventType}: Email ON must send`)
    assert.equal(isNotificationEnabled(offRows, 'email', eventType, client), false, `${eventType}: Email OFF must not send`)
  }
})

// ─── Manager Rework vs Client Requested Revision — distinguishable events ──

test('Manager Rework and Client Requested Revision are separately toggleable preferences', () => {
  // Disabling "Rework requested" must not silently disable "Revision requested".
  const rows = indexPreferences([{ clientId: 'c1', channel: 'email', eventType: 'rework', enabled: false }])
  const staff = { role: 'project_manager' }
  assert.equal(isNotificationEnabled(rows, 'email', 'rework', staff), false)
  assert.equal(isNotificationEnabled(rows, 'email', 'request_for_revision', staff), true)
  assert.equal(isNotificationEnabled(rows, 'email', 'revision_requested', staff), true) // alias resolves to request_for_revision
})
