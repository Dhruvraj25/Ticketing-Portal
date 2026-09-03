'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, Pencil, X, Check, Loader2, AlertCircle, Trash2 } from 'lucide-react'
import { updateTicketDates } from '@/app/actions/tickets'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fmtTz } from '@/lib/datetime'

interface TicketDatesEditorProps {
  ticketId: number
  createdAt: string
  closedAt: string | null
}

/** Store (UTC ISO) → value for an <input type="datetime-local"> in the browser's zone. */
function isoToLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Admin-only editor for a ticket's creation / closing timestamps (R24).
 * Date/time pickers show the existing values, validate before saving and
 * refresh the ticket data (server re-render) after a successful update.
 */
export function TicketDatesEditor({ ticketId, createdAt, closedAt }: TicketDatesEditorProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [createdInput, setCreatedInput] = useState('')
  const [closedInput, setClosedInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openEditor = () => {
    setCreatedInput(isoToLocalInput(createdAt))
    setClosedInput(isoToLocalInput(closedAt))
    setError(null)
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setError(null)
  }

  async function handleSave() {
    setError(null)
    if (!createdInput) {
      setError('Creation date is required.')
      return
    }
    const created = new Date(createdInput)
    if (isNaN(created.getTime())) {
      setError('Creation date is invalid.')
      return
    }
    if (closedInput) {
      const closed = new Date(closedInput)
      if (isNaN(closed.getTime())) {
        setError('Closing date is invalid.')
        return
      }
      if (closed.getTime() < created.getTime()) {
        setError('Closing date cannot be earlier than the creation date.')
        return
      }
    }
    setSaving(true)
    try {
      await updateTicketDates(ticketId, {
        createdAt: created.toISOString(),
        closedAt: closedInput ? new Date(closedInput).toISOString() : null,
      })
      setEditing(false)
      toast.success('Ticket dates updated')
      // Re-run the page's server components so the new dates render everywhere.
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update ticket dates'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const row = (label: string, value: string | null) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground font-medium text-right">
        {value ? fmtTz(value, 'MMM d, yyyy, h:mm a') : '—'}
      </span>
    </div>
  )

  return (
    <div data-tour="ticket-dates-admin" className="bg-white dark:bg-slate-900 border border-border rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          Ticket Dates
        </h3>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={openEditor} className="h-7 px-2 gap-1 text-xs text-muted-foreground">
            <Pencil className="h-3 w-3" /> Edit
          </Button>
        )}
      </div>

      {!editing ? (
        <div className="space-y-2">
          {row('Created', createdAt)}
          {row('Closed', closedAt)}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-created-at" className="text-xs">
              Creation Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-created-at"
              type="datetime-local"
              value={createdInput}
              onChange={(e) => setCreatedInput(e.target.value)}
              className="h-9 text-xs rounded-lg"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-closed-at" className="text-xs">
              Closing Date
            </Label>
            <Input
              id="edit-closed-at"
              type="datetime-local"
              value={closedInput}
              onChange={(e) => setClosedInput(e.target.value)}
              className="h-9 text-xs rounded-lg"
            />
            <p className="text-[11px] text-muted-foreground">Leave empty to clear the closing date (ticket not yet closed).</p>
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 rounded-lg px-2.5 py-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={cancel} disabled={saving} className="h-8 rounded-lg">
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 rounded-lg">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              Save
            </Button>
          </div>
        </div>
      )}

      {/* Icon hint that clearing is allowed (kept out of the button row layout) */}
      {editing && closedInput && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setClosedInput('')}
          disabled={saving}
          className="mt-2 h-7 px-2 gap-1 text-[11px] text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" /> Clear closing date
        </Button>
      )}
    </div>
  )
}
