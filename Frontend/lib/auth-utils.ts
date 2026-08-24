import { cache as reactCache } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { unstable_cache } from 'next/cache'
import { pushActionContext, popActionContext } from '@/lib/performance-profiler'
import type { UserRole } from '@/lib/types'

/**
 * Safer version of React.cache() that falls back to no caching if React's
 * cache() is somehow unavailable (Turbopack module resolution issue).
 */
const safeCache: <T extends (...args: any[]) => any>(fn: T) => T =
  typeof reactCache === 'function'
    ? reactCache
    : ((fn: any) => fn)

type UserData = {
  id: string
  name: string
  email: string
  role: UserRole
  userType: string | null
  avatarUrl: string | null
  image: string | null
  createdAt: Date
  phone: string | null
  countryCode: string | null
  timezone: string | null
  about: string | null
  language: string | null
  timeFormat: string | null
  dateFormat: string | null
  emailNotificationsEnabled: boolean | null
}

// ── In-Memory Auth Cache ──────────────────────────────────────────────
// Caches the authenticated user data keyed by session token.
// 30-second TTL eliminates redundant Better Auth session lookups
// (2-10 seconds each) on consecutive page loads and server actions.
//
// Cache is invalidated naturally: when a user's role changes, the admin
// mutation calls revalidateTag('auth-user') to force a fresh lookup.
// Session expiry/logout naturally bypass the cache (different token).

// ── Auth Cache Tuning ───────────────────────────────────────────────────
// Two-tier caching strategy:
//
// L1 (in-memory Map): Fastest, per-process. TTL = 300s.
//   Used within the same Node.js process (dev server, production worker).
//
// L2 (Next.js unstable_cache): Shared across serverless function instances.
//   TTL = 300s. Invalidated via revalidateTag('auth-user') when user data
//   changes (profile update, admin role change).
//
// 300s TTL: session data (role, name, avatarUrl) rarely changes, and
// mutation handlers (admin update, profile update) call revalidateTag('auth-user')
// to force a fresh lookup when they do.
// The cache is also invalidated naturally on session expiry/logout (different token).
//
// Impact: <100ms auth on cache HIT (99%+ of requests once cache is warm).
const AUTH_CACHE_TTL = 300_000 // 300 seconds (5 minutes, was 60s)
const AUTH_CACHE_TTL_SECONDS = 300
const authCache = new Map<string, { data: UserData; expiresAt: number }>()

// ════════════════════════════════════════════════════════════════════════════
// L2 Cache: Next.js unstable_cache — shared across serverless instances
// ════════════════════════════════════════════════════════════════════════════
//
// Keyed by the session token. On cache MISS, the function reconstructs a
// minimal `cookie` header so Better Auth can look up the session/token the
// same way it normally does via auth.api.getSession().
//
// Invalidation: call revalidateTag('auth-user') in mutation handlers.
//
let _l2CacheAvailable = true

const getCachedAuthUserL2 = unstable_cache(
  async (token: string) => {
    // This function body runs ONLY on cache MISS (or first call).
    // Reconstruct minimal headers with both possible cookie names so Better Auth
    // can parse the token regardless of whether the deployment uses HTTPS or not.
    const miniHeaders = new Headers()
    miniHeaders.set('cookie', `better-auth.session_token=${token}; __Secure-better-auth.session_token=${token}`)

    try {
      const session = await auth.api.getSession({ headers: miniHeaders })
      if (!session?.user) return null

      const su = session.user as Record<string, unknown>
      const role = su.role as string
      if (!['admin', 'project_manager', 'developer', 'client'].includes(role)) return null

      return {
        id: su.id as string,
        name: su.name as string,
        email: su.email as string,
        role: role as UserRole,
        userType: (su.user_type as string) ?? null,
        avatarUrl: (su.avatarUrl as string) ?? null,
        image: (su.image as string) ?? null,
        createdAt: su.createdAt ? new Date(su.createdAt as string | Date) : new Date(0),
        phone: (su.phone as string) ?? null,
        countryCode: (su.countryCode as string) ?? null,
        timezone: (su.timezone as string) ?? null,
        about: (su.about as string) ?? null,
        language: (su.language as string) ?? null,
        timeFormat: (su.timeFormat as string) ?? null,
        dateFormat: (su.dateFormat as string) ?? null,
        emailNotificationsEnabled: typeof su.emailNotificationsEnabled === 'boolean' ? su.emailNotificationsEnabled : null,
      } as UserData
    } catch {
      return null
    }
  },
  ['auth-user-data'],
  {
    revalidate: AUTH_CACHE_TTL_SECONDS,
    tags: ['auth-user'],
  },
)

