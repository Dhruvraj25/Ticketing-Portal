// ────────────────────────────────────────────────────────────────────────────
// project-code — pure, DB-free Project Key generation logic (Phase 5 Part B).
//
// Kept separate from app/actions/projects/crud.ts and app/actions/onboarding.ts
// (both 'use server' modules, not importable under plain node:test) so the
// abbreviation/candidate/error-detection rules can be unit-tested directly.
// Both call sites derive a base once, then retry candidates against the
// existing project.projectCode UNIQUE constraint (project_projectCode_unique)
// on conflict — the database constraint is what actually guarantees safety
// under concurrent creation; this module never pre-checks for existence,
// it only reacts to a real unique-violation and proposes the next candidate.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Derives the base Project Key from a project name, e.g. "Website Development"
 * -> "WEBDEV" (first 3 letters of each of up to the first 2 significant
 * words), matching the spec's literal example. A single-word name uses its
 * first 6 letters instead ("Acme" -> "ACME"). Falls back to "PRJ" when the
 * name yields no letters at all (e.g. all-numeric or all-symbol input).
 */
export function deriveProjectCodeBase(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z]/g, ''))
    .filter((w) => w.length > 0)

  let base: string
  if (words.length >= 2) {
    base = words.slice(0, 2).map((w) => w.slice(0, 3)).join('')
  } else if (words.length === 1) {
    base = words[0].slice(0, 6)
  } else {
    base = ''
  }

  base = base.toUpperCase()
  return base || 'PRJ'
}

/**
 * The Nth candidate Project Key for a given base. Attempt 0 is the bare base
 * (spec example: the first "Website Development" project is just "WEBDEV",
 * no "-1"); attempt 1 is "-2", attempt 2 is "-3", etc. — never silently
 * reuses a lower attempt's candidate.
 */
export function nextProjectCodeCandidate(base: string, attempt: number): string {
  return attempt <= 0 ? base : `${base}-${attempt + 1}`
}

/** The Postgres unique-constraint name backing project.projectCode (see migrations/0000, CONSTRAINT project_projectCode_unique). */
export const PROJECT_CODE_UNIQUE_CONSTRAINT = 'project_projectCode_unique'

/**
 * Recursively dig into nested Drizzle/pg error wrappers to find the actual
 * PostgreSQL error object with its native properties (code, constraint,
 * detail, ...). Mirrors app/actions/onboarding.ts's existing extractPgError —
 * kept here too so callers that don't already have that helper in scope
 * (e.g. crud.ts) can reuse the exact same unwrapping logic.
 */
export function extractPgError(err: unknown, depth = 0): Record<string, unknown> | null {
  if (!err || typeof err !== 'object' || depth > 5) return null
  const e = err as Record<string, unknown>
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) {
    return e
  }
  for (const key of ['cause', 'wrapperError', 'originalError', 'innerError', 'prev', 'error', 'sourceError'] as const) {
    if (e[key] !== undefined && e[key] !== null) {
      const found = extractPgError(e[key], depth + 1)
      if (found) return found
    }
  }
  return null
}

/**
 * True when `err` is specifically a Postgres unique-violation (SQLSTATE
 * 23505) on the project.projectCode constraint — never on some other
 * unrelated unique constraint, which must propagate untouched instead of
 * being silently retried.
 */
export function isProjectCodeUniqueViolation(err: unknown): boolean {
  const pgError = extractPgError(err)
  if (!pgError || pgError.code !== '23505') return false
  const constraint = String(pgError.constraint || '')
  if (constraint === PROJECT_CODE_UNIQUE_CONSTRAINT) return true
  const detail = String(pgError.detail || '')
  const message = String(pgError.message || '')
  return detail.includes('projectCode') || message.includes('projectCode') || message.includes(PROJECT_CODE_UNIQUE_CONSTRAINT)
}

export const MAX_PROJECT_CODE_ATTEMPTS = 5

/**
 * Runs `attempt(candidate)` with successive Project Key candidates for
 * `base`, retrying only on a projectCode unique-violation (never on any
 * other error, which propagates immediately). Throws the last projectCode
 * violation after MAX_PROJECT_CODE_ATTEMPTS is exhausted (the caller's
 * existing Postgres-error-to-user-message mapping already turns a raw 23505
 * into a friendly "already exists" message — no need to shadow that here).
 */
export async function withUniqueProjectCode<T>(
  base: string,
  attempt: (candidate: string) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < MAX_PROJECT_CODE_ATTEMPTS; i++) {
    const candidate = nextProjectCodeCandidate(base, i)
    try {
      return await attempt(candidate)
    } catch (err) {
      // Only a projectCode collision on a non-final attempt is retryable —
      // any other error, or exhausting the last attempt, propagates
      // immediately (the caller's existing Postgres-error-to-user-message
      // mapping already turns a raw 23505 into a friendly "already exists").
      if (isProjectCodeUniqueViolation(err) && i < MAX_PROJECT_CODE_ATTEMPTS - 1) continue
      throw err
    }
  }
  // Unreachable: the loop above always either returns or throws.
  throw new Error('Could not generate a unique project key')
}
