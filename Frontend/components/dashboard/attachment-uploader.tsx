'use client'

import { useState, useRef, useCallback } from 'react'
import { saveAttachment, deleteAttachment } from '@/app/actions/attachments'
import type { AttachmentWithUser } from '@/app/actions/attachments'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Loader2,
  Upload,
  FileText,
  FileImage,
  File,
  Trash2,
  Download,
  Paperclip,
  X,
  ZoomIn,
  Image,
  FileSpreadsheet,
  FileArchive,
  ExternalLink,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface AttachmentUploaderProps {
  ticketId: number
  initialAttachments: AttachmentWithUser[]
  currentUserId: string
  currentUserRole?: string
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(mimeType: string, filename: string) {
  if (mimeType.startsWith('image/')) return <Image className="h-5 w-5 text-sky-500 dark:text-sky-400" />
  if (mimeType === 'application/pdf') return <FileText className="h-5 w-5 text-red-500 dark:text-red-400" />
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || filename.match(/\.(xls|xlsx|csv)$/i)) {
    return <FileSpreadsheet className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
  }
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || filename.match(/\.(zip|rar|tar|gz)$/i)) {
    return <FileArchive className="h-5 w-5 text-amber-500 dark:text-amber-400" />
  }
  if (mimeType.includes('word') || mimeType.includes('document') || filename.match(/\.(doc|docx)$/i)) {
    return <FileText className="h-5 w-5 text-blue-500 dark:text-blue-400" />
  }
  return <File className="h-5 w-5 text-muted-foreground" />
}

function getFileTypeLabel(mimeType: string, filename: string): string {
  if (mimeType.startsWith('image/')) return `Image — ${mimeType.split('/')[1].toUpperCase()}`
  if (mimeType === 'application/pdf') return 'PDF Document'
  if (mimeType.includes('spreadsheet') || filename.match(/\.(xls|xlsx|csv)$/i)) return 'Spreadsheet'
  if (mimeType.includes('zip') || filename.match(/\.(zip|rar|tar|gz)$/i)) return 'Archive'
  if (mimeType.includes('word') || filename.match(/\.(doc|docx)$/i)) return 'Word Document'
  return 'File'
}

export function AttachmentUploader({
  ticketId,
  initialAttachments,
  currentUserId,
  currentUserRole,
}: AttachmentUploaderProps) {
  const [attachments, setAttachments] = useState<AttachmentWithUser[]>(initialAttachments)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxFilename, setLightboxFilename] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    setUploadError(null)
    setUploading(true)
    setUploadProgress(0)

    try {
      // Progress simulation
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (!res.ok) {
        throw new Error(data.error ?? 'Upload failed')
      }

      const saved = await saveAttachment({
        ticketId,
        filename: data.filename,
        url: data.url,
        publicId: data.publicId,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
      })

      const newAttachment: AttachmentWithUser = {
        ...saved,
        uploadedByName: 'You',
        uploadedByRole: currentUserRole || 'unknown',
      }
      setAttachments((prev) => [newAttachment, ...prev])
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files) {
      for (let i = 0; i < files.length; i++) {
        uploadFile(files[i])
      }
    }
    e.target.value = ''
  }

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const files = e.dataTransfer.files
      if (files) {
        for (let i = 0; i < files.length; i++) {
          uploadFile(files[i])
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticketId]
  )

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await deleteAttachment(id)
      setAttachments((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  // Separate images from documents
  const imageAttachments = attachments.filter(a => a.mimeType.startsWith('image/'))
  const docAttachments = attachments.filter(a => !a.mimeType.startsWith('image/'))

  return (
    <div data-tour="ticket-uploader" className="bg-white dark:bg-slate-900 border border-border rounded-xl p-5 shadow-sm">
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

      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-primary/10">
          <Paperclip className="h-4 w-4 text-primary" />
        </div>
        <h3 className="font-semibold text-foreground text-sm">Attachments</h3>
        <span className="text-xs text-muted-foreground">({attachments.length})</span>
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          'border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer mb-4',
          dragOver
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border/50 hover:border-primary/40 hover:bg-muted/20'
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
        }}
        aria-label="Upload attachment"
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.zip,.rar,.tar,.gz,.txt"
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <div className="w-full max-w-xs">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Uploading... {uploadProgress}%</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="p-2.5 rounded-xl bg-primary/5">
              <Upload className="h-6 w-6 text-primary/60" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                <span className="text-primary font-medium">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Images, PDF, Word, Excel, ZIP — max 10 MB each
              </p>
            </div>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-4 border border-destructive/20">
          <X className="h-4 w-4 flex-shrink-0" />
          {uploadError}
        </div>
      )}

      {/* Image Gallery Grid */}
      {imageAttachments.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
            <Image className="h-3.5 w-3.5" />
            Images ({imageAttachments.length})
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {imageAttachments.map((a) => (
              <div
                key={a.id}
                className="relative group aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted/20"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt={a.filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setLightboxUrl(a.url)
                      setLightboxFilename(a.filename)
                    }}
                    className="p-1.5 rounded-full bg-white/90 dark:bg-slate-900 hover:bg-white text-foreground transition-colors"
                    aria-label={`Preview ${a.filename}`}
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={a.filename}
                    className="p-1.5 rounded-full bg-white/90 dark:bg-slate-900 hover:bg-white text-foreground transition-colors"
                    aria-label={`Download ${a.filename}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </div>
                {/* File info */}
                <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[11px] text-white truncate px-1">{a.filename}</p>
                  <p className="text-[10px] text-white/70 px-1">{formatFileSize(a.sizeBytes)}</p>
                </div>
                {/* Delete button */}
                {a.uploadedById === currentUserId && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(a.id)
                    }}
                    disabled={deletingId === a.id}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/40 hover:bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Delete ${a.filename}`}
                  >
                    {deletingId === a.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document List */}
      {docAttachments.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
            <File className="h-3.5 w-3.5" />
            Documents ({docAttachments.length})
          </p>
          <div className="space-y-2">
            {docAttachments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors group"
              >
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-muted/30 border border-border/30 flex items-center justify-center">
                  {getFileIcon(a.mimeType, a.filename)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{a.filename}</p>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground shrink-0">
                      {formatFileSize(a.sizeBytes)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {getFileTypeLabel(a.mimeType, a.filename)} &middot; {a.uploadedByName}
                    {a.uploadedByRole && a.uploadedByRole !== 'unknown' && (
                      <span className="ml-1 text-[11px] px-1 py-0.5 rounded bg-muted/40">
                        {a.uploadedByRole === 'project_manager' ? 'Manager' : a.uploadedByRole === 'admin' ? 'Admin' : a.uploadedByRole.charAt(0).toUpperCase() + a.uploadedByRole.slice(1)}
                      </span>
                    )} &middot;{' '}
                    {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={a.mimeType === 'application/pdf' ? undefined : a.filename}
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      aria-label={`Open ${a.filename}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  {a.uploadedById === currentUserId && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(a.id)}
                      disabled={deletingId === a.id}
                      aria-label={`Delete ${a.filename}`}
                    >
                      {deletingId === a.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {attachments.length === 0 && !uploading && (
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">No attachments yet. Upload files above.</p>
        </div>
      )}
    </div>
  )
}
