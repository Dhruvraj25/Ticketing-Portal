/**
 * Format minutes into a human-readable duration string.
 * Examples: "2d 4h 35m", "6h 42m", "45m"
 */
export function fmtDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m'

  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const mins = Math.round(minutes % 60)

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`)

  return parts.join(' ')
}

/**
 * Format minutes into a compact duration string (for tight spaces).
 * Examples: "2d 4h", "6h 42m", "45m"
 */
export function fmtDurationCompact(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m'

  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const mins = Math.round(minutes % 60)

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0 && days === 0) parts.push(`${mins}m`)
  if (parts.length === 0) parts.push('0m')

  return parts.join(' ')
}

/**
 * Convert average resolution time from hours to a readable format.
 * @param hours - average resolution time in hours (e.g. 52.3)
 * @returns formatted string like "2d 4h 18m"
 */
export function fmtAvgResolution(hours: number): string {
  if (!hours || hours <= 0) return '—'
  const totalMinutes = Math.round(hours * 60)
  return fmtDuration(totalMinutes)
}

/**
 * Strip HTML tags from a string, returning plain text.
 * Also converts <br> tags to newlines and collapses multiple whitespace.
 * Safe to call on plain text (it will be returned unchanged).
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  // Replace <br> with newline first
  let text = html.replace(/<br\s*\/?>/gi, '\n')
  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, '')
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/&ldquo;/g, '"')
  text = text.replace(/&rdquo;/g, '"')
  text = text.replace(/&lsquo;/g, "'")
  text = text.replace(/&rsquo;/g, "'")
  return text.trim()
}
