import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth-utils'
import { AuthForm } from '@/components/auth-form'

export default async function SignInPage() {
  // OPTIMIZED: Use getCurrentUser() instead of direct auth.api.getSession().
  // Sign-in page should be fast (<100ms) even on the first load.
  // getCurrentUser() caches the result and redirects on failure.
  //
  // CRITICAL: Do NOT wrap redirect('/dashboard') inside try/catch —
  // redirect() throws NEXT_REDIRECT which must reach the framework boundary.
  let authenticated = false
  try {
    await getCurrentUser()
    authenticated = true
  } catch {
    // Not authenticated — show sign-in form below
  }
  if (authenticated) redirect('/dashboard')

  return <AuthForm mode="sign-in" />
}
