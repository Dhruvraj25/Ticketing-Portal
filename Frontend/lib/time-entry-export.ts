// ============================================================================
// Time Tracking → Export: rows for the developer's own time entries
// (pure — page + tests). The workbook is built with the existing
// lib/office-export buildXlsx, like the Report Center exports.
// Billable comes pre-computed from the server with the shared billing rule
// (lib/billing-sql.ts); the entry status uses the shared timer rule
// (lib/timer-rules.ts). No second billable or timer-state rule here.
// ============================================================================

import { isPausedEntry } from './timer-rules.ts'

export interface ExportableTimeEntry {
  id: number
  startTime: Date | string
  endTime: Date | string | null
  durationMinutes: number | null
  description: string | null
  isBillable: boolean
  ticketNumber: string | null
  ticketTitle: string | null
  ticketId: number
  userName: string | null
}

export const TIME_ENTRY_EXPORT_HEADERS = [
  'Date', 'Ticket ID', 'Ticket Title', 'Duration', 'Minutes', 'Billable', 'Status', 'Resource', 'Description',
] as const

export function entryStatus(e: Pick<ExportableTimeEntry, 'endTime' | 'description'>): 'Running' | 'Paused' | 'Stopped' {
  if (!e.endTime) return 'Running'
  return isPausedEntry({ id: 0, endTime: e.endTime, description: e.description }) ? 'Paused' : 'Stopped'
}

function fmtDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function timeEntryExportRows(entries: ExportableTimeEntry[]): (string | number)[][] {
  return entries.map((e) => {
    const minutes = Math.max(0, Number(e.durationMinutes) || 0)
    return [
      new Date(e.startTime).toISOString().slice(0, 10),
      e.ticketNumber ?? `#${e.ticketId}`,
      e.ticketTitle ?? '',
      fmtDuration(minutes),
      minutes,
      e.isBillable ? 'Billable' : 'Non-Billable',
      entryStatus(e),
      e.userName ?? '',
      (e.description ?? '').replace(/\s*\[Paused at.*?\]/g, '').trim(),
    ]
  })
}

export function timeEntryExportFilename(date = new Date()): string {
  return `time-entries-${date.toISOString().slice(0, 10)}.xlsx`
}
