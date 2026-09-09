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

// ============================================================================
// THE ACTUAL root cause (this escalation) — session cookie was never forwarded
// ============================================================================
// Every /api/teams/* Backend route is gated by requireAuth, which validates
// the session via auth.api.getSession({ headers: req.headers }) — Better
// Auth reads the session token from the request's Cookie header. Confirmed
// directly against a real running local backend:
//   curl http://localhost:4000/api/teams/status            → 401 (no cookie)
//   curl .../status -H "Cookie: session=garbage"            → 401 (invalid
//     session — but the NEW [Auth] log line now correctly shows hasCookie=true
//     here vs hasCookie=false for the first case, proving the two failure
//     modes are now distinguishable)
// app/actions/teams.ts's fetchFromBackend() never included a 'Cookie' header
// at all — unlike lib/email-backend.ts's sendNotification(), which already
// forwards it correctly. This alone fully explains all three reported
// symptoms (queue stats always zero, "Delivery failed"/"Webhook Error", and
// is a strong contributor to the generic Server Components crash) —
// independent of, and in addition to, the URL-resolution bug fixed earlier.

test('app/actions/teams.ts forwards the real session cookie on every backend call (both fetchFromBackend and fetchFromBackendSafe)', () => {
  assert.match(TEAMS_ACTIONS_SRC, /import \{ headers \} from 'next\/headers'/)
  assert.match(TEAMS_ACTIONS_SRC, /async function getSessionCookie\(\): Promise<string>/)
  // Both the throwing helper (used by the 4 read-only status calls) and the
  // non-throwing "safe" helper (used by the interactive test-send) must
  // forward the cookie — this was previously present in NEITHER.
  const fetchFromBackendFn = TEAMS_ACTIONS_SRC.slice(
    TEAMS_ACTIONS_SRC.indexOf('async function fetchFromBackend('),
    TEAMS_ACTIONS_SRC.indexOf('async function fetchFromBackendSafe'),
  )
  const fetchFromBackendSafeFn = TEAMS_ACTIONS_SRC.slice(
    TEAMS_ACTIONS_SRC.indexOf('async function fetchFromBackendSafe'),
    TEAMS_ACTIONS_SRC.indexOf('export const getTeamsStatus'),
  )
  assert.match(fetchFromBackendFn, /'Cookie': cookie/)
  assert.match(fetchFromBackendSafeFn, /'Cookie': cookie/)
})

test('regression: the OLD headers object (Content-Type only, no Cookie) must never reappear', () => {
  // The specific broken shape from before this fix — guards against a
  // future edit accidentally dropping the Cookie header again.
  assert.doesNotMatch(
    TEAMS_ACTIONS_SRC,
    /headers:\s*\{\s*'Content-Type': 'application\/json',\s*\.\.\.options\?\.headers,\s*\}/,
  )
})

test('sendTeamsTestMessage returns a structured, sanitized failure (stage/code/message) instead of throwing a generic string', () => {
  const fnStart = TEAMS_ACTIONS_SRC.indexOf('export const sendTeamsTestMessage')
  const fnEnd = TEAMS_ACTIONS_SRC.indexOf('export const clearTeamsQueue')
  const fn = TEAMS_ACTIONS_SRC.slice(fnStart, fnEnd)
  assert.match(fn, /fetchFromBackendSafe</)
  assert.match(fn, /stage: result\.stage/)
  assert.match(fn, /code: result\.code/)
  assert.doesNotMatch(fn, /throw /, 'the interactive test-send must never throw — it always returns a renderable result')
})

test('fetchFromBackendSafe distinguishes network / authentication / authorization / backend failure stages, and never throws', () => {
  const fnStart = TEAMS_ACTIONS_SRC.indexOf('async function fetchFromBackendSafe')
  const fnEnd = TEAMS_ACTIONS_SRC.indexOf('export const getTeamsStatus')
  const fn = TEAMS_ACTIONS_SRC.slice(fnStart, fnEnd)
  assert.match(fn, /stage: 'network'/)
  assert.match(fn, /stage: 'authentication'/)
  assert.match(fn, /res\.status === 401/)
  assert.match(fn, /stage: 'authorization'/)
  assert.match(fn, /res\.status === 403/)
  assert.match(fn, /stage: 'backend'/)
  assert.doesNotMatch(fn, /^\s*throw /m, 'fetchFromBackendSafe must catch every failure mode and return, never throw')
})

test('no secret, cookie value, or stack trace is ever included in a message returned to the client', () => {
  const fnStart = TEAMS_ACTIONS_SRC.indexOf('async function fetchFromBackendSafe')
  const fnEnd = TEAMS_ACTIONS_SRC.indexOf('export const getTeamsStatus')
  const fn = TEAMS_ACTIONS_SRC.slice(fnStart, fnEnd)
  // Every `message:` literal in this function must be a hardcoded,
  // human-written sentence — never string-interpolate the cookie, a raw
  // error object, or a stack trace into it.
  const messageLines = [...fn.matchAll(/message:\s*(.+)/g)].map(m => m[1])
  assert.ok(messageLines.length > 0, 'expected at least one message: field to check')
  for (const line of messageLines) {
    assert.doesNotMatch(line, /\$\{cookie\}/)
    assert.doesNotMatch(line, /\.stack/)
    assert.doesNotMatch(line, /err\.message(?!\)|\s*\?)/, 'raw error.message must not be interpolated directly into a client-facing message')
  }
})
