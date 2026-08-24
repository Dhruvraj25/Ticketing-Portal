'use server'

import { getCurrentUser } from '@/lib/auth-utils'
import { db } from '@/lib/db'
import { attachment, user, ticket, ticketHistory } from '@/lib/db/schema'
import { and, eq, desc, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { v2 as cloudinary } from 'cloudinary'
import { wrapServerAction } from '@/lib/performance-profiler'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export interface AttachmentWithUser {
  id: number
  ticketId: number
  uploadedById: string
  uploadedByName: string
  uploadedByRole: string
  filename: string
  url: string
  publicId: string
  mimeType: string
  sizeBytes: number
  createdAt: Date
}

export const saveAttachment = wrapServerAction('saveAttachment', async function saveAttachment(data: {
  ticketId: number
  filename: string
  url: string
  publicId: string
  mimeType: string
  sizeBytes: number
}) {
  const currentUser = await getCurrentUser()

  const [saved] = await db
    .insert(attachment)
    .values({
      ticketId: data.ticketId,
      uploadedById: currentUser.id,
      filename: data.filename,
      url: data.url,
      publicId: data.publicId,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
    })
    .returning()

  // Create activity timeline entry for the upload with role information
  try {
    const roleLabel = { client: 'Client', developer: 'Developer', project_manager: 'Manager', admin: 'Admin' }[currentUser.role as string] || currentUser.role
    const fileSizeStr = data.sizeBytes >= 1024 * 1024
      ? `${(data.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(data.sizeBytes / 1024).toFixed(1)} KB`
    await db.insert(ticketHistory).values({
      ticketId: data.ticketId,
      userId: currentUser.id,
      action: 'attachment_uploaded',
      newValue: `${roleLabel} ${currentUser.name} uploaded "${data.filename}" (${fileSizeStr})`,
    })
  } catch (err) {
    // Non-critical — don't fail the upload if timeline entry fails
    console.error('[saveAttachment] Timeline entry error:', err)
  }

  revalidatePath(`/dashboard/tickets/${data.ticketId}`)
  return saved
})

export const getAttachments = wrapServerAction('getAttachments', async function getAttachments(ticketId: number): Promise<AttachmentWithUser[]> {
  const attachments = await db
    .select()
    .from(attachment)
    .where(eq(attachment.ticketId, ticketId))
    .orderBy(desc(attachment.createdAt))

  if (attachments.length === 0) return []

  const uploaderIds = [...new Set(attachments.map((a) => a.uploadedById))]
  const uploaders = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(inArray(user.id, uploaderIds))
  const uploaderMap = new Map(uploaders.map((u) => [u.id, u]))

  return attachments.map((a) => ({
    ...a,
    uploadedByName: uploaderMap.get(a.uploadedById)?.name ?? 'Unknown',
    uploadedByRole: uploaderMap.get(a.uploadedById)?.role ?? 'unknown',
  }))
})

export const deleteAttachment = wrapServerAction('deleteAttachment', async function deleteAttachment(attachmentId: number) {
  const currentUser = await getCurrentUser()

  const [record] = await db
    .select()
    .from(attachment)
    .where(eq(attachment.id, attachmentId))
    .limit(1)

  if (!record) throw new Error('Attachment not found')

  // Admins can delete any attachment; others can only delete their own
  const isAdmin = currentUser.role === 'admin'
  if (!isAdmin && record.uploadedById !== currentUser.id) {
    throw new Error('You can only delete your own attachments')
  }

  // Delete from Cloudinary
  try {
    await cloudinary.uploader.destroy(record.publicId, { resource_type: 'auto' })
  } catch (err) {
    console.error('[deleteAttachment] Cloudinary delete error:', err)
  }

  try {
    await db
      .delete(attachment)
      .where(and(eq(attachment.id, attachmentId), isAdmin ? undefined : eq(attachment.uploadedById, currentUser.id)))
  } catch (err) {
    console.error('[deleteAttachment] Database error:', err)
    throw new Error('Failed to delete the attachment. Please try again.')
  }

  revalidatePath(`/dashboard/tickets/${record.ticketId}`)
})
