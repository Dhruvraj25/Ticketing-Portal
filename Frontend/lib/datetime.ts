/**
 * Centralized date/time formatting for the portal.
 *
 * Every absolute date/time rendered anywhere in the UI should go through these
 * helpers so values are shown in the logged-in user's selected timezone (see
 * Profile → Personal Information → Timezone) instead of the server's or the
 * browser's default.
 *
 * Implementation note: date-fns v4's `in` option expects a timezone *context
 * function* (from the separate @date-fns/tz package), not an IANA string, so
 * we format wall-clock fields ourselves via Intl.DateTimeFormat + timeZone.
 * This keeps the formatters dependency-free and consistent on the server
 * (UTC) and in the browser.
 */

import { formatDistanceToNow } from 'date-fns'

/**
 * Resolve the effective display timezone for the current user.
 *
 * Order:
 *   1. Explicitly passed timezone (profile preference from the user row)
 *   2. `sh_tz` cookie (kept in sync by the TimezoneProvider) so server
 *      components and non-provider contexts still format consistently
 *   3. Intl default (browser/Node default) — last resort
 */
export function resolveDisplayTimezone(explicit?: string | null): string {
  if (explicit) return explicit
  if (typeof window !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)sh_tz=([^;]+)/)
    if (match?.[1]) {
      try {
        // Only accept valid IANA timezones.
        Intl.DateTimeFormat(undefined, { timeZone: match[1] })
        return decodeURIComponent(match[1])
      } catch {
        // invalid value — fall through
      }
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface WallClock {
  year: number
  month: number // 1-12
  day: number
  hours: number // 0-23
  minutes: number
  seconds: number
  weekday: number // 0-6, Sunday = 0
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Decompose an instant into wall-clock fields in the target timezone. */
function wallClock(date: Date | string | number, timezone?: string | null): WallClock | null {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return null
  const tz = resolveDisplayTimezone(timezone)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(d)
  const get = (type: Intl.DateTimeFormatPartTypes) => {
    const p = parts.find((part) => part.type === type)
    return p ? Number(p.value) : NaN
  }
  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hours = get('hour')
  const minutes = get('minute')
  const seconds = get('second')
  const weekdayPart = parts.find((part) => part.type === 'weekday')?.value ?? ''
  if ([year, month, day, hours, minutes].some((n) => isNaN(n))) return null
  return {
    year,
    month,
    day,
    hours,
    minutes,
    seconds: isNaN(seconds) ? 0 : seconds,
    weekday: Math.max(0, DAYS_SHORT.indexOf(weekdayPart)),
  }
}

/**
 * Minimal date-fns-token formatter evaluated against wall-clock fields in the
 * resolved timezone. Supports the token set used across the portal:
 * yyyy, MMMM/MMM/MM/M, dd/d, EEEE/EEE, HH/H, hh/h, mm, a and quoted 'literal'.
 * Unsupported letters are emitted verbatim (lenient, never throws).
 */
function formatInTimezone(date: Date | string | number, pattern: string, timezone?: string | null): string {
  const wc = wallClock(date, timezone)
  if (!wc) return '—'
  const ampm = wc.hours < 12 ? 'AM' : 'PM'
  const h12 = wc.hours % 12 === 0 ? 12 : wc.hours % 12

  const TOKENS: Record<string, string> = {
    yyyy: String(wc.year),
    MMMM: MONTHS_LONG[wc.month - 1] ?? String(wc.month),
    MMM: MONTHS_SHORT[wc.month - 1] ?? String(wc.month),
    MM: pad2(wc.month),
    M: String(wc.month),
    dd: pad2(wc.day),
    d: String(wc.day),
    EEEE: DAYS_LONG[wc.weekday] ?? '',
    EEE: DAYS_SHORT[wc.weekday] ?? '',
    HH: pad2(wc.hours),
    H: String(wc.hours),
    hh: pad2(h12),
    h: String(h12),
    mm: pad2(wc.minutes),
    a: ampm,
  }

  let out = ''
  let i = 0
  while (i < pattern.length) {
    const ch = pattern[i]
    if (ch === "'") {
      // Quoted literal — ends at the next unescaped quote (or end of string).
      const end = pattern.indexOf("'", i + 1)
      out += end === -1 ? pattern.slice(i + 1) : pattern.slice(i + 1, end)
      i = end === -1 ? pattern.length : end + 1
      continue
    }
    if (/[a-zA-Z]/.test(ch)) {
      let j = i
      while (j < pattern.length && pattern[j] === ch) j++
      const run = pattern.slice(i, j)
      // Match the longest known token first (MMMM before M, EEEE before E, etc.)
      let matched = false
      for (let len = Math.min(run.length, 4); len >= 1 && !matched; len--) {
        const token = run.slice(0, len)
        if (TOKENS[token] !== undefined) {
          out += TOKENS[token]
          // Consume only the letters used by the token; leftovers are emitted as-is.
          out += run.slice(len)
          matched = true
        }
      }
      if (!matched) out += run
      i = j
      continue
    }
    out += ch
    i++
  }
  return out
}

/** Format a date/time in the given timezone with a date-fns-style pattern. */
export function fmtTz(date: Date | string | number, pattern: string, timezone?: string | null): string {
  return formatInTimezone(date, pattern, timezone)
}

/** Friendly absolute timestamp, e.g. "Sep 3, 2026, 10:30 AM". */
export function fmtDateTime(date: Date | string | number, timezone?: string | null): string {
  return fmtTz(date, 'MMM d, yyyy, h:mm a', timezone)
}

/** Date only, e.g. "Sep 3, 2026". */
export function fmtDate(date: Date | string | number, timezone?: string | null): string {
  return fmtTz(date, 'MMM d, yyyy', timezone)
}

/** Compact date only, e.g. "09/03/2026" — kept stable, locale-independent. */
export function fmtDateShort(date: Date | string | number, timezone?: string | null): string {
  return fmtTz(date, 'MM/dd/yyyy', timezone)
}

/** Time only, e.g. "10:30 AM". */
export function fmtTime(date: Date | string | number, timezone?: string | null): string {
  return fmtTz(date, 'h:mm a', timezone)
}

/** 24h time, e.g. "22:30". */
export function fmtTime24(date: Date | string | number, timezone?: string | null): string {
  return fmtTz(date, 'HH:mm', timezone)
}

/** Relative label ("2 hours ago") — safe to call in any context. */
export function timeAgo(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return '—'
  return formatDistanceToNow(d, { addSuffix: true })
}

/** Legacy alias — relative label for date values returned by the server. */
export function fmtRelative(date: Date | string | number): string {
  return timeAgo(date)
}

/**
 * Stable timezone label for a stored IANA value (for selects/labels).
 * Falls back to the raw value when Intl cannot resolve it.
 */
export function timezoneLabel(timezone?: string | null): string {
  if (!timezone) return 'UTC'
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(new Date())
    const short = parts.find((p) => p.type === 'timeZoneName')?.value
    return short && short !== timezone ? `${timezone} (${short})` : timezone
  } catch {
    return timezone
  }
}
