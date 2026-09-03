'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

const TimezoneContext = createContext<string | null>(null)

/**
 * Provides the logged-in user's preferred timezone (Profile → Personal
 * Information) to every client component beneath it, and mirrors it into an
 * `sh_tz` cookie so server-rendered markup can resolve the same timezone via
 * resolveDisplayTimezone() in lib/datetime.ts.
 */
export function TimezoneProvider({
  timezone,
  children,
}: {
  timezone?: string | null
  children: ReactNode
}) {
  // Allow a stored preference (set by older sessions / other pages) to win
  // when the server did not provide one.
  const [tz, setTz] = useState<string | null>(timezone ?? null)

  useEffect(() => {
    if (timezone) {
      setTz(timezone)
    } else {
      try {
        const stored = window.localStorage.getItem('sh_tz')
        if (stored) setTz(stored)
      } catch {}
    }
  }, [timezone])

  useEffect(() => {
    if (!tz) return
    try {
      document.cookie = `sh_tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`
      window.localStorage.setItem('sh_tz', tz)
    } catch {
      // cookie/localStorage unavailable — context still works in-session
    }
  }, [tz])

  const value = useMemo(() => tz, [tz])
  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>
}

/** Returns the current user's display timezone (nullable when unknown). */
export function useUserTimezone(): string | null {
  return useContext(TimezoneContext)
}
