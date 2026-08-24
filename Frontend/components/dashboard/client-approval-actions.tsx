'use client'

import { useState, useRef } from 'react'
import { clientApproveTicket, clientReopenTicket } from '@/app/actions/tickets'
import { requestRevision } from '@/app/actions/revisions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, CheckCircle2, XCircle, RotateCcw, ClipboardCheck, RefreshCw, Upload } from 'lucide-react'
import { TicketStatus } from '@/lib/types'

interface ClientApprovalActionsProps {
  ticketId: number
  currentStatus: TicketStatus
  revisionCount?: number
  closedAt?: Date | string | null
}

export function ClientApprovalActions({ ticketId, currentStatus, revisionCount = 0, closedAt }: ClientApprovalActionsProps) {
  const [loading, setLoading] = useState<'approve' | 'reject' | 'reopen' | 'revision' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reopen dialog
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')

  // Revision dialog
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false)
  const [revisionNotes, setRevisionNotes] = useState('')
  const [revisionPriority, setRevisionPriority] = useState('')
  const [revisionAttachmentIds, setRevisionAttachmentIds] = useState<number[]>([])
  const [revisionUploadedFiles, setRevisionUploadedFiles] = useState<string[]>([])
  const [revisionUploading, setRevisionUploading] = useState(false)
  const revisionFileInputRef = useRef<HTMLInputElement>(null)

  async function handleApprove() {
    setError(null)
    setLoading('approve')
    try {
      await clientApproveTicket(ticketId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve ticket')
    } finally {
      setLoading(null)
    }
  }

  async function handleReopen() {
    if (!reopenReason.trim()) return
    setError(null)
    setLoading('reopen')
    try {
      await clientReopenTicket(ticketId, reopenReason.trim())
      setReopenDialogOpen(false)
      setReopenReason('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen ticket')
    } finally {
      setLoading(null)
    }
  }

  async function handleRequestRevision() {
    if (!revisionNotes.trim()) return
    setError(null)
    setLoading('revision')
    try {
      await requestRevision({
        ticketId,
        revisionNotes: revisionNotes.trim(),
        priority: revisionPriority || null,
        attachmentIds: revisionAttachmentIds.length > 0 ? revisionAttachmentIds : null,
      })
      setRevisionDialogOpen(false)
      setRevisionNotes('')
      setRevisionPriority('')
      setRevisionAttachmentIds([])
      setRevisionUploadedFiles([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request revision')
    } finally {
      setLoading(null)
    }
  }

  if (currentStatus === TicketStatus.CLIENT_REVIEW) {
    return (
      <>
        <Card data-tour="ticket-client-approval" className="p-5 bg-white dark:bg-slate-900 border-sky-500/30">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardCheck className="h-4 w-4 text-sky-400" />
            <h3 className="font-semibold text-foreground">Your Approval Required</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            The team has resolved this ticket. Please review the result and choose an action below.
          </p>
          {revisionCount > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2 mb-4">
              This ticket has {revisionCount} Revision request{revisionCount !== 1 ? 's' : ''}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleApprove}
              disabled={loading !== null}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {loading === 'approve' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Approve & Complete
            </Button>
            <Button
              onClick={() => setRevisionDialogOpen(true)}
              disabled={loading !== null}
              variant="outline"
              className="gap-2 border-orange-500/50 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10"
            >
              <RefreshCw className="h-4 w-4" />Request For Revision</Button>

          </div>
          {error && <p className="text-sm text-destructive mt-3">{error}</p>}
        </Card>

        {/* Revision Dialog */}
        <Dialog open={revisionDialogOpen} onOpenChange={setRevisionDialogOpen}>
          <DialogContent className="bg-card border-border/50 sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Request For Revision #{revisionCount + 1}</DialogTitle><DialogDescription className="text-muted-foreground">
              Request a revision if additional changes are required. The ticket will be returned to the assigned resource for further work.
            </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="revision-notes">Request For Revision Notes *</Label>
                <Textarea
                  id="revision-notes"
                  placeholder="Describe what needs to be changed or fixed..."
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  rows={4}
                  className="bg-input/50 border-border/50 resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="revision-priority">Priority</Label>
                <Select value={revisionPriority} onValueChange={setRevisionPriority}>
                  <SelectTrigger id="revision-priority" className="bg-input/50 border-border/50">
                    <SelectValue placeholder="Select priority..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border/50">
                    <SelectItem value="low">LOW</SelectItem>
                    <SelectItem value="medium">MEDIUM</SelectItem>
                    <SelectItem value="high">HIGH</SelectItem>
                    <SelectItem value="urgent">URGENT</SelectItem>
                    <SelectItem value="critical">CRITICAL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Attachments (Optional)</Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={revisionFileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    onChange={async (e) => {
                      const files = e.target.files
                      if (!files) return
                      setRevisionUploading(true)
                      for (let i = 0; i < files.length; i++) {
                        const file = files[i]
                        try {
                          const formData = new FormData()
                          formData.append('file', file)
                          const res = await fetch('/api/upload', { method: 'POST', body: formData })
                          const data = await res.json()
                          if (!res.ok) throw new Error(data.error ?? 'Upload failed')
                          const { saveAttachment } = await import('@/app/actions/attachments')
                          const saved = await saveAttachment({
                            ticketId,
                            filename: data.filename,
                            url: data.url,
                            publicId: data.publicId,
                            mimeType: data.mimeType,
                            sizeBytes: data.sizeBytes,
                          })
                          if (saved?.id) {
                            setRevisionAttachmentIds(prev => [...prev, saved.id])
                          }
                          setRevisionUploadedFiles(prev => [...prev, data.filename])
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Failed to upload file')
                        }
                      }
                      setRevisionUploading(false)
                      e.target.value = ''
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => revisionFileInputRef.current?.click()}
                    disabled={revisionUploading || loading === 'revision'}
                    className="gap-2"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {revisionUploading ? 'Uploading...' : 'Add Files'}
                  </Button>
                </div>
                {revisionUploadedFiles.length > 0 && (
                  <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto">
                    {revisionUploadedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-2.5 py-1.5">
                        <span className="flex-1 truncate">{file}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setRevisionAttachmentIds(prev => prev.filter((_, i) => i !== idx))
                            setRevisionUploadedFiles(prev => prev.filter((_, i) => i !== idx))
                          }}
                          className="p-0.5 rounded hover:bg-muted/50 transition-colors shrink-0"
                          aria-label={`Remove ${file}`}
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setRevisionDialogOpen(false)
                  setRevisionNotes('')
                  setRevisionPriority('')
                  setRevisionAttachmentIds([])
                  setRevisionUploadedFiles([])
                }}
                disabled={loading === 'revision'}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRequestRevision}
                disabled={loading === 'revision' || !revisionNotes.trim()}
                className="gap-2 bg-orange-600 text-white hover:bg-orange-700"
              >
                {loading === 'revision' && <Loader2 className="h-4 w-4 animate-spin" />}Request For Revision
                </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  if (currentStatus === TicketStatus.CLOSED) {
    // Check 7-day reopen window
    let canReopen = true
    let daysSinceClosed = 0
    if (closedAt) {
      daysSinceClosed = Math.floor((Date.now() - new Date(closedAt).getTime()) / (1000 * 60 * 60 * 24))
      if (daysSinceClosed >= 7) {
        canReopen = false
      }
    }

    return (
      <>
        <Card data-tour="ticket-closed-card" className="p-5 bg-white dark:bg-slate-900 border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">Ticket Closed</h3>
          </div>
          {canReopen ? (
            <>
              <p className="text-xs text-muted-foreground mb-4">
                This ticket has been closed. If you encounter the same issue again, you can reopen it within 7 days.
                {daysSinceClosed > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 block mt-1">
                    {7 - daysSinceClosed} day{7 - daysSinceClosed !== 1 ? 's' : ''} remaining to reopen.
                  </span>
                )}
              </p>            <Button
              onClick={() => setReopenDialogOpen(true)}
              disabled={loading !== null}
              variant="outline"
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
                Reopen Request
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                This ticket was closed more than 7 days ago and can no longer be reopened.
              </p>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 p-4">
                <p className="text-sm font-medium text-amber-800">Please create a new ticket</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  If you are still experiencing this issue or have a new related request, please submit a new ticket.
                </p>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive mt-3">{error}</p>}
        </Card>

        {/* Reopen Dialog */}
        <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
          <DialogContent className="bg-card border-border/50">
            <DialogHeader>
              <DialogTitle>Reopen Request</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Briefly describe why you are reopening this ticket.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="reopen-reason">Reason</Label>
              <Textarea
                id="reopen-reason"
                placeholder="e.g., The issue has returned after the latest update..."
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                rows={3}
                className="bg-input/50 border-border/50 resize-none"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setReopenDialogOpen(false)
                  setReopenReason('')
                }}
                disabled={loading === 'reopen'}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReopen}
                disabled={loading === 'reopen' || !reopenReason.trim()}
                className="gap-2"
              >
                {loading === 'reopen' && <Loader2 className="h-4 w-4 animate-spin" />}
                Reopen Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return null
}
