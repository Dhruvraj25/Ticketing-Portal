import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatForDateTimeInput, zonedInputToUtcDate } from '../lib/datetime.ts'

// Covers the admin ticket-dates editor (TicketDatesEditor): the
// <input type="datetime-local"> must round-trip through the project's
// resolved display timezone (fmtTz/resolveDisplayTimezone), not the
// browser's OS timezone, so what's typed matches what's displayed.

test('formatForDateTimeInput renders wall-clock fields in the given IANA timezone', () => {
  // 2026-01-15T10:30:00Z is 16:00 in Asia/Kolkata (UTC+5:30, no DST).
  const instant = new Date(Date.UTC(2026, 0, 15, 10, 30, 0))
  assert.equal(formatForDateTimeInput(instant, 'Asia/Kolkata'), '2026-01-15T16:00')
  // Same instant is 05:30 in America/New_York (UTC-5, standard time in January).
  assert.equal(formatForDateTimeInput(instant, 'America/New_York'), '2026-01-15T05:30')
})

test('formatForDateTimeInput handles empty/nullish input without throwing', () => {
  assert.equal(formatForDateTimeInput(null), '')
  assert.equal(formatForDateTimeInput(undefined), '')
  assert.equal(formatForDateTimeInput(''), '')
})

test('zonedInputToUtcDate interprets the typed wall-clock string as local time in the given timezone', () => {
  const utc = zonedInputToUtcDate('2026-01-15T16:00', 'Asia/Kolkata')
  assert.ok(utc)
  assert.equal(utc!.toISOString(), '2026-01-15T10:30:00.000Z')

  const utcNy = zonedInputToUtcDate('2026-01-15T05:30', 'America/New_York')
  assert.ok(utcNy)
  assert.equal(utcNy!.toISOString(), '2026-01-15T10:30:00.000Z')
})

test('zonedInputToUtcDate returns null for empty/invalid input', () => {
  assert.equal(zonedInputToUtcDate(''), null)
  assert.equal(zonedInputToUtcDate(null), null)
  assert.equal(zonedInputToUtcDate('not-a-date'), null)
})

test('formatForDateTimeInput -> zonedInputToUtcDate round-trips to the same instant (incl. DST)', () => {
  const cases: Array<[Date, string]> = [
    [new Date(Date.UTC(2026, 5, 20, 9, 15)), 'America/New_York'], // summer, DST active
    [new Date(Date.UTC(2026, 11, 20, 9, 15)), 'America/New_York'], // winter, DST inactive
    [new Date(Date.UTC(2026, 8, 7, 3, 45)), 'Asia/Kolkata'],
    [new Date(Date.UTC(2026, 2, 1, 0, 0)), 'UTC'],
  ]
  for (const [instant, tz] of cases) {
    const inputValue = formatForDateTimeInput(instant, tz)
    const roundTripped = zonedInputToUtcDate(inputValue, tz)
    assert.ok(roundTripped, `expected a parsed date for ${inputValue} in ${tz}`)
    // datetime-local has minute precision, so compare at the minute.
    assert.equal(roundTripped!.getTime(), instant.getTime(), `mismatch for ${tz}`)
  }
})

test('admin can clear/edit dates on a completed (closed) ticket: closedAt round-trips like createdAt', () => {
  // Regression guard for the "opening a completed ticket" crash: closedAt is
  // only non-null on closed tickets, and must be usable the same way createdAt is.
  const closedAt = new Date(Date.UTC(2026, 3, 2, 14, 0))
  const input = formatForDateTimeInput(closedAt, 'UTC')
  assert.equal(input, '2026-04-02T14:00')
  const parsed = zonedInputToUtcDate(input, 'UTC')
  assert.equal(parsed?.toISOString(), closedAt.toISOString())
})