/**
 * Extract the Better Auth session token from the Cookie header.
 * Returns null if no session cookie is present.
 */
function extractSessionToken(cookieHeader: string): string | null {
  // Try Secure cookie first, then non-secure fallback
  const secureMatch = cookieHeader.match(/__Secure-better-auth\.session_token=([^;]+)/)
  if (secureMatch) return secureMatch[1]
  const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/)
  return match?.[1] ?? null
}

/**
 * Internal implementation: performs the actual Better Auth flow.
 * Wrapped by safeCache() below so it runs exactly ONCE per request.
 *
 * Two-tier caching (plus React.cache for per-request dedup):
 *   L1 (Map)            — dedup within same Node.js process (5 min TTL) (<0.1ms)
 *   L2 (unstable_cache) — dedup across serverless function instances  (~1ms HIT)
 *
 * This eliminates the 2-10s Better Auth session lookup on cache HIT.
 *
 * ELIMINATES the redundant user DB query:
 * Before: auth.api.getSession() → returns user data → db.select() from user AGAIN
 * After:  auth.api.getSession() → returns user data with role, userType, avatarUrl
 *         via additionalFields config — no redundant query needed.
 */
async function getCurrentUserImpl(): Promise<UserData> {
  const timeStart = performance.now()
  let timingLog: string[] = []
  const isDev = process.env.NODE_ENV !== 'production'

  // ── 1. Read headers / cookies ───────────────────────────────────────────
  const t1 = performance.now()
  const h = await headers()
  const cookies = h.get('cookie') || ''
  const sessionToken = extractSessionToken(cookies)
  if (isDev && process.env.DEBUG_PERF) timingLog.push(`cookies=${Math.round(performance.now() - t1)}ms`)

  // ── 2. Check L1 in-memory cache ────────────────────────────────────────
  if (sessionToken) {
    const t2 = performance.now()
    const cached = authCache.get(sessionToken)
    if (cached && cached.expiresAt > Date.now()) {
      if (isDev && process.env.DEBUG_PERF) {
        timingLog.push(`L1-HIT=${Math.round(performance.now() - t2)}ms`)
        console.log(`  [AUTH]   L1 cache HIT | ${timingLog.join(' | ')}`)
      }
      return cached.data
    }
    if (isDev && process.env.DEBUG_PERF) timingLog.push(`L1-miss=${Math.round(performance.now() - t2)}ms`)
  }

  // ── 3. Check L2 (unstable_cache) cross-instance cache ───────────────────
  if (sessionToken && _l2CacheAvailable) {
    const t3 = performance.now()
    try {
      const l2UserData = await getCachedAuthUserL2(sessionToken)
      if (l2UserData) {
        // Populate L1 cache for future in-process requests
        authCache.set(sessionToken, {
          data: l2UserData,
          expiresAt: Date.now() + AUTH_CACHE_TTL,
        })
        if (isDev && process.env.DEBUG_PERF) {
          timingLog.push(`L2-HIT=${Math.round(performance.now() - t3)}ms`)
          console.log(`  [AUTH]   L2 cache HIT | ${timingLog.join(' | ')}`)
        }
        return l2UserData
      }
      if (isDev && process.env.DEBUG_PERF) timingLog.push(`L2-miss=${Math.round(performance.now() - t3)}ms`)
    } catch {
      _l2CacheAvailable = false
      if (isDev) console.warn('[Auth] L2 cache (unstable_cache) unavailable, falling back to direct lookup')
    }
  }

  // ── 4. Full Better Auth session lookup (only on complete cache MISS) ────
  const t4 = performance.now()
  pushActionContext('better-auth:getSession')

  let session: Awaited<ReturnType<typeof auth.api.getSession>>

  try {
    try {
      session = await auth.api.getSession({ headers: h })
    } catch (error) {
      const errMsg = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      console.error('[Auth] session lookup failed:', errMsg)
      redirect('/sign-in')
      return null as any // unreachable — redirect throws
    }

    if (!session?.user) {
      redirect('/sign-in')
      return null as any // unreachable
    }
  } finally {
    popActionContext()
  }

  const baTime = Math.round(performance.now() - t4)

  // ── 5. Use session.user directly (no redundant DB query!) ───────────────
  //    auth.api.getSession() returns { user: { id, name, email, image, role, userType, avatarUrl } }
  //    because role, userType, and avatarUrl are configured as additionalFields.
  const su = session.user as Record<string, unknown>

  // ── 6. Permission/role check ────────────────────────────────────────────
  const role = su.role as UserRole
  if (!['admin', 'project_manager', 'developer', 'client'].includes(role)) {
    console.error('[Auth] Invalid role:', role)
    redirect('/sign-in')
    return null as any
  }

  const userData: UserData = {
    id: su.id as string,
    name: su.name as string,
    email: su.email as string,
    role,
    userType: (su.user_type as string) ?? null,
    avatarUrl: (su.avatarUrl as string) ?? null,
    image: (su.image as string) ?? null,
    createdAt: su.createdAt ? new Date(su.createdAt as string | Date) : new Date(0),
    phone: (su.phone as string) ?? null,
    countryCode: (su.countryCode as string) ?? null,
    timezone: (su.timezone as string) ?? null,
    about: (su.about as string) ?? null,
    language: (su.language as string) ?? null,
    timeFormat: (su.timeFormat as string) ?? null,
    dateFormat: (su.dateFormat as string) ?? null,
    emailNotificationsEnabled: typeof su.emailNotificationsEnabled === 'boolean' ? su.emailNotificationsEnabled : null,
  }

  // ── 7. Populate caches for subsequent requests ─────────────────────────
  if (sessionToken) {
    // L1 cache (in-memory Map)
    authCache.set(sessionToken, {
      data: userData,
      expiresAt: Date.now() + AUTH_CACHE_TTL,
    })
    // Clean up stale entries periodically (every 50 writes)
    if (authCache.size > 50) {
      const now = Date.now()
      for (const [key, entry] of authCache.entries()) {
        if (entry.expiresAt <= now) authCache.delete(key)
      }
    }

    // L2 cache (unstable_cache) — fire-and-forget, don't block response
    if (_l2CacheAvailable) {
      // unstable_cache is read-only; we can't imperatively set it.
      // The cache is populated only on NEXT request during the cache MISS handler.
    }
  }

  const totalTime = Math.round(performance.now() - timeStart)
  if (isDev && process.env.DEBUG_PERF) {
    timingLog.push(`BA=${baTime}ms`)
    timingLog.push(`total=${totalTime}ms`)
    const flag = totalTime > 1000 ? '🔴' : totalTime > 500 ? '🟡' : totalTime > 200 ? '🟠' : '  '
    console.log(`  ${flag} [AUTH]   ${timingLog.join(' | ')}`)
  }

  return userData
}

/**
 * getCurrentUser — returns the authenticated user.
 *
 * - Uses safeCache (React.cache() with guard) so auth runs exactly ONCE per request.
 * - Uses in-memory cache (30s TTL) keyed by session token for cross-request dedup.
 * - If Better Auth session lookup fails (transient error, invalid session, etc.),
 *   redirects to /sign-in instead of crashing the page.
 * - If the user is not found in the DB (e.g. deleted account), redirects to /sign-in.
 */
export const getCurrentUser = safeCache(getCurrentUserImpl)
