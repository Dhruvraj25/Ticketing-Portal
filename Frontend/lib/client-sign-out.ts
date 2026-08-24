'use client'

import { signOut } from '@/lib/auth-client'

/**
 * Shared client-side sign-out used by the sidebar and the top header.
 * Clears all better-auth cookies (including secure variants) and redirects
 * to the sign-in page.
 */
export async function signOutAndRedirect() {
  try {
    await signOut()
  } catch (error) {
    console.error('Sign out failed:', error)
  }
  const cookies = [
    'better-auth.session_token',
    'better-auth.session_data',
    'better-auth.dont_remember',
    'better-auth.account_data',
    '__Secure-better-auth.session_token',
    '__Secure-better-auth.session_data',
    '__Secure-better-auth.dont_remember',
    '__Secure-better-auth.account_data',
  ]
  for (const name of cookies) {
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0`
  }
  window.location.href = '/sign-in'
}
