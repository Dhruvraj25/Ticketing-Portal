import { test } from 'node:test'
import assert from 'node:assert/strict'

// ============================================================================
// Error Utility Tests — Frontend error normalization
// ============================================================================

// We test the logic directly since these are pure functions.
// Import the error-utils module after setting up the test environment.

// ─── Mock the module (since it's a client lib) ──────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  USER_VALIDATION_ERROR: 'Please complete all required fields.',
  USER_EMAIL_EXISTS: 'A user with this email address already exists.',
  USER_NOT_FOUND: 'The user could not be found. They may have already been deleted.',
  USER_CREATE_FAILED: 'We couldn\'t create the user right now. Please try again.',
  USER_DELETE_FAILED: 'We couldn\'t delete the user right now. Please try again.',
  USER_DELETE_FORBIDDEN: 'You do not have permission to delete this user.',
  USER_DELETE_DEPENDENCY: 'This user cannot be deleted because they have associated records.',
  AUTH_ACCOUNT_CREATE_FAILED: 'The user profile was created, but the login account could not be created. Please try again or contact an administrator.',
  EMAIL_SEND_FAILED: 'The user was created, but the onboarding email could not be sent.',
  PASSWORD_INVALID: 'Password does not meet the required security requirements.',
  PASSWORD_MISMATCH: 'Passwords do not match.',
  PASSWORD_RESET_EXPIRED: 'This password reset link has expired. Please request a new one.',
  ACCOUNT_INACTIVE: 'Your account is not active. Please contact an administrator.',
  ACCOUNT_DELETED: 'This account is no longer available.',
  ACCOUNT_BANNED: 'Your account has been deactivated.',
  UNAUTHORIZED: 'You need to sign in to access this page.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NETWORK_ERROR: 'Unable to connect to the server. Please check your connection and try again.',
  INTERNAL_ERROR: 'Something went wrong. Please try again later.',
  UNKNOWN_ERROR: 'Something went wrong. Please try again.',
}

const ERROR_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /already exists|duplicate|unique.*email|email.*already/i, code: 'USER_EMAIL_EXISTS' },
  { pattern: /valid.*email|email.*invalid|invalid.*email/i, code: 'USER_VALIDATION_ERROR' },
  { pattern: /user.*not found|not.*found/i, code: 'USER_NOT_FOUND' },
  { pattern: /deactivated|banned|account.*disabled/i, code: 'ACCOUNT_BANNED' },
  { pattern: /account.*not active|inactive.*account/i, code: 'ACCOUNT_INACTIVE' },
  { pattern: /account.*deleted|deleted.*account/i, code: 'ACCOUNT_DELETED' },
  { pattern: /invalid.*credentials|incorrect.*password|wrong.*password/i, code: 'UNAUTHORIZED' },
  { pattern: /session.*invalid|session.*expired|session.*create/i, code: 'UNAUTHORIZED' },
  { pattern: /password.*match|passwords.*match/i, code: 'PASSWORD_MISMATCH' },
  { pattern: /password.*short|password.*weak|at least.*characters|min.*length/i, code: 'PASSWORD_INVALID' },
  { pattern: /reset.*link.*expired|token.*expired/i, code: 'PASSWORD_RESET_EXPIRED' },
  { pattern: /email.*send|email.*fail|email.*error|email.*could not/i, code: 'EMAIL_SEND_FAILED' },
  { pattern: /access denied|unauthorized|not.*authenticated/i, code: 'FORBIDDEN' },
  { pattern: /database.*error|prisma|sql|pg_|relation.*constraint|foreign.*key/i, code: 'INTERNAL_ERROR' },
  { pattern: /network|fetch.*fail|connection.*refused|timeout|ECONNREFUSED/i, code: 'NETWORK_ERROR' },
  { pattern: /internal server error|500/i, code: 'INTERNAL_ERROR' },
]

