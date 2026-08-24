import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth-utils'

export default async function Home() {
  // OPTIMIZED: Use getCurrentUser() instead of direct auth.api.getSession().
  // getCurrentUser() uses React.cache() + 30s in-memory cache, so this is
  // essentially free (<1ms cache hit) for any subsequent auth checks.
  // Direct auth.api.getSession() bypasses both caches (2-8s per call).
  //
  // CRITICAL: Do NOT wrap redirect('/dashboard') inside try/catch —
  // redirect() throws NEXT_REDIRECT which must reach the framework boundary.
  // If caught by user code, authenticated users get sent to /sign-in instead.
  let authenticated = false
  try {
    await getCurrentUser()
    authenticated = true
  } catch {
    // Not authenticated — getCurrentUser already called redirect('/sign-in')
  }
  if (authenticated) redirect('/dashboard')
  redirect('/sign-in')
}
