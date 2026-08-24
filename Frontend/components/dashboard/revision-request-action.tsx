'use client'

import { useState, useRef } from 'react'
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
import { Loader2, RefreshCw, Upload } from 'lucide-react'
import { VALIDATION } from '@/lib/types'

interface RevisionRequestActionProps {
  ticketId: number
  ticketNumber?: string
  revisionCount?: number
}

export function RevisionRequestAction({ ticketId, ticketNumber, revisionCount = 0 }: RevisionRequestActionProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Revision dialog
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false)
  const [revisionNotes, setRevisionNotes] = useState('')
  const [revisionPriority, setRevisionPriority] = useState('')
  const [revisionAttachmentIds, setRevisionAttachmentIds] = useState<number[]>([])
  const [revisionUploadedFiles, setRevisionUploadedFiles] = useState<string[]>([])
  const [revisionUploading, setRevisionUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleRequestRevision() {
    if (!revisionNotes.trim()) return
    setError(null)
    setLoading(true)
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
      setLoading(false)
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
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
        // Save as ticket attachment and collect the ID
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
  }

  function removeFile(index: number) {
    setRevisionAttachmentIds(prev => prev.filter((_, i) => i !== index))
    setRevisionUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <>
      <Card data-tour="ticket-revision-request" className="p-5 bg-white dark:bg-slate-900 border-orange-500/30">
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw className="h-4 w-4 text-orange-500 dark:text-orange-400" />
          <h3 className="font-semibold text-foreground">Request For Revision</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Request a revision if additional changes are required. The ticket will be returned to the assigned resource for further work.
        </p>
        {revisionCount > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2 mb-4">
            This ticket has {revisionCount} Revision request{revisionCount !== 1 ? 's' : ''}.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setRevisionDialogOpen(true)}
            disabled={loading}
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
            <DialogTitle>Request For Revision #{revisionCount + 1}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Request a revision if additional changes are required. The ticket will be returned to the assigned resource for further work.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="revision-notes">Request For Revision Reason *</Label>
              <Textarea
                id="revision-notes"
                placeholder="QA issues, missing requirements, testing failures, internal review feedback..."
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                rows={4}
                maxLength={VALIDATION.REVISION_NOTES_MAX_LENGTH}
                className="bg-input/50 border-border/50 resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">
                {revisionNotes.length}/{VALIDATION.REVISION_NOTES_MAX_LENGTH}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="revision-priority">Priority (Optional)</Label>
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
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  multiple
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={revisionUploading || loading}
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
                        onClick={() => removeFile(idx)}
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
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRequestRevision}
              disabled={loading || !revisionNotes.trim()}
              className="gap-2 bg-orange-600 text-white hover:bg-orange-700"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Request For Revision
          </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
