// Admin/manager password reset signs the target account out everywhere.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sessionTokenFromCookieValue } from '../lib/session-token.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const ADMIN = read('app/actions/admin.ts')
const REVOKE = read('lib/session-revocation.ts')
const AUTH_UTILS = read('lib/auth-utils.ts')
const BACKEND_AUTH = readFileSync(join(ROOT, '..', 'Backend', 'src', 'middleware', 'auth.ts'), 'utf8')

test('session cookie value → stored session token', () => {
  assert.equal(sessionTokenFromCookieValue('abc123.SIGNATURE%2Bxyz%3D'), 'abc123')
  assert.equal(sessionTokenFromCookieValue('abc123.sig'), 'abc123')
  assert.equal(sessionTokenFromCookieValue('abc123'), 'abc123')
  assert.equal(sessionTokenFromCookieValue(''), null)
  assert.equal(sessionTokenFromCookieValue(undefined), null)
  assert.equal(sessionTokenFromCookieValue('%E0%A4%A.sig'), '%E0%A4%A', 'malformed encoding does not throw')
})

test('resetUserPassword revokes the target\'s sessions right after the password update', () => {
  const fn = ADMIN.slice(ADMIN.indexOf('export const resetUserPassword'), ADMIN.indexOf('export const toggleUserBanned'))
  const update = fn.indexOf('ctx.internalAdapter.updatePassword(userId, hashedPassword)')
  const revoke = fn.indexOf('await revokeUserSessions(userId, {')
  assert.ok(update > 0 && revoke > update, 'sessions revoked after the password changes')
  assert.ok(revoke < fn.indexOf("result: 'success'"), 'revoked before success is recorded/returned')
  assert.match(fn, /keepToken: userId === currentUser\.id \? await currentRequestSessionToken\(\) : null/)
  // Authorization still happens before anything changes.
  assert.ok(fn.indexOf("throw new Error('Access denied')") < update)
})

test('revocation deletes session rows and purges both auth caches', () => {
  assert.match(REVOKE, /\.delete\(session\)\s*\n\s*\.where\(keepToken \? and\(eq\(session\.userId, userId\), ne\(session\.token, keepToken\)\) : eq\(session\.userId, userId\)\)/)
  assert.match(REVOKE, /invalidateAuthUserCache\(userId\)/)
  assert.match(REVOKE, /revalidateTag\('auth-user', \{ expire: 0 \}\)/)
  assert.doesNotMatch(REVOKE, /console\.(log|error)\([^)]*token/i, 'tokens are never logged')
})

test('getCurrentUser never trusts a cached user whose session row is gone', () => {
  assert.match(AUTH_UTILS, /eq\(sessionTable\.token, token\), gt\(sessionTable\.expiresAt, new Date\(\)\)/)
  assert.match(AUTH_UTILS, /if \(cached && cached\.expiresAt > Date\.now\(\) && sessionActive === true\) \{/)
  assert.match(AUTH_UTILS, /if \(l2UserData && sessionActive === true\) \{/)
  assert.match(AUTH_UTILS, /if \(sessionToken && _l2CacheAvailable && sessionActive !== false\) \{/)
  // A revoked session falls through to Better Auth, which redirects to sign-in.
  assert.match(AUTH_UTILS, /if \(!session\?\.user\) \{\s*\n\s*redirect\('\/sign-in'\)/)
})

test('backend API validates the session table on every request (no cookie cache)', () => {
  assert.match(BACKEND_AUTH, /auth\.api\.getSession\(\{ headers: req\.headers/)
  assert.match(BACKEND_AUTH, /return res\.status\(401\)\.json\(\{ error: 'Unauthorized' \}\)/)
  assert.doesNotMatch(read('lib/auth.ts'), /cookieCache/)
})
