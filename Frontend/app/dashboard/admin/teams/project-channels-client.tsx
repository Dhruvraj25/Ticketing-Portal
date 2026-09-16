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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  MessageSquarePlus,
  Pencil,
  Trash2,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Link2,
  RefreshCw,
} from 'lucide-react'

interface Props {
  initialProjects: ProjectTeamsChannelStatus[]
}

interface Feedback {
  projectId: number
  type: 'success' | 'error'
  message: string
}

/**
 * Microsoft Teams → per-project channel configuration (Phase 7).
 *
 * SECURITY: the backend only ever returns channel STATUS. The stored webhook
 * URL (a secret — it embeds a signature) is never sent to the browser; an admin
 * can add or replace a link, never read the existing one back.
 */
export function ProjectChannelsClient({ initialProjects }: Props) {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectTeamsChannelStatus[]>(initialProjects)
  const [dialogProject, setDialogProject] = useState<ProjectTeamsChannelStatus | null>(null)
  const [linkInput, setLinkInput] = useState('')
  const [enabledInput, setEnabledInput] = useState(true)
  const [teamIdInput, setTeamIdInput] = useState('')
  const [channelIdInput, setChannelIdInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busyProjectId, setBusyProjectId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function refreshProjects() {
    setRefreshing(true)
    try {
      const data = await getTeamsProjectChannels()
      setProjects(data.projects ?? [])
    } catch {
      // Keep the last known list — the page-level fetch already reports outages.
    } finally {
      setRefreshing(false)
    }
  }

  function openAdd(project: ProjectTeamsChannelStatus) {
    setDialogProject(project)
    setLinkInput('')
    setEnabledInput(true)
    setTeamIdInput('')
    setChannelIdInput('')
    setDialogError(null)
  }

  function openEdit(project: ProjectTeamsChannelStatus) {
    setDialogProject(project)
    // The stored link is never sent to the client, so the field starts empty:
    // leaving it blank keeps the current link, entering a value replaces it.
    // Team ID/Channel ID are not secrets, but are also left blank here —
    // leaving both blank keeps whatever is already configured; re-entering
    // both replaces them (see the "must both be provided together" rule).
    setLinkInput('')
    setEnabledInput(project.enabled)
    setTeamIdInput('')
    setChannelIdInput('')
    setDialogError(null)
  }

  async function handleSave() {
    if (!dialogProject) return
    const isNew = !dialogProject.configured

    if (isNew && !linkInput.trim()) {
      setDialogError('Paste the Microsoft Teams channel link to add this channel.')
      return
    }

    if (teamIdInput.trim() && !channelIdInput.trim()) {
      setDialogError('Enter the Channel ID too — both are required together to enable @mentions.')
      return
    }
    if (channelIdInput.trim() && !teamIdInput.trim()) {
      setDialogError('Enter the Team ID too — both are required together to enable @mentions.')
      return
    }

    setSaving(true)
    setDialogError(null)
    try {
      const result = await saveTeamsProjectChannel(dialogProject.projectId, {
        ...(linkInput.trim() ? { webhookUrl: linkInput.trim() } : {}),
        enabled: enabledInput,
        ...(teamIdInput.trim() ? { teamId: teamIdInput.trim() } : {}),
        ...(channelIdInput.trim() ? { channelId: channelIdInput.trim() } : {}),
      })

      if (!result.success) {
        setDialogError(result.message || 'Could not save the Teams channel configuration.')
        return
      }

      setFeedback({
        projectId: dialogProject.projectId,
        type: 'success',
        message: result.message || (isNew ? 'Teams channel added.' : 'Teams channel updated.'),
      })
      setDialogProject(null)
      await refreshProjects()
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(project: ProjectTeamsChannelStatus) {
    if (!window.confirm(`Remove the Microsoft Teams channel configuration for "${project.projectName}"?`)) return
    setBusyProjectId(project.projectId)
    try {
      const result = await removeTeamsProjectChannel(project.projectId)
      if (!result.success) {
        setFeedback({ projectId: project.projectId, type: 'error', message: result.message || 'Could not remove the Teams channel.' })
        return
      }
      setFeedback({ projectId: project.projectId, type: 'success', message: 'Teams channel removed. Notifications now use the global fallback.' })
      await refreshProjects()
      router.refresh()
    } finally {
      setBusyProjectId(null)
    }
  }

  async function handleToggle(project: ProjectTeamsChannelStatus) {
    setBusyProjectId(project.projectId)
    try {
      const result = await saveTeamsProjectChannel(project.projectId, { enabled: !project.enabled })
      if (!result.success) {
        setFeedback({ projectId: project.projectId, type: 'error', message: result.message || 'Could not update the Teams channel.' })
        return
      }
      setFeedback({
        projectId: project.projectId,
        type: 'success',
        message: project.enabled ? 'Teams channel disabled.' : 'Teams channel enabled.',
      })
      await refreshProjects()
      router.refresh()
    } finally {
      setBusyProjectId(null)
    }
  }

  async function handleTest(project: ProjectTeamsChannelStatus) {
    setBusyProjectId(project.projectId)
    try {
      const result = await sendTeamsProjectTestMessage(project.projectId)
      // Message delivery and @mention delivery are reported separately — a
      // successful post does not by itself mean members were mentioned.
      const parts = [result.message || (result.success ? 'Test message delivered.' : 'Test message failed.')]
      if (result.mentionTest?.attempted) {
        parts.push(result.mentionTest.message)
      }
      setFeedback({
        projectId: project.projectId,
        type: result.success && (!result.mentionTest?.attempted || result.mentionTest.success) ? 'success' : 'error',
        message: parts.join(' '),
      })
      router.refresh()
    } finally {
      setBusyProjectId(null)
    }
  }

  function StatusBadge({ project }: { project: ProjectTeamsChannelStatus }) {
    if (!project.configured) {
      return (
        <Badge variant="outline" className="text-[11px] text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700">
          Not configured
        </Badge>
      )
    }
    if (!project.enabled) {
      return (
        <Badge variant="outline" className="text-[11px] text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15">
          Disabled
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="text-[11px] text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15">
        Enabled
      </Badge>
    )
  }

  return (
    <Card data-tour="teams-project-channels">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4" />
              Project Channels
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Route each project&apos;s Teams notifications to its own channel. Projects without a channel use the
              global webhook fallback when one is configured.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refreshProjects} disabled={refreshing} className="gap-2 shrink-0">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No projects available.</p>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <div key={project.projectId} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{project.projectName}</p>
                      <StatusBadge project={project} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span className="font-mono">{project.projectCode}</span>
                      {project.configured && project.updatedAt && (
                        <span>· Updated {new Date(project.updatedAt).toLocaleString()}</span>
                      )}
                      {project.configured && <span className="flex items-center gap-1"><Link2 className="h-3 w-3" /> Channel link stored (hidden)</span>}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {project.configured ? (
                      <>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEdit(project)} disabled={busyProjectId === project.projectId}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit Link
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleToggle(project)} disabled={busyProjectId === project.projectId}>
                          {project.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleTest(project)} disabled={busyProjectId === project.projectId || !project.enabled}>
                          {busyProjectId === project.projectId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Test
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5 text-red-600 dark:text-red-400" onClick={() => handleRemove(project)} disabled={busyProjectId === project.projectId}>
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </>
                    ) : (
                      <Button variant="default" size="sm" className="gap-1.5" onClick={() => openAdd(project)}>
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                        Add Teams Channel
                      </Button>
                    )}
                  </div>
                </div>

                {feedback?.projectId === project.projectId && (
                  <div
                    className={
                      'mt-2 flex items-start gap-2 text-xs rounded-lg px-3 py-2 ' +
                      (feedback.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300')
                    }
                  >
                    {feedback.type === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    )}
                    <span>{feedback.message}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add / Edit dialog */}
      <Dialog open={dialogProject !== null} onOpenChange={(open) => { if (!open) setDialogProject(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogProject?.configured ? 'Edit Teams Channel' : 'Add Teams Channel'}</DialogTitle>
            <DialogDescription>
              {dialogProject?.projectName}
              {dialogProject?.configured
                ? ' — the current channel link is not shown for security. Paste a new link to replace it, or just change the enabled state.'
                : ' — paste the Microsoft Teams channel webhook link for this project.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="teams-channel-link">Teams Channel Link</Label>
              <Input
                id="teams-channel-link"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder={dialogProject?.configured ? 'Leave blank to keep the current link' : 'https://…webhook.office.com/… or https://…logic.azure.com/…'}
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Must be an HTTPS Microsoft Teams webhook URL. The link is stored securely and never displayed again.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Team ID &amp; Channel ID <span className="text-muted-foreground font-normal">(optional — enables @mentions)</span></Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  id="teams-team-id"
                  autoComplete="off"
                  placeholder="Team ID"
                  value={teamIdInput}
                  onChange={(e) => setTeamIdInput(e.target.value)}
                />
                <Input
                  id="teams-channel-id"
                  autoComplete="off"
                  placeholder="Channel ID"
                  value={channelIdInput}
                  onChange={(e) => setChannelIdInput(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Only needed for real @mention notifications to channel members (via Microsoft Graph). Leave both
                blank to keep posting messages without mentions, exactly as before.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="teams-channel-enabled"
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={enabledInput}
                onChange={(e) => setEnabledInput(e.target.checked)}
              />
              <Label htmlFor="teams-channel-enabled" className="text-xs font-normal">
                Enabled — route this project&apos;s Teams notifications to this channel
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
            <Button variant="outline" onClick={() => setDialogProject(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Channel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
