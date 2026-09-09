import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// [AuthConfig] startup logging (Frontend side) — matches Backend/src/server.ts
// ============================================================================
// Compare this file's log line against Backend's [AuthConfig] line in each
// service's own production logs: identical secretHashPrefix + identical
// secretLength means Vercel and Railway sign/verify Better Auth session
// cookies with the same BETTER_AUTH_SECRET, which is required for a session
// issued by one to validate on the other.

const SRC = readFileSync(join(import.meta.dirname, '..', 'lib', 'auth.ts'), 'utf8')

test('lib/auth.ts logs the same [AuthConfig] shape as the backend, never the secret itself', () => {
  assert.match(SRC, /console\.log\(\s*`\[AuthConfig\] secretConfigured=true secretLength=\$\{process\.env\.BETTER_AUTH_SECRET\.length\} `/)
  assert.match(SRC, /secretHashPrefix=\$\{createHash\('sha256'\)\.update\(process\.env\.BETTER_AUTH_SECRET\)\.digest\('hex'\)\.slice\(0, 12\)\}/)
  assert.doesNotMatch(SRC, /console\.log\([^)]*\$\{process\.env\.BETTER_AUTH_SECRET\}(?!\.length)/, 'must never interpolate the raw secret into a log line')
})

test('the [AuthConfig] log runs only after the existing eager BETTER_AUTH_SECRET presence check', () => {
  const checkIdx = SRC.indexOf('Missing BETTER_AUTH_SECRET environment variable')
  const logIdx = SRC.indexOf('[AuthConfig] secretConfigured=true')
  assert.ok(checkIdx !== -1 && logIdx !== -1 && checkIdx < logIdx)
})
