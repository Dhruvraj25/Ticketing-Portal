// @ts-nocheck
'use server'

import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { db } from '@/lib/db'
import { comment, ticketHistory, user } from '@/lib/db/schema'
import { eq, and, desc, count } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { VALIDATION, validateField } from '@/lib/types'
import type { UserRole } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'

const DEFAULT_COMMENT_LIMIT = 20

export const addComment = wrapServerAction('addComment', async function addComment(ticketId: number, content: string, isInternal: boolean = false) {
  const currentUser = await getUser()

  const commentErr = validateField(content, VALIDATION.COMMENT_MAX_LENGTH, 'Comment')
  if (commentErr) throw new Error(commentErr)
  if (currentUser.role === 'client' && isInternal) throw new Error('Clients cannot add internal comments')

  const [newComment] = await db.insert(comment).values({
    ticketId, userId: currentUser.id, content, isInternal,
  }).returning()

  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id,
    action: isInternal ? 'internal_comment_added' : 'comment_added',
    newValue: content.substring(0, 200),
  })

  revalidatePath(`/dashboard/tickets/${ticketId}`)
  return newComment
})

export const getComments = wrapServerAction('getComments', async function getComments(ticketId: number, limit: number = DEFAULT_COMMENT_LIMIT, offset: number = 0) {
  const currentUser = await getUser()

  const conditions: any[] = [eq(comment.ticketId, ticketId)]
  if (currentUser.role === 'client') {
    conditions.push(eq(comment.isInternal, false))
  }

  const result = await db
    .select({
      id: comment.id, ticketId: comment.ticketId, userId: comment.userId,
      content: comment.content, isInternal: comment.isInternal,
      createdAt: comment.createdAt, updatedAt: comment.updatedAt,
      userName: user.name, userRole: user.role, userAvatarUrl: user.avatarUrl,
    })
    .from(comment)
    .leftJoin(user, eq(comment.userId, user.id))
    .where(and(...conditions))
    .orderBy(desc(comment.createdAt))
    .limit(limit)
    .offset(offset)

  return result.map((c) => ({
    ...c,
    userName: c.userName ?? 'Unknown',
    userRole: (c.userRole || 'client') as UserRole,
    userAvatarUrl: c.userAvatarUrl ?? undefined,
  }))
})

export const getCommentsCount = wrapServerAction('getCommentsCount', async function getCommentsCount(ticketId: number) {
  const currentUser = await getUser()
  const conditions: any[] = [eq(comment.ticketId, ticketId)]
  if (currentUser.role === 'client') {
    conditions.push(eq(comment.isInternal, false))
  }
  const [result] = await db.select({ count: count() }).from(comment).where(and(...conditions))
  return Number(result?.count) || 0
})
