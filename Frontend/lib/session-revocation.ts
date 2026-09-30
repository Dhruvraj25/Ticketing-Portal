// ============================================================================
// Session revocation — force an account to sign in again
// ============================================================================
// Used when an administrator (or a project manager) sets another account's
// password: every existing session of that account is deleted from the
// session table, so the old session cookie no longer authenticates anywhere:
//   - Frontend: getCurrentUser() re-checks the session row even on an auth
//     cache hit (lib/auth-utils.ts), and the caches are purged here as well;
//   - Backend API: requireAuth → auth.api.getSession() reads the session
//     table on every request (no cookie cache), so it returns 401 at once.
// ============================================================================

import { headers } from 'next/headers'
import { revalidateTag } from 'next/cache'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { session } from '@/lib/db/schema'
import { invalidateAuthUserCache } from '@/lib/auth-utils'
import { sessionTokenFromCookieValue } from '@/lib/session-token'

/** The session token of the CURRENT request (never logged or returned to clients). */
export async function currentRequestSessionToken(): Promise<string | null> {
  const cookie = (await headers()).get('cookie') || ''
  const match =
    cookie.match(/__Secure-better-auth\.session_token=([^;]+)/) ||
    cookie.match(/better-auth\.session_token=([^;]+)/)
  return sessionTokenFromCookieValue(match?.[1])
}

/**
 * Delete every session of `userId` (optionally keeping one token — used when
 * an admin resets their OWN password, so they are not signed out themselves).
 * Returns the number of sessions revoked.
 */
export async function revokeUserSessions(userId: string, options?: { keepToken?: string | null }): Promise<number> {
  const keepToken = options?.keepToken || null
  const deleted = await db
    .delete(session)
    .where(keepToken ? and(eq(session.userId, userId), ne(session.token, keepToken)) : eq(session.userId, userId))
    .returning({ id: session.id })

  // Purge cached auth lookups: this process's L1 map now, and the shared L2
  // (unstable_cache) entries expire immediately. Other processes' L1 entries
  // are rejected by getCurrentUser's session re-check.
  invalidateAuthUserCache(userId)
  try {
    revalidateTag('auth-user', { expire: 0 })
  } catch (err) {
    console.error('[SessionRevocation] auth cache expiry failed:', err instanceof Error ? err.message : err)
  }

  return deleted.length
}
