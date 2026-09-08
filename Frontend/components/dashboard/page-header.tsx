'use client'

import { useEffect, useState } from 'react'
import { Calendar, Clock } from 'lucide-react'
import { fmtTz } from '@/lib/datetime'
import { useUserTimezone } from '@/components/timezone-provider'

export function CurrentDate() {
  // The user's saved Profile -> Personal Information timezone (never the
  // browser/device timezone, never the server's) — see components/
  // timezone-provider.tsx. fmtTz resolves through the same
  // resolveDisplayTimezone() the rest of the app uses (falling back to the
  // sh_tz cookie, then Intl's default) when this is null, so there is no
  // second timezone source and no hardcoded zone.
  const userTimezone = useUserTimezone()
  const [dateStr, setDateStr] = useState('')
  const [timeStr, setTimeStr] = useState('')

  useEffect(() => {
    function update() {
      const now = new Date()
      setDateStr(fmtTz(now, 'EEEE, MMMM d, yyyy', userTimezone))
      setTimeStr(fmtTz(now, 'h:mm a', userTimezone))
    }
    update()
    const interval = setInterval(update, 30000)
    return () => clearInterval(interval)
    // Re-run whenever the resolved timezone changes (e.g. the profile
    // timezone loads a moment after mount, or is updated elsewhere in the
    // same session) so the clock reflects it without a page reload.
  }, [userTimezone])

  return (
    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono border bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300">
      <Calendar size={14} className="text-slate-400" />
      <span>{dateStr}</span>
      <span className="text-slate-300 dark:text-slate-600">•</span>
      <Clock size={14} className="text-slate-400" />
      <span>{timeStr}</span>
    </div>
  )
}
