// Admin → Email Management page — access, wiring and safety regression suite.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const PAGE = read('app/dashboard/admin/email/page.tsx')
const CLIENT = read('app/dashboard/admin/email/email-management-client.tsx')
const ACTIONS = read('app/actions/email-admin.ts')
const SIDEBAR = read('components/dashboard/sidebar.tsx')
const TEAMS_PAGE = read('app/dashboard/admin/teams/page.tsx')
const TEMPLATES = read('app/dashboard/admin/email/email-templates-section.tsx')

test('page is admin-only (same gate as Admin → Microsoft Teams)', () => {
  assert.match(PAGE, /if \(user\.role !== 'admin'\) redirect\('\/dashboard'\)/)
  assert.match(TEAMS_PAGE, /if \(user\.role !== 'admin'\) redirect\('\/dashboard'\)/)
})

test('page header uses the required title and description', () => {
  assert.match(PAGE, /title="Email Management"/)
  assert.match(PAGE, /subtitle="Manage email delivery, sender configuration, templates, notifications and email activity\."/)
})

test('Email Management appears in the ADMIN sidebar right after Microsoft Teams', () => {
  const teams = SIDEBAR.indexOf("{ href: '/dashboard/admin/teams', label: 'Microsoft Teams'")
  const email = SIDEBAR.indexOf("{ href: '/dashboard/admin/email', label: 'Email Management'")
  assert.ok(teams !== -1 && email > teams, 'nav item must exist after Microsoft Teams')
})

test('server actions proxy the admin-only backend routes and forward the session cookie', () => {
  assert.match(ACTIONS, /'\/api\/email-admin'/)
  assert.match(ACTIONS, /Cookie: cookie/)
  assert.doesNotMatch(ACTIONS, /CLIENT_SECRET|clientSecret|access_token|DATABASE_URL/)
})

test('no fake statistics: KPI values come from the overview response, bounced is shown as N/A when unsupported', () => {
  assert.match(CLIENT, /value=\{ov\.total\}/)
  assert.match(CLIENT, /value=\{ov\.delivered\}/)
  assert.match(CLIENT, /value=\{ov\.bounced \?\? 'N\/A'\}/)
})

test('large lists scroll internally (Ticket List / Teams pattern) and the template preview is sandboxed', () => {
  assert.match(CLIENT, /const SCROLL_BOX = 'max-h-\[420px\] overflow-y-auto overscroll-contain'/)
  // Template previews (effective + draft) render in a sandboxed iframe (no scripts).
  assert.match(TEMPLATES, /<iframe title="Email template preview" sandbox="" srcDoc=\{html\}/)
})

test('Change Sender Email saves via Save & Verify (backend verifies with Microsoft Graph before activating)', () => {
  assert.match(CLIENT, /saveAndVerifyEmailSender\(email, formName\.trim\(\)\)/)
  assert.match(CLIENT, /Save &amp; Verify/)
})

// ─── Edit Email Template ────────────────────────────────────────────────────

test('templates section: status badges, Preview / Edit for every template, Reset only when customized', () => {
  assert.match(CLIENT, /<EmailTemplatesSection initial=\{initial\.templates\} onTemplatesChange=\{setTemplates\} \/>/)
  assert.match(TEMPLATES, />Customized</)
  assert.match(TEMPLATES, />Using Default</)
  assert.match(TEMPLATES, /onClick=\{\(\) => openPreview\(t\.eventType\)\}/)
  assert.match(TEMPLATES, /onClick=\{\(\) => openEditor\(t\.eventType\)\}/)
  assert.match(TEMPLATES, /\{t\.status !== 'default' && \(/, 'Reset to Default only shown for customized templates')
})

test('Reset to Default asks for confirmation before deleting the override', () => {
  const fn = TEMPLATES.slice(TEMPLATES.indexOf('async function handleReset'), TEMPLATES.indexOf('const limits = editor?.limits'))
  assert.ok(fn.indexOf('window.confirm(') !== -1 && fn.indexOf('window.confirm(') < fn.indexOf('resetEmailTemplate('))
})

test('editor has name, subject, HTML body, plain-text body, variables, preview, save and cancel', () => {
  for (const label of ['Template Name', 'Subject', 'HTML Body', 'Plain Text Body', 'Available Variables', 'Save Changes', 'Cancel', 'Preview']) {
    assert.ok(TEMPLATES.includes(label), `missing "${label}"`)
  }
  // Variables come from the backend (derived from the real template) — never a hardcoded list.
  assert.match(TEMPLATES, /\{editor\.variables\.map\(\(v\) => \(/)
  // Backend validation messages are shown, not swallowed.
  assert.match(TEMPLATES, /setErrors\(res\.errors\?\.length \? res\.errors : \[/)
})

test('template actions go through the admin-only email-admin backend routes', () => {
  assert.match(ACTIONS, /export const saveEmailTemplate = /)
  assert.match(ACTIONS, /method: 'PUT', body: JSON\.stringify\(template\)/)
  assert.match(ACTIONS, /export const resetEmailTemplate = /)
  assert.match(ACTIONS, /\{ method: 'DELETE' \}/)
  assert.match(ACTIONS, /export const previewEmailTemplateDraft = /)
})