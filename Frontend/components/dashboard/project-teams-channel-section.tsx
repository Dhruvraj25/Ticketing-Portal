'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getTeamsProjectChannels,
  saveTeamsProjectChannel,
  removeTeamsProjectChannel,
  sendTeamsProjectTestMessage,
  type ProjectTeamsChannelStatus,
} from '@/app/actions/teams'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, MessageSquare, CheckCircle2, XCircle, Send, Trash2, Pencil, MessageSquarePlus } from 'lucide-react'

interface ProjectTeamsChannelSectionProps {
  projectId: number
  /** Status only — this component (and everything it calls) never sees the stored webhook URL. */
  initialStatus: ProjectTeamsChannelStatus | null
}

/**
 * Project Detail → single-project Microsoft Teams channel widget.
 * Reuses the EXACT SAME actions as the admin Teams page's per-project list
 * (app/dashboard/admin/teams/project-channels-client.tsx) — no new backend
 * surface, no competing configuration system. Admin-only, matching the
 * existing backend routes' own admin-only gate.
 *
 * SECURITY: the stored webhook URL is never returned by any action this
 * component calls, so there is no code path here that could display, log,
 * or return it — only status fields (configured / enabled / updatedAt).
 */
export function ProjectTeamsChannelSection({ projectId, initialStatus }: ProjectTeamsChannelSectionProps) {
  const router = useRouter()
  const [status, setStatus] = useState<ProjectTeamsChannelStatus | null>(initialStatus)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [linkInput, setLinkInput] = useState('')
  const [enabledInput, setEnabledInput] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const configured = !!status?.configured
  const enabled = !!status?.enabled

  async function refresh() {
    try {
      const data = await getTeamsProjectChannels()
      const found = (data.projects ?? []).find((p) => p.projectId === projectId) ?? null
      setStatus(found)
    } catch {
      // Keep the last known status.
    }
  }

  function openAdd() {
    setLinkInput('')
    setEnabledInput(true)
    setDialogError(null)
    setDialogOpen(true)
  }

  function openEdit() {
    // The stored link is never sent to the client — leave blank to keep it.
    setLinkInput('')
    setEnabledInput(enabled)
    setDialogError(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    const isNew = !configured
    if (isNew && !linkInput.trim()) {
      setDialogError('Paste the Microsoft Teams channel link to add this webhook.')
      return
    }
    setSaving(true)
    setDialogError(null)
    try {
      const result = await saveTeamsProjectChannel(projectId, {
        ...(linkInput.trim() ? { webhookUrl: linkInput.trim() } : {}),
        enabled: enabledInput,
      })
      if (!result.success) {
        setDialogError(result.message || 'Could not save the Teams webhook.')
        return
      }
      setFeedback({ type: 'success', message: result.message || (isNew ? 'Teams webhook added.' : 'Teams webhook updated.') })
      setDialogOpen(false)
      await refresh()
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle() {
    setBusy(true)
    setFeedback(null)
    try {
      const result = await saveTeamsProjectChannel(projectId, { enabled: !enabled })
      if (!result.success) {
        setFeedback({ type: 'error', message: result.message || 'Could not update the Teams webhook.' })
        return
      }
      setFeedback({ type: 'success', message: enabled ? 'Teams webhook disabled.' : 'Teams webhook enabled.' })
      await refresh()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!window.confirm('Remove the Microsoft Teams webhook for this project? Notifications will fall back to the global webhook, if one is configured.')) return
    setBusy(true)
    setFeedback(null)
    try {
      const result = await removeTeamsProjectChannel(projectId)
      if (!result.success) {
        setFeedback({ type: 'error', message: result.message || 'Could not remove the Teams webhook.' })
        return
      }
      setFeedback({ type: 'success', message: 'Teams webhook removed.' })
      await refresh()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleTest() {
    setBusy(true)
    setFeedback(null)
    try {
      const result = await sendTeamsProjectTestMessage(projectId)
      setFeedback({
        type: result.success ? 'success' : 'error',
        message: result.message || (result.success ? 'Test message delivered.' : 'Test message failed.'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5 bg-card/50 backdrop-blur-sm border-border/50">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground">Microsoft Teams</h3>
      </div>

      <div className="space-y-2 text-sm mb-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Channel status</span>
          <Badge variant="outline" className={configured ? 'text-[11px] text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15' : 'text-[11px] text-muted-foreground'}>
            {configured ? 'Configured' : 'Not configured'}
          </Badge>
        </div>
        {configured && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge variant="outline" className={enabled ? 'text-[11px] text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15' : 'text-[11px] text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15'}>
              {enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {configured
            ? 'The channel link is stored securely and is never displayed again.'
            : 'Without a project channel, notifications use the global webhook fallback, if one is configured.'}
        </p>
      </div>

      {feedback && (
        <div className={'mb-3 flex items-start gap-2 text-xs rounded-lg px-3 py-2 ' + (feedback.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300')}>
          {feedback.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!configured ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openAdd}>
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Add Webhook
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={openEdit} disabled={busy}>
              <Pencil className="h-3.5 w-3.5" />
              Replace Webhook
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleTest} disabled={busy || !enabled}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Test
            </Button>
            <Button size="sm" variant="outline" onClick={handleToggle} disabled={busy}>
              {enabled ? 'Disable' : 'Enable'}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={handleRemove} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{configured ? 'Replace Teams Webhook' : 'Add Teams Webhook'}</DialogTitle>
            <DialogDescription>
              {configured
                ? 'The current webhook link is not shown for security. Paste a new link to replace it, or just change the enabled state.'
                : 'Paste the Microsoft Teams channel webhook link for this project.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="project-teams-link">Teams Webhook URL</Label>
              <Input
                id="project-teams-link"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder={configured ? 'Leave blank to keep the current webhook' : 'https://…webhook.office.com/… or https://…logic.azure.com/…'}
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Must be an HTTPS Microsoft Teams webhook URL.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="project-teams-enabled"
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={enabledInput}
                onChange={(e) => setEnabledInput(e.target.checked)}
              />
              <Label htmlFor="project-teams-enabled" className="text-xs font-normal">
                Enabled — route this project&apos;s Teams notifications to this webhook
              </Label>
            </div>
            {dialogError && (
              <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300">
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{dialogError}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
