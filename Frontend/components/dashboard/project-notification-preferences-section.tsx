'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, Loader2, Mail, MessageSquareText, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  getProjectNotificationPreferences,
  updateProjectNotificationPreference,
  type ProjectNotificationPreferencesResponse,
} from '@/app/actions/project-notification-preferences'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type ChannelKey = 'in_app' | 'email' | 'teams'

const CHANNEL_META: { key: ChannelKey; label: string; icon: typeof Mail }[] = [
  { key: 'teams', label: 'Teams', icon: MessageSquareText },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'in_app', label: 'In-App', icon: Bell },
]

// These events must not appear as TEAMS rows in the Client Notification
// Preferences UI. This is a display-only exclusion for this one widget's
// Teams column: the events, their catalog entries, their DB rows, and their
// Email/In-App rows are all untouched — only this list omits them here.
const TEAMS_HIDDEN_EVENT_TYPES = new Set(['customer_created', 'welcome', 'new_project'])

function Toggle({ checked, disabled, onToggle, label }: { checked: boolean; disabled: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={label}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-emerald-500' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'inline-block h-[14px] w-[14px] transform rounded-full bg-white dark:bg-slate-900 shadow-sm transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}

/**
 * Project Detail → per-project notification preferences (client-wise → project-wise).
 *
 * These settings apply ONLY to notifications sent to CLIENT users of this
 * project — every Client user assigned to this project shares the same
 * settings (see app/actions/project-notification-preferences.ts and the
 * backend's loadMergedPreferenceMapForProject). Admin/Manager/Project
 * Manager/Developer notification behavior is entirely unaffected: internal
 * staff keep managing their own preferences from their profile page
 * (components/dashboard/notification-preferences-section.tsx), a separate,
 * untouched system.
 *
 * Reuses the EXACT SAME backend API surface as the client-wise widget it
 * replaces — no parallel preference system.
 */
export function ProjectNotificationPreferencesSection({ projectId }: { projectId: number }) {
  const [data, setData] = useState<ProjectNotificationPreferencesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const result = await getProjectNotificationPreferences(projectId)
      setData(result)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load notification preferences')
    } finally {
      setLoading(false)
    }
  }, [projectId])

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
      const updated = await updateProjectNotificationPreference(projectId, eventType, channel, enabled)
      setData(updated)
      toast.success(enabled ? `${label} notifications turned on for this project` : `${label} notifications turned off for this project`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save preference')
    } finally {
      setSavingKey(null)
    }
  }

  const groupedPreferencesByChannel = useMemo(() => {
    const prefs = data?.preferences ?? []
    const result: Record<ChannelKey, { group: string; items: typeof prefs }[]> = { in_app: [], email: [], teams: [] }
    for (const { key } of CHANNEL_META) {
      // Only the TEAMS column omits TEAMS_HIDDEN_EVENT_TYPES — Email and
      // In-App keep every event, and the underlying data/catalog is untouched.
      const channelPrefs = key === 'teams' ? prefs.filter(p => !TEAMS_HIDDEN_EVENT_TYPES.has(p.eventType)) : prefs
      const groups: { group: string; items: typeof prefs }[] = []
      for (const p of channelPrefs) {
        const last = groups[groups.length - 1]
        if (last && last.group === p.group) last.items.push(p)
        else groups.push({ group: p.group, items: [p] })
      }
      result[key] = groups
    }
    return result
  }, [data])

  return (
    <Card className="p-5 bg-card/50 backdrop-blur-sm border-border/50">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground">Client Notification Preferences</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Applies to every Client user assigned to this project — not per individual client. Admin and Manager
        notifications are unaffected.
      </p>

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
          <button type="button" onClick={load} className="text-sm font-medium text-primary hover:underline">
            Try again
          </button>
        </div>
      )}

      {!loading && !loadError && data && (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border/50">
            {CHANNEL_META.map(({ key, label, icon: Icon }) => (
              <div key={key} className="min-w-0">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border/40">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-foreground">{label}</span>
                </div>
                <div className="max-h-80 overflow-y-auto p-2.5 space-y-1">
                  {groupedPreferencesByChannel[key].map(({ group, items }) => (
                    <div key={`${key}-${group}`} className="pt-2 first:pt-0">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-1 mb-1">{group}</p>
                      <div className="space-y-0.5">
                        {items.map((p) => {
                          const enabled = current(p.eventType, key)
                          const busy = savingKey === `${p.eventType}:${key}`
                          return (
                            <div key={`${key}-${p.eventType}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-muted/30 transition-colors">
                              <span className="text-[12px] text-foreground leading-snug">{p.label}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                                <Toggle
                                  checked={enabled}
                                  disabled={savingKey !== null}
                                  onToggle={() => handleToggle(p.eventType, key, !enabled, p.label)}
                                  label={`${p.label} — ${label} notifications for this project`}
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
      )}
    </Card>
  )
}
