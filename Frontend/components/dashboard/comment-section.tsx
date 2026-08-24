'use client'

import { useState, useRef, useCallback, memo } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { addComment } from '@/app/actions/tickets'
import { saveAttachment } from '@/app/actions/attachments'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import {
  MessageSquare,
  Send,
  Loader2,
  Lock,
  Paperclip,
  FileImage,
  FileText,
  File,
  X,
  ZoomIn,
  Download,
} from 'lucide-react'
import type { CommentWithUser, UserRole } from '@/lib/types'
import { USER_ROLE_CONFIG, VALIDATION } from '@/lib/types'
import type { AttachmentWithUser } from '@/app/actions/attachments'

interface CommentSectionProps {
  ticketId: number
  comments: CommentWithUser[]
  userRole: UserRole
  attachments?: AttachmentWithUser[]
  currentUserId?: string
  maxHeight?: string
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <FileImage className="h-4 w-4 text-sky-400" />
  if (mimeType === 'application/pdf') return <FileText className="h-4 w-4 text-red-400" />
  return <File className="h-4 w-4 text-muted-foreground" />
}

function getFileTypeLabel(mimeType: string, filename: string): string {
  if (mimeType.startsWith('image/')) return 'Image'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.includes('spreadsheet') || filename.match(/\.(xls|xlsx|csv)$/i)) return 'Spreadsheet'
  if (mimeType.includes('zip') || filename.match(/\.(zip|rar|tar|gz)$/i)) return 'Archive'
  if (mimeType.includes('word') || filename.match(/\.(doc|docx)$/i)) return 'Document'
  return 'File'
}

export const CommentSection = memo(function CommentSection({
  ticketId,
  comments,
  userRole,
  attachments = [],
  currentUserId,
  maxHeight = '500px',
}: CommentSectionProps) {
  const router = useRouter()
  const [content, setContent] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxFilename, setLightboxFilename] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const commentsListRef = useRef<HTMLDivElement>(null)

  const canAddInternalComments = userRole !== 'client'

  const handleFileUpload = useCallback(
    async (file: File) => {
      setUploadingFiles(true)
      setError(null)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Upload failed')
        await saveAttachment({
          ticketId,
          filename: data.filename,
          url: data.url,
          publicId: data.publicId,
          mimeType: data.mimeType,
          sizeBytes: data.sizeBytes,
        })
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploadingFiles(false)
      }
    },
    [ticketId, router]
  )

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
    e.target.value = ''
  }, [handleFileUpload])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setError(null)
    setLoading(true)
    try {
      await addComment(ticketId, content, isInternal)
      setContent('')
      setIsInternal(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment')
    } finally {
      setLoading(false)
    }
  }, [content, isInternal, ticketId, router])

  const imageAttachments = attachments.filter((a) => a.mimeType.startsWith('image/'))
  const docAttachments = attachments.filter((a) => !a.mimeType.startsWith('image/'))

  return (
    <div data-tour="ticket-comments" className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm">
      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Preview: ${lightboxFilename}`}
        >
          <div
            className="relative max-w-5xl max-h-[92vh] rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt={lightboxFilename}
              className="max-w-full max-h-[85vh] object-contain block"
            />
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
              <p className="text-sm text-white font-medium truncate">{lightboxFilename}</p>
            </div>
            <button
              type="button"
              className="absolute top-3 right-3 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors text-white"
              onClick={() => setLightboxUrl(null)}
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-5 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <MessageSquare className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground text-sm">Comments</h3>
          <span className="text-xs text-muted-foreground">({comments.length})</span>
          {attachments.length > 0 && (
            <>
              <span className="text-muted-foreground/30 mx-0.5">|</span>
              <Paperclip className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{attachments.length}</span>
            </>
          )}
        </div>

        {/* Comment Form */}
        <form onSubmit={handleSubmit} className="mt-4">
          <div className="space-y-1">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add a comment... Attach files using the button below."
              rows={2}
              maxLength={VALIDATION.COMMENT_MAX_LENGTH}
              className="rounded-xl bg-input/50 border-border/50 resize-none mb-1 text-sm"
            />
            <p className="text-xs text-muted-foreground text-right">
              {content.length}/{VALIDATION.COMMENT_MAX_LENGTH}
            </p>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {canAddInternalComments && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="internal"
                    checked={isInternal}
                    onCheckedChange={(checked) => setIsInternal(checked as boolean)}
                    className="rounded"
                  />
                  <Label htmlFor="internal" className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer">
                    <Lock className="h-3 w-3" />
                    Internal note
                  </Label>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-lg text-xs text-muted-foreground hover:text-foreground h-8"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFiles}
                aria-label="Attach file"
              >
                {uploadingFiles ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5" />
                )}
                <span className="ml-1">Attach</span>
              </Button>
            </div>
            <Button type="submit" disabled={loading || !content.trim()} size="sm" className="rounded-lg h-8 text-xs">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-1" />Send</>}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        </form>
      </div>

      {/* Comments List - Independent Scroll */}
      <div
        ref={commentsListRef}
        className="overflow-y-auto overscroll-behavior-contain scroll-smooth"
        style={{ maxHeight }}
      >
        <div className="p-5 space-y-3">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No comments yet. Be the first to comment!</p>
          ) : (
            comments.map((comment, i) => (
              <div
                key={comment.id}
                className={cn(
                  'p-3.5 rounded-lg border',
                  comment.isInternal
                    ? 'bg-amber-500/5 border-amber-500/20'
                    : 'bg-muted/20 border-border/40'
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className="h-6 w-6 min-w-[24px] rounded-md bg-accent flex items-center justify-center shrink-0 overflow-hidden relative">
                    {comment.userAvatarUrl ? (
                      <Image src={comment.userAvatarUrl} alt={comment.userName} fill className="object-cover" />
                    ) : (
                      <span className="text-[10px] font-semibold text-foreground">
                        {comment.userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="text-xs font-medium text-foreground">{comment.userName}</span>
                      <span className={cn('text-[11px] px-1 py-0.5 rounded', USER_ROLE_CONFIG[comment.userRole]?.color || 'bg-gray-50 dark:bg-slate-800/50 text-gray-500')}>
                        {USER_ROLE_CONFIG[comment.userRole]?.label || comment.userRole}
                      </span>
                      {comment.isInternal && (
                        <span className="text-[11px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                          <Lock className="h-2.5 w-2.5" />
                          Internal
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {comment.content}
                    </p>
                    {/* Attachments near this comment */}
                    {(() => {
                      const nearbyAttachments = attachments.filter((a) => {
                        const commentTime = new Date(comment.createdAt).getTime()
                        const attachTime = new Date(a.createdAt).getTime()
                        return Math.abs(attachTime - commentTime) < 2 * 60 * 1000
                      })
                      if (nearbyAttachments.length === 0) return null
                      return (
                        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/20">
                          {nearbyAttachments.map((a) => (
                            <a
                              key={a.id}
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted/30 border border-border/20 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            >
                              {a.mimeType.startsWith('image/') ? (
                                <div className="w-4 h-4 rounded overflow-hidden border border-border/30 shrink-0">
                                  <Image src={a.url} alt={a.filename} width={16} height={16} className="w-full h-full object-cover" />
                                </div>
                              ) : (
                                <FileIcon mimeType={a.mimeType} />
                              )}
                              <span className="truncate max-w-[80px]">{a.filename}</span>
                              <Download className="h-2.5 w-2.5 shrink-0" />
                            </a>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
})
