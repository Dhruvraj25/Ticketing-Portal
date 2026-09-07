'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Bell, Building2, CheckCircle2, Loader2, Mail, MessageSquareText, RotateCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  updateClientNotificationPreferences,
  type ClientNotificationPreferencesData,
  type ManageableClient,
} from '@/app/actions/client-notification-preferences'
import type { NotificationChannel } from '@/lib/notification-catalog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ChannelKey = NotificationChannel // 'in_app' | 'email' | 'teams'

// Displayed in Email → Teams → In-App order (one column per channel).
const CHANNEL_META: { key: ChannelKey; label: string; icon: typeof Mail }[] = [
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'teams', label: 'Teams', icon: MessageSquareText },
  { key: 'in_app', label: 'In-App', icon: Bell },
]

function Toggle({
  checked,
  disabled,
  onToggle,
  label,
}: {
  checked: boolean
  disabled: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={label}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-emerald-500' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'inline-block h-[18px] w-[18px] transform rounded-full bg-white dark:bg-slate-900 shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}

interface ClientNotificationPreferencesProps {
  /** Clients the current user may manage (used by the switcher). */
  clients: ManageableClient[]
  /** Initially selected client. */
  clientId: string
  /** Pre-fetched settings for `clientId` (server-rendered first paint). */
  initialData: ClientNotificationPreferencesData
}

export function ClientNotificationPreferences({
  clients,
  clientId,
  initialData,
}: ClientNotificationPreferencesProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [data, setData] = useState<ClientNotificationPreferencesData>(initialData)
  // Local draft of toggle states keyed by `${eventType}:${channel}`.
  const [draft, setDraft] = useState<Record<string, boolean>>(() => toDraft(initialData))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const selectedClient = useMemo(
    () => clients.find(c => c.id === clientId),
    [clients, clientId],
  )

  // Reset local state whenever the page serves a different client's data
  // (initial navigation, direct URL change, refresh). Never keeps the previous
  // client's toggles on screen.
  useEffect(() => {
    setData(initialData)
    setDraft(toDraft(initialData))
    setSaveError('')
    setSavedAt(null)
  }, [initialData])

  const isDirty = useMemo(() => {
    if (!data) return false
    for (const p of data.preferences) {
      for (const c of CHANNEL_META) {
        const key = `${p.eventType}:${c.key}`
        if (draft[key] !== undefined && draft[key] !== baseState(p, c.key)) return true
      }
    }
    return false
  }, [data, draft])

  // Switching clients navigates to that client's page — the server ALWAYS
  // re-fetches the selected client's current preferences from the database, so
  // no stale preferences from a previously selected client can linger.
  const switchClient = (nextClientId: string) => {
    if (!nextClientId || nextClientId === clientId) return
    startTransition(() => {
      router.push(`/dashboard/clients/${nextClientId}/notification-preferences`)
    })
  }

  const handleSave = async () => {
    if (!data || !isDirty) return
    setSaving(true)
    setSaveError('')
    try {
      const updates: { eventType: string; channel: ChannelKey; enabled: boolean }[] = []
      for (const p of data.preferences) {
        for (const c of CHANNEL_META) {
          const key = `${p.eventType}:${c.key}`
          const value = draft[key]
          if (value === undefined) continue
          if (value !== baseState(p, c.key)) {
            updates.push({ eventType: p.eventType, channel: c.key, enabled: value })
          }
        }
      }
      const updated = await updateClientNotificationPreferences(clientId, updates)
      setData(updated)
      setDraft(toDraft(updated))
      setSavedAt(Date.now())
      toast.success(`Notification preferences saved for ${updated.client.name}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save notification preferences'
      setSaveError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (data) {
      setDraft(toDraft(data))
      setSaveError('')
    }
  }

  const handleToggle = (eventType: string, channel: ChannelKey) => {
    setDraft(prev => {
      const key = `${eventType}:${channel}`
      return { ...prev, [key]: !(prev[key] ?? true) }
    })
  }

  const groupedPreferences = useMemo(() => {
    const prefs = data?.preferences ?? []
    const groups: { group: string; items: typeof prefs }[] = []
    for (const p of prefs) {
      const last = groups[groups.length - 1]
      if (last && last.group === p.group) last.items.push(p)
      else groups.push({ group: p.group, items: [p] })
    }
    return groups
  }, [data])

  if (isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading notification preferences...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Client context + switcher */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-border/50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {data.client.name}
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30">
                Client
              </span>
            </p>
            <p className="text-xs text-muted-foreground truncate">{data.client.email}</p>
          </div>
        </div>
        {clients.length > 1 && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:inline">Switch client:</span>
            <Select value={clientId} onValueChange={switchClient}>
              <SelectTrigger className="h-9 w-full sm:w-64 rounded-lg bg-muted/20 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {saveError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
        </div>
      )}

      {/* Per-channel settings — each channel has independent controls. */}
      <div className="rounded-xl bg-muted/10 border border-border/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50">
          <p className="text-sm font-medium text-foreground">
            Notification Preferences
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose which notifications this client receives, per channel and per event.
            Changes apply to <span className="font-medium text-foreground">{data.client.name}</span> only
            and are enforced server-side. {selectedClient && selectedClient.projectNames.length > 0 && (
              <span className="mt-0.5 block">
                Reachable through: {selectedClient.projectNames.join(', ')}
              </span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/50">
          {CHANNEL_META.map(({ key, label, icon: Icon }) => (
            <div key={key} className="min-w-0">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-b border-border/40 sticky top-0">
                <Icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                  {label} Notifications
                </span>
              </div>
              <div className="max-h-[28rem] overflow-y-auto p-3 space-y-1">
                {groupedPreferences.map(({ group, items }) => (
                  <div key={`${key}-${group}`} className="pt-2 first:pt-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-1 mb-1">
                      {group}
                    </p>
                    <div className="space-y-0.5">
                      {items.map(p => {
                        const enabled = draft[`${p.eventType}:${key}`] ?? baseState(p, key)
                        const changed = enabled !== baseState(p, key)
                        return (
                          <div
                            key={`${key}-${p.eventType}`}
                            className={cn(
                              'flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors',
                              changed ? 'bg-primary/5' : 'hover:bg-muted/30',
                            )}
                          >
                            <span className="text-[13px] text-foreground leading-snug">{p.label}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {changed && <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Unsaved change" />}
                              <Toggle
                                checked={enabled}
                                disabled={saving}
                                onToggle={() => handleToggle(p.eventType, key)}
                                label={`${p.label} — ${label} notifications`}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save / reset footer */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-border/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {savedAt && !isDirty ? (
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved just now — preferences persist across sessions.
            </span>
          ) : isDirty ? (
            <span>You have unsaved changes.</span>
          ) : (
            <span>All changes are saved.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={!isDirty || saving}
            className="rounded-lg"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Discard
          </Button>
          <Button type="button" onClick={handleSave} disabled={!isDirty || saving} className="rounded-lg shadow-sm">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function baseState(p: { inApp: boolean; email: boolean; teams: boolean }, channel: ChannelKey): boolean {
  if (channel === 'in_app') return p.inApp
  if (channel === 'email') return p.email
  return p.teams
}

function toDraft(data: ClientNotificationPreferencesData): Record<string, boolean> {
  const draft: Record<string, boolean> = {}
  for (const p of data.preferences) {
    draft[`${p.eventType}:in_app`] = p.inApp
    draft[`${p.eventType}:email`] = p.email
    draft[`${p.eventType}:teams`] = p.teams
  }
  return draft
}