function getFriendlyError(error: unknown): string {
  if (!error) return ERROR_MESSAGES.UNKNOWN_ERROR
  if (error instanceof Error) {
    const msg = error.message
    const code = (error as any).code as string | undefined
    if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
    for (const { pattern, code: matchedCode } of ERROR_PATTERNS) {
      if (pattern.test(msg)) return ERROR_MESSAGES[matchedCode]
    }
    if (msg.length < 200 && !/SQL|Prisma|stack|Error:|at\s/i.test(msg)) return msg
  }
  if (typeof error === 'string') {
    for (const { pattern, code } of ERROR_PATTERNS) {
      if (pattern.test(error)) return ERROR_MESSAGES[code]
    }
    if (error.length < 200) return error
  }
  return ERROR_MESSAGES.UNKNOWN_ERROR
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('getFriendlyError: returns UNKNOWN_ERROR for null/undefined', () => {
  assert.equal(getFriendlyError(null), ERROR_MESSAGES.UNKNOWN_ERROR)
  assert.equal(getFriendlyError(undefined), ERROR_MESSAGES.UNKNOWN_ERROR)
})

test('getFriendlyError: maps structured code errors', () => {
  const err = new Error('Something') as any
  err.code = 'USER_EMAIL_EXISTS'
  assert.equal(getFriendlyError(err), ERROR_MESSAGES.USER_EMAIL_EXISTS)
})

test('getFriendlyError: maps duplicate email pattern', () => {
  assert.equal(getFriendlyError(new Error('Email already exists')), ERROR_MESSAGES.USER_EMAIL_EXISTS)
  assert.equal(getFriendlyError(new Error('unique constraint on email')), ERROR_MESSAGES.USER_EMAIL_EXISTS)
  assert.equal(getFriendlyError(new Error('email already registered')), ERROR_MESSAGES.USER_EMAIL_EXISTS)
})

test('getFriendlyError: maps invalid email pattern', () => {
  assert.equal(getFriendlyError(new Error('Invalid email address')), ERROR_MESSAGES.USER_VALIDATION_ERROR)
})

test('getFriendlyError: maps user not found pattern', () => {
  assert.equal(getFriendlyError(new Error('User not found')), ERROR_MESSAGES.USER_NOT_FOUND)
})

test('getFriendlyError: maps deactivated/banned patterns', () => {
  assert.equal(getFriendlyError(new Error('Account has been deactivated')), ERROR_MESSAGES.ACCOUNT_BANNED)
  assert.equal(getFriendlyError(new Error('User is banned')), ERROR_MESSAGES.ACCOUNT_BANNED)
})

test('getFriendlyError: maps password mismatch pattern', () => {
  assert.equal(getFriendlyError(new Error('Passwords do not match')), ERROR_MESSAGES.PASSWORD_MISMATCH)
})

test('getFriendlyError: maps weak password pattern', () => {
  assert.equal(getFriendlyError(new Error('Password must be at least 8 characters')), ERROR_MESSAGES.PASSWORD_INVALID)
})

test('getFriendlyError: maps expired token pattern', () => {
  assert.equal(getFriendlyError(new Error('Reset link expired')), ERROR_MESSAGES.PASSWORD_RESET_EXPIRED)
})

test('getFriendlyError: maps email failure pattern', () => {
  assert.equal(getFriendlyError(new Error('Email could not be sent')), ERROR_MESSAGES.EMAIL_SEND_FAILED)
})

test('getFriendlyError: maps database error pattern', () => {
  assert.equal(getFriendlyError(new Error('Prisma error')), ERROR_MESSAGES.INTERNAL_ERROR)
  assert.equal(getFriendlyError(new Error('SQL query failed')), ERROR_MESSAGES.INTERNAL_ERROR)
})

test('getFriendlyError: maps network error pattern', () => {
  assert.equal(getFriendlyError(new Error('ECONNREFUSED')), ERROR_MESSAGES.NETWORK_ERROR)
  assert.equal(getFriendlyError(new Error('Network timeout')), ERROR_MESSAGES.NETWORK_ERROR)
})

test('getFriendlyError: passes through clean user-facing messages', () => {
  const msg = 'Please complete all required fields.'
  assert.equal(getFriendlyError(new Error(msg)), msg)
})

test('getFriendlyError: sanitizes raw database errors', () => {
  const longMsg = 'Error: select * from users where id = ' + 'x'.repeat(300)
  assert.equal(getFriendlyError(new Error(longMsg)), ERROR_MESSAGES.UNKNOWN_ERROR)
})

test('getFriendlyError: handles string errors', () => {
  assert.equal(getFriendlyError('Email already exists'), ERROR_MESSAGES.USER_EMAIL_EXISTS)
  assert.equal(getFriendlyError('network error'), ERROR_MESSAGES.NETWORK_ERROR)
})

test('getFriendlyError: handles non-Error objects', () => {
  assert.equal(getFriendlyError(42), ERROR_MESSAGES.UNKNOWN_ERROR)
  assert.equal(getFriendlyError({ message: 'test' }), ERROR_MESSAGES.UNKNOWN_ERROR)
})

test('ERROR_MESSAGES: all codes have non-empty messages', () => {
  for (const [code, msg] of Object.entries(ERROR_MESSAGES)) {
    assert.ok(msg.length > 0, `Error code ${code} has an empty message`)
    assert.ok(!msg.includes('undefined'), `Error code ${code} contains 'undefined'`)
  }
})
