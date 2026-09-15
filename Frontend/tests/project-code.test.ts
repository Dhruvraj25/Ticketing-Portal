import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveProjectCodeBase,
  nextProjectCodeCandidate,
  isProjectCodeUniqueViolation,
  withUniqueProjectCode,
  PROJECT_CODE_UNIQUE_CONSTRAINT,
  MAX_PROJECT_CODE_ATTEMPTS,
} from '../lib/project-code.ts'

// ============================================================================
// Phase 5 Part B — Project Key generation safety: pure unit tests.
// ============================================================================

// ─── deriveProjectCodeBase ──────────────────────────────────────────────────

test('deriveProjectCodeBase: "Website Development" -> "WEBDEV" (spec example)', () => {
  assert.equal(deriveProjectCodeBase('Website Development'), 'WEBDEV')
})

test('deriveProjectCodeBase: takes only the first 2 significant words', () => {
  assert.equal(deriveProjectCodeBase('Customer Relationship Management Portal'), 'CUSREL')
})

test('deriveProjectCodeBase: single-word name uses its first 6 letters', () => {
  assert.equal(deriveProjectCodeBase('Acme'), 'ACME')
  assert.equal(deriveProjectCodeBase('Supercalifragilistic'), 'SUPERC')
})

test('deriveProjectCodeBase: strips non-letter characters from each word', () => {
  assert.equal(deriveProjectCodeBase('Inventory & Warehouse'), 'INVWAR')
})

test('deriveProjectCodeBase: falls back to "PRJ" when the name has no letters', () => {
  assert.equal(deriveProjectCodeBase('123 456'), 'PRJ')
  assert.equal(deriveProjectCodeBase(''), 'PRJ')
})

test('deriveProjectCodeBase: is deterministic (same name -> same base, no timestamp/randomness)', () => {
  assert.equal(deriveProjectCodeBase('Website Development'), deriveProjectCodeBase('Website Development'))
})

// ─── nextProjectCodeCandidate ───────────────────────────────────────────────

test('nextProjectCodeCandidate: attempt 0 is the bare base, no suffix (spec example: first "Website Development" project is just "WEBDEV")', () => {
  assert.equal(nextProjectCodeCandidate('WEBDEV', 0), 'WEBDEV')
})

test('nextProjectCodeCandidate: subsequent attempts are -2, -3, ... (spec example)', () => {
  assert.equal(nextProjectCodeCandidate('WEBDEV', 1), 'WEBDEV-2')
  assert.equal(nextProjectCodeCandidate('WEBDEV', 2), 'WEBDEV-3')
  assert.equal(nextProjectCodeCandidate('WEBDEV', 3), 'WEBDEV-4')
})

test('nextProjectCodeCandidate: never produces the same candidate for two different attempts of the same base', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 10; i++) {
    const candidate = nextProjectCodeCandidate('WEBDEV', i)
    assert.ok(!seen.has(candidate), `duplicate candidate at attempt ${i}: ${candidate}`)
    seen.add(candidate)
  }
})

// ─── isProjectCodeUniqueViolation ───────────────────────────────────────────

test('isProjectCodeUniqueViolation: true for a 23505 on the project_projectCode_unique constraint', () => {
  assert.equal(isProjectCodeUniqueViolation({ code: '23505', constraint: PROJECT_CODE_UNIQUE_CONSTRAINT }), true)
})

test('isProjectCodeUniqueViolation: true for a 23505 whose detail mentions projectCode (constraint name missing)', () => {
  assert.equal(isProjectCodeUniqueViolation({ code: '23505', detail: 'Key (projectCode)=(WEBDEV) already exists.' }), true)
})

test('isProjectCodeUniqueViolation: false for a 23505 on an UNRELATED unique constraint (must not retry-loop on it)', () => {
  assert.equal(isProjectCodeUniqueViolation({ code: '23505', constraint: 'user_email_unique', detail: 'Key (email)=(a@b.com) already exists.' }), false)
})

test('isProjectCodeUniqueViolation: false for a non-unique-violation error code', () => {
  assert.equal(isProjectCodeUniqueViolation({ code: '23503', constraint: PROJECT_CODE_UNIQUE_CONSTRAINT }), false)
})

test('isProjectCodeUniqueViolation: false for a plain JS Error with no Postgres error nested inside', () => {
  assert.equal(isProjectCodeUniqueViolation(new Error('Access denied')), false)
})

test('isProjectCodeUniqueViolation: unwraps a nested Drizzle-wrapped error (err.cause.code)', () => {
  const wrapped = { message: 'Failed query', cause: { code: '23505', constraint: PROJECT_CODE_UNIQUE_CONSTRAINT } }
  assert.equal(isProjectCodeUniqueViolation(wrapped), true)
})

// ─── withUniqueProjectCode ──────────────────────────────────────────────────

function pgUniqueViolation(constraint = PROJECT_CODE_UNIQUE_CONSTRAINT) {
  return Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505', constraint })
}

test('withUniqueProjectCode: succeeds immediately when the first candidate is free', async () => {
  const attempts: string[] = []
  const result = await withUniqueProjectCode('WEBDEV', async (candidate) => {
    attempts.push(candidate)
    return { projectCode: candidate }
  })
  assert.deepEqual(attempts, ['WEBDEV'])
  assert.equal(result.projectCode, 'WEBDEV')
})

test('withUniqueProjectCode: retries with the next candidate on a projectCode collision (simulates duplicate project name)', async () => {
  const attempts: string[] = []
  const result = await withUniqueProjectCode('WEBDEV', async (candidate) => {
    attempts.push(candidate)
    if (candidate === 'WEBDEV') throw pgUniqueViolation()
    return { projectCode: candidate }
  })
  assert.deepEqual(attempts, ['WEBDEV', 'WEBDEV-2'])
  assert.equal(result.projectCode, 'WEBDEV-2')
})

test('withUniqueProjectCode: keeps retrying through multiple collisions, never reusing an earlier candidate (simulates a burst of concurrent creates)', async () => {
  const attempts: string[] = []
  const result = await withUniqueProjectCode('WEBDEV', async (candidate) => {
    attempts.push(candidate)
    if (attempts.length < 3) throw pgUniqueViolation()
    return { projectCode: candidate }
  })
  assert.deepEqual(attempts, ['WEBDEV', 'WEBDEV-2', 'WEBDEV-3'])
  assert.equal(result.projectCode, 'WEBDEV-3')
  assert.equal(new Set(attempts).size, attempts.length, 'no candidate was ever reused')
})

test('withUniqueProjectCode: a non-projectCode error propagates immediately, without retrying', async () => {
  let calls = 0
  await assert.rejects(
    withUniqueProjectCode('WEBDEV', async () => {
      calls++
      throw new Error('Only project managers and admins can create projects')
    }),
    /Only project managers and admins/,
  )
  assert.equal(calls, 1, 'must not retry a non-collision error')
})

test('withUniqueProjectCode: an unrelated unique-violation (e.g. duplicate email) propagates immediately, without retrying', async () => {
  let calls = 0
  await assert.rejects(
    withUniqueProjectCode('WEBDEV', async () => {
      calls++
      throw pgUniqueViolation('user_email_unique')
    }),
  )
  assert.equal(calls, 1)
})

test('withUniqueProjectCode: exhausts MAX_PROJECT_CODE_ATTEMPTS and then propagates the last collision error (never loops forever)', async () => {
  let calls = 0
  await assert.rejects(
    withUniqueProjectCode('WEBDEV', async () => {
      calls++
      throw pgUniqueViolation()
    }),
  )
  assert.equal(calls, MAX_PROJECT_CODE_ATTEMPTS)
})
