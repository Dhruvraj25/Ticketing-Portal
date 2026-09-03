'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateTicketPriority } from '@/app/actions/tickets'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'critical', label: 'Critical' },
]

interface PriorityEditorProps {
  ticketId: number
  currentPriority: string
  canEdit?: boolean
}

/**
 * Manager/Admin priority control shown on the ticket detail page.
 * Hidden (or disabled) for developers and clients — unauthorized roles never
 * see the control because the server action also rejects non-manager/admins.
 */
export function PriorityEditor({ ticketId, currentPriority, canEdit = false }: PriorityEditorProps) {
  const router = useRouter()
  const [priority, setPriority] = useState(currentPriority || 'medium')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!canEdit) {
    return (
      <span className="px-2 py-0.5 rounded-md bg-muted/60 border border-border/50 text-xs font-medium text-foreground uppercase">
        {priority}
      </span>
    )
  }

  async function handleChange(next: string) {
    if (next === priority) return
    const previous = priority
    setPriority(next)
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateTicketPriority(ticketId, next)
      setSaved(true)
      toast.success('Priority updated')
      setTimeout(() => setSaved(false), 2000)
      // Re-render server components (status badge, lists) with fresh data.
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update priority'
      setPriority(previous)
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Select value={priority} onValueChange={handleChange} disabled={saving}>
        <SelectTrigger
          aria-label="Change ticket priority"
          className="h-7 w-[92px] rounded-md bg-muted/40 border-border/50 text-xs uppercase font-medium"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRIORITY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <span className="uppercase text-xs">{o.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : saved ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
      ) : error ? (
        <AlertCircle className="h-3 w-3 text-destructive" />
      ) : null}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
