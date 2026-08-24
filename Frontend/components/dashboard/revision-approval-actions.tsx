'use client'

import { useState } from 'react'
import { approveRevision, rejectRevision } from '@/app/actions/revisions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, CheckCircle2, XCircle, RefreshCw, Clock, FileText } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { VALIDATION } from '@/lib/types'

interface PendingRevision {
  id: number
  revisionNumber: number
  requestedById: string
  requestedByName: string
  requestedByRole: string
  revisionNotes: string
  priority: string | null
  createdAt: Date
}

interface RevisionApprovalActionsProps {
  pendingRevisions: PendingRevision[]
  ticketId: number
}

export function RevisionApprovalActions({ pendingRevisions, ticketId }: RevisionApprovalActionsProps) {
  const [approvingId, setApprovingId] = useState<number | null>(null)
  const [rejectDialogId, setRejectDialogId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleApprove(revisionId: number) {
    setError(null)
    setApprovingId(revisionId)
    try {
      await approveRevision(revisionId)
      toast.success('Revision approved successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to approve revision'
      setError(msg)
      toast.error(msg)
    } finally {
      setApprovingId(null)
    }
  }

  async function handleReject() {
    if (!rejectDialogId || !rejectReason.trim()) return
    setError(null)
    setRejecting(true)
    try {
      await rejectRevision(rejectDialogId, rejectReason.trim())
      setRejectDialogId(null)
      setRejectReason('')
      toast.success('Revision rejected')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reject revision'
      setError(msg)
      toast.error(msg)
    } finally {
      setRejecting(false)
    }
  }

  if (pendingRevisions.length === 0) return null

  return (
    <>
      <Card data-tour="ticket-revision-approval-card" className="p-5 bg-white dark:bg-slate-900 border-orange-500/30">
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw className="h-4 w-4 text-orange-500 dark:text-orange-400" />
          <h3 className="font-semibold text-foreground">Revision Approval</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {pendingRevisions.length} revision{pendingRevisions.length !== 1 ? 's' : ''} pending your review.
        </p>

        <div className="space-y-4">
          {pendingRevisions.map((rev) => (
            <div
              key={rev.id}
              className="rounded-lg border border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/15/40 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">
                    Revision #{rev.revisionNumber}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30">
                    {rev.requestedByName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({rev.requestedByRole === 'project_manager' ? 'Manager' : rev.requestedByRole === 'admin' ? 'Admin' : 'Client'})
                  </span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(rev.createdAt), { addSuffix: true })}
                </span>
              </div>

              <div className="flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {rev.revisionNotes}
                </p>
              </div>

              {rev.priority && (
                <span className="inline-flex text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                  Priority: {rev.priority}
                </span>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={() => handleApprove(rev.id)}
                  disabled={approvingId === rev.id || rejectDialogId === rev.id}
                  size="sm"
                  className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {approvingId === rev.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Approve Revision
                </Button>
                <Button
                  onClick={() => setRejectDialogId(rev.id)}
                  disabled={approvingId === rev.id || rejectDialogId === rev.id}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
      </Card>

      {/* Reject Revision Dialog */}
      <Dialog open={rejectDialogId !== null} onOpenChange={(open) => { if (!open) { setRejectDialogId(null); setRejectReason('') }}}>
        <DialogContent className="bg-card border-border/50">
          <DialogHeader>
            <DialogTitle>Reject Revision</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Provide a reason for rejecting this revision. The ticket will be sent back for further review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-revision-reason">Reason</Label>
            <Textarea
              id="reject-revision-reason"
              placeholder="Explain why this revision is being rejected..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              maxLength={VALIDATION.REJECT_REASON_MAX_LENGTH}
              className="bg-input/50 border-border/50 resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {rejectReason.length}/{VALIDATION.REJECT_REASON_MAX_LENGTH}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setRejectDialogId(null); setRejectReason('') }}
              disabled={rejecting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={rejecting || !rejectReason.trim()}
              className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {rejecting && <Loader2 className="h-4 w-4 animate-spin" />}
              Reject Revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
