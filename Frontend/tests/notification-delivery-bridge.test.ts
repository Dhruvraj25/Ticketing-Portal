import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Notification delivery bridge — Frontend → Backend URL resolution
// ============================================================================
// Root cause (Teams admin page "Delivery failed" / "Webhook Error" / Server
// Components render crash): app/actions/teams.ts read NEXT_PUBLIC_API_URL,
// defaulting to the RELATIVE path '/api'. Called from a Next.js server
// action (Node.js, no browser document.baseURI), fetch() on a relative URL
// throws synchronously-rejected `TypeError: Failed to parse URL from
// /api/teams/...` — reproduced directly:
//   node -e "fetch('/api/teams/status').catch(e=>console.log(e.message))"
//   → "Failed to parse URL from /api/teams/status"
// NEXT_PUBLIC_API_URL is not documented or set anywhere in this project's
// env files (.env, .env.local, .env.example) — every Teams admin call was
// guaranteed to fail this way in any environment where it remained unset.
//
// Fix: consolidated onto the SAME BACKEND_URL / NEXT_PUBLIC_BACKEND_URL
// convention already used (and working) by lib/email-backend.ts, with an
// ABSOLUTE fallback URL so a misconfigured environment fails with a
// catchable network error instead of a URL-parse crash.

const ROOT = join(import.meta.dirname, '..')
const TEAMS_ACTIONS_SRC = readFileSync(join(ROOT, 'app', 'actions', 'teams.ts'), 'utf8')
const EMAIL_BACKEND_SRC = readFileSync(join(ROOT, 'lib', 'email-backend.ts'), 'utf8')

test('app/actions/teams.ts no longer uses NEXT_PUBLIC_API_URL or a bare relative "/api" fallback', () => {
  assert.doesNotMatch(TEAMS_ACTIONS_SRC, /process\.env\.NEXT_PUBLIC_API_URL/, 'the broken, undocumented env var must no longer be READ in code (mentioning it in an explanatory comment is fine)')
  assert.doesNotMatch(TEAMS_ACTIONS_SRC, /\|\|\s*'\/api'/, 'a bare relative path must never be the fallback for a server-side fetch()')
})

test('app/actions/teams.ts resolves the backend origin via the SAME BACKEND_URL/NEXT_PUBLIC_BACKEND_URL convention as the working email bridge', () => {
  assert.match(
    TEAMS_ACTIONS_SRC,
    /const API_BASE = \(process\.env\.BACKEND_URL \|\| process\.env\.NEXT_PUBLIC_BACKEND_URL \|\| 'http:\/\/localhost:4000'\) \+ '\/api'/,
  )
})

test('the resolved API_BASE is always an absolute URL — never throws "Failed to parse URL" even when unset', () => {
  // Reproduce exactly what the module does when neither env var is set.
  const original = { BACKEND_URL: process.env.BACKEND_URL, NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL }
  delete process.env.BACKEND_URL
  delete process.env.NEXT_PUBLIC_BACKEND_URL
  try {
    const apiBase = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000') + '/api'
    assert.doesNotThrow(() => new URL(apiBase + '/teams/status'), 'must always be a parseable absolute URL')
  } finally {
    if (original.BACKEND_URL !== undefined) process.env.BACKEND_URL = original.BACKEND_URL
    if (original.NEXT_PUBLIC_BACKEND_URL !== undefined) process.env.NEXT_PUBLIC_BACKEND_URL = original.NEXT_PUBLIC_BACKEND_URL
  }
})

test('regression: a bare relative path passed to fetch() in a server (non-browser) context throws — proves why the old default was broken', async () => {
  await assert.rejects(
    () => fetch('/api/teams/status'),
    /Failed to parse URL from \/api\/teams\/status/,
  )
})

test('lib/email-backend.ts still resolves BACKEND_URL the same way (untouched contract) and now warns loudly if unset in production', () => {
  assert.match(EMAIL_BACKEND_SRC, /const BACKEND_URL = process\.env\.BACKEND_URL \|\| process\.env\.NEXT_PUBLIC_BACKEND_URL \|\| 'http:\/\/localhost:4000'/)
  assert.match(EMAIL_BACKEND_SRC, /process\.env\.NODE_ENV === 'production' && !process\.env\.BACKEND_URL && !process\.env\.NEXT_PUBLIC_BACKEND_URL/)
  assert.match(EMAIL_BACKEND_SRC, /EVERY email\/Teams notification will silently fail/)
})

test('sendNotification() still never throws to its caller — the fire-and-forget contract is preserved', () => {
  const fnStart = EMAIL_BACKEND_SRC.indexOf('export async function sendNotification')
  const fnEnd = EMAIL_BACKEND_SRC.indexOf('export async function sendNotificationToUser')
  const fn = EMAIL_BACKEND_SRC.slice(fnStart, fnEnd)
  assert.match(fn, /try \{/)
  assert.match(fn, /catch \(err\) \{/)
  assert.doesNotMatch(fn, /throw /, 'must never throw to the caller — every ticket action must stay non-blocking')
})
