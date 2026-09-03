'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Bell, Loader2, Mail, MessageSquareText } from 'lucide-react'
import { toast } from 'sonner'
import {
  getNotificationPreferences,
  updateNotificationPreference,
  type NotificationPreferencesResponse,
} from '@/app/actions/notification-preferences'
import { cn } from '@/lib/utils'

type ChannelKey = 'in_app' | 'email' | 'teams'

const CHANNEL_META: { key: ChannelKey; label: string; icon: typeof Mail }[] = [
  { key: 'teams', label: 'Teams', icon: MessageSquareText },
  { key: 'email', label: 'Email', icon: Mail },
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
      aria-label={label}        className={cn(
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

export function NotificationPreferencesSection() {
  const [data, setData] = useState<NotificationPreferencesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const result = await getNotificationPreferences()
      setData(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load notification preferences'
      setLoadError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const current = (eventType: string, channel: ChannelKey): boolean => {
    const pref = data?.preferences.find((p) => p.eventType === eventType)
    if (!pref) return true
    if (channel === 'in_app') return pref.inApp
    if (channel === 'email') return pref.email
    return pref.teams
  }

  const handleToggle = async (eventType: string, channel: ChannelKey, enabled: boolean, label: string) => {
    const key = `${eventType}:${channel}`
    setSavingKey(key)
    try {
      const updated = await updateNotificationPreference(eventType, channel, enabled)
      setData(updated)
      toast.success(enabled ? `${label} notifications turned on` : `${label} notifications turned off`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save preference'
      toast.error(msg)
    } finally {
      setSavingKey(null)
    }
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

  return (
    <div className="rounded-xl bg-muted/10 border border-border/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50">
        <p className="text-sm font-medium text-foreground flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          Notification Preferences
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose which notifications you receive, per channel and per event. Preferences are
          enforced by the server — they apply everywhere, not just on this device.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading notification preferences...
        </div>
      )}

      {!loading && loadError && (
        <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {loadError}
          </div>
          <button
            type="button"
            onClick={load}
            className="text-sm font-medium text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !loadError && data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border/50">
          {CHANNEL_META.map(({ key, label, icon: Icon }) => (
            <div key={key} className="min-w-0">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-b border-border/40 sticky top-0">
                <Icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground">{label}</span>
              </div>
              <div className="max-h-96 overflow-y-auto p-3 space-y-1">
                {groupedPreferences.map(({ group, items }) => (
                  <div key={`${key}-${group}`} className="pt-2 first:pt-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-1 mb-1">
                      {group}
                    </p>
                    <div className="space-y-0.5">
                      {items.map((p) => {
                        const enabled = current(p.eventType, key)
                        const busy = savingKey === `${p.eventType}:${key}`
                        return (
                          <div
                            key={`${key}-${p.eventType}`}
                            className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/30 transition-colors"
                          >
                            <span className="text-[13px] text-foreground leading-snug">{p.label}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                              <Toggle
                                checked={enabled}
                                disabled={savingKey !== null}
                                onToggle={() => handleToggle(p.eventType, key, !enabled, p.label)}
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
      )}
    </div>
  )
}
