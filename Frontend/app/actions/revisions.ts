// @ts-nocheck
'use server'

import { cache } from 'react'
import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { getPortalUrl } from '@/lib/urls'
import { db } from '@/lib/db'
import { ticket, ticketHistory, user, project, revisionHistory } from '@/lib/db/schema'
import { and, eq, desc, sql, isNull, isNotNull, inArray, count, gte, or } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { UserRole } from '@/lib/types'
import { dispatchNotification } from '@/lib/notify-all'
import { VALIDATION, validateField } from '@/lib/types'
import type { RevisionHistory, RevisionHistoryWithAttachments, TicketStatus, TicketPriority, TicketCategory } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'

// ============================================================================
// REVISION ACTIONS
// ============================================================================

export const approveRevision = wrapServerAction('approveRevision', async function approveRevision(revisionHistoryId: number) {
  const currentUser = await getUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only managers and admins can approve revisions')
  }

  const [rev] = await db
    .select({
      id: revisionHistory.id,
      ticketId: revisionHistory.ticketId,
      revisionNumber: revisionHistory.revisionNumber,
      status: revisionHistory.status,
      requestedById: revisionHistory.requestedById,
    })
    .from(revisionHistory)
    .where(eq(revisionHistory.id, revisionHistoryId))
    .limit(1)

  if (!rev) throw new Error('Revision not found')
  if (rev.status !== 'pending' && rev.status !== 'pending_approval') throw new Error('Revision is not pending approval')

  const [t] = await db.select().from(ticket).where(eq(ticket.id, rev.ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')

  await db.transaction(async (tx) => {
    // Update revision history status to approved
    await tx
      .update(revisionHistory)
      .set({
        status: 'approved',
        reviewedById: currentUser.id,
        reviewedByName: currentUser.name,
        reviewedAt: new Date(),
      })
      .where(eq(revisionHistory.id, revisionHistoryId))

    // Update ticket status to in_progress so developer can work on it
    // Also revert resolvedAt to null since we're reopening for work
    await tx
      .update(ticket)
      .set({ status: 'in_progress', resolvedAt: null, updatedAt: new Date() })
      .where(eq(ticket.id, rev.ticketId))

    // Log activity
    await tx.insert(ticketHistory).values({
      ticketId: rev.ticketId,
      userId: currentUser.id,
      action: 'revision_approved',
      newValue: `Revision #${rev.revisionNumber} approved by ${currentUser.name}`,
    })
  })

  // Notify the requester (In-App + Email + Teams) that revision was approved
  const ticketLink = getPortalUrl() + '/dashboard/tickets/' + rev.ticketId
  const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = [
    {
      userId: rev.requestedById,
      inApp: {
        title: `Revision #${rev.revisionNumber} Approved`,
        message: `Your requested revision #${rev.revisionNumber} for ticket #${t.ticketNumber} has been approved by ${currentUser.name}.`,
        link: `/dashboard/tickets/${rev.ticketId}`,
        ticketId: rev.ticketId,
      },
      email: {
        templateData: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          revisionNumber: rev.revisionNumber,
          approvedBy: currentUser.name,
          ticketLink,
        },
      },
      teams: {
        payload: {
          ticketNumber: t.ticketNumber, ticketTitle: t.title,
          revisionNumber: rev.revisionNumber, approvedBy: currentUser.name,
        },
      },
    },
  ]

  // Notify the assigned developer (In-App + Email + Teams)
  if (t.assignedToId && t.assignedToId !== rev.requestedById) {
    recipients.push({
      userId: t.assignedToId,
      inApp: {
        title: `Revision #${rev.revisionNumber} Approved`,
        message: `Revision #${rev.revisionNumber} for ticket #${t.ticketNumber} has been approved. The ticket is now in progress.`,
        link: `/dashboard/tickets/${rev.ticketId}`,
        ticketId: rev.ticketId,
      },
      email: {
        templateData: {
          ticketNumber: t.ticketNumber, ticketTitle: t.title,
          revisionNumber: rev.revisionNumber, approvedBy: currentUser.name,
          ticketLink,
        },
      },
      teams: {
        payload: {
          ticketNumber: t.ticketNumber, ticketTitle: t.title,
          revisionNumber: rev.revisionNumber, approvedBy: currentUser.name,
        },
      },
    })
  }

  await dispatchNotification({
    eventType: 'revision_approved',
    triggeredBy: currentUser.id,
    dedup: { scope: `revision:${rev.id}` },
    recipients,
  })

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${rev.ticketId}`)
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })
})

export const rejectRevision = wrapServerAction('rejectRevision', async function rejectRevision(revisionHistoryId: number, reason: string) {
  const currentUser = await getUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only managers and admins can reject revisions')
  }

  // Validation
  const reasonErr = validateField(reason, VALIDATION.REJECT_REASON_MAX_LENGTH, 'Rejection reason')
  if (reasonErr) throw new Error(reasonErr)

  const [rev] = await db
    .select({
      id: revisionHistory.id,
      ticketId: revisionHistory.ticketId,
      revisionNumber: revisionHistory.revisionNumber,
      status: revisionHistory.status,
      requestedById: revisionHistory.requestedById,
    })
    .from(revisionHistory)
    .where(eq(revisionHistory.id, revisionHistoryId))
    .limit(1)

  if (!rev) throw new Error('Revision not found')
  if (rev.status !== 'pending' && rev.status !== 'pending_approval') throw new Error('Revision is not pending approval')

  const [t] = await db.select().from(ticket).where(eq(ticket.id, rev.ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')

  await db.transaction(async (tx) => {
    // Update revision history status to rejected
    await tx
      .update(revisionHistory)
      .set({
        status: 'rejected',
        reviewedById: currentUser.id,
        reviewedByName: currentUser.name,
        reviewedAt: new Date(),
        rejectionReason: reason,
      })
      .where(eq(revisionHistory.id, revisionHistoryId))

    // Send ticket back to client_review so client can take another action
    await tx
      .update(ticket)
      .set({ status: 'client_review', updatedAt: new Date() })
      .where(eq(ticket.id, rev.ticketId))

    // Log activity
    await tx.insert(ticketHistory).values({
      ticketId: rev.ticketId,
      userId: currentUser.id,
      action: 'revision_rejected',
      newValue: `Revision #${rev.revisionNumber} rejected by ${currentUser.name}: ${reason}`,
    })
  })

  // Notify the requester (In-App + Email + Teams) that revision was rejected
  const ticketLink = getPortalUrl() + '/dashboard/tickets/' + rev.ticketId
  await dispatchNotification({
    eventType: 'revision_rejected',
    triggeredBy: currentUser.id,
    dedup: { scope: `revision:${rev.id}` },
    recipients: [
      {
        userId: rev.requestedById,
        inApp: {
          title: `Revision #${rev.revisionNumber} Rejected`,
          message: `Your requested revision #${rev.revisionNumber} for ticket #${t.ticketNumber} was rejected by ${currentUser.name}: ${reason}`,
          link: `/dashboard/tickets/${rev.ticketId}`,
          ticketId: rev.ticketId,
        },
        email: {
          templateData: {
            ticketNumber: t.ticketNumber, ticketTitle: t.title,
            revisionNumber: rev.revisionNumber, rejectionReason: reason,
            ticketLink,
          },
        },
        teams: {
          payload: {
            ticketNumber: t.ticketNumber, ticketTitle: t.title,
            revisionNumber: rev.revisionNumber, rejectionReason: reason,
          },
        },
      },
    ],
  })

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${rev.ticketId}`)
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })
})

export const requestRevision = wrapServerAction('requestRevision', async function requestRevision(data: {
  ticketId: number
  revisionNotes: string
  priority?: string | null
  attachmentIds?: number[] | null
}) {
  const currentUser = await getUser()

  if (currentUser.role === 'developer') {
    throw new Error('Developers cannot request revisions')
  }

  // Validation
  const notesErr = validateField(data.revisionNotes, VALIDATION.REVISION_NOTES_MAX_LENGTH, 'Revision notes')
  if (notesErr) throw new Error(notesErr)

  const [t] = await db.select().from(ticket).where(eq(ticket.id, data.ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')

  // Managers and admins can request revision on any ticket — no status restrictions
  // Clients can only request revision when the ticket is in client_review status
  if (currentUser.role === 'client') {
    if (t.status !== 'client_review') {
      throw new Error('Client can only request revision when ticket is awaiting your approval')
    }
    if (t.clientId !== currentUser.id) {
      throw new Error('Access denied')
    }
  }

  // Calculate next revision number
  const newRevisionNumber = (t.revisionCount || 0) + 1

  // Execute all operations inside a SINGLE TRANSACTION to ensure atomicity
  const result = await db.transaction(async (tx) => {
    const ticketUpdate: Record<string, unknown> = {
      revisionCount: newRevisionNumber,
      updatedAt: new Date(),
    }

    if (currentUser.role !== 'client') {
      // Manager/admin rework — the completed work is sent back to the resource.
      // This is its OWN status (R18): "Rework", never merged with the client's
      // "Requested for Revision" ('request_for_revision') state.
      ticketUpdate.status = 'rework'
      ticketUpdate.resolvedAt = null
    } else {
      // Client requested a revision — surface it as "Requested for Revision"
      // (R18) while the manager/admin decides. The revision record stays
      // 'pending_approval' until approved (→ in_progress) or rejected
      // (→ back to client_review).
      ticketUpdate.status = 'request_for_revision'
      ticketUpdate.resolvedAt = null
    }
    
    await tx
      .update(ticket)
      .set(ticketUpdate)
      .where(eq(ticket.id, data.ticketId))

    // Insert revision history record
    const [revision] = await tx
      .insert(revisionHistory)
      .values({
        ticketId: data.ticketId,
        revisionNumber: newRevisionNumber,
        requestedById: currentUser.id,
        requestedByName: currentUser.name,
        requestedByRole: currentUser.role,
        revisionNotes: data.revisionNotes,
        priority: data.priority || null,
        attachmentIds: data.attachmentIds || null,
        status: currentUser.role === 'client' ? 'pending_approval' : 'pending',
      })
      .returning()

    // Log to activity history
    const actionLabel = currentUser.role === 'client'
      ? 'Revision requested by client (pending manager approval)'
      : `Sent back for rework by ${currentUser.role === 'project_manager' ? 'manager' : 'admin'}`
    await tx.insert(ticketHistory).values({
      ticketId: data.ticketId,
      userId: currentUser.id,
      action: 'revision_requested',
      newValue: `${actionLabel}: #${newRevisionNumber}: ${data.revisionNotes.substring(0, 200)}`,
    })

    return { revision, newRevisionNumber }
  })    // Notifications run outside the transaction
  if (currentUser.role === 'client') {
    // Client requested revision — notify manager/admin for approval
    const [p] = await db
      .select({ managerId: project.managerId, projectName: project.projectName })
      .from(project)
      .where(eq(project.id, t.projectId!))
      .limit(1)
    const ticketLink = getPortalUrl() + '/dashboard/tickets/' + data.ticketId
    const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = []
    if (p) {
      recipients.push({
        userId: p.managerId,
        channels: ['inApp'],
        inApp: {
          title: `Revision Request #${newRevisionNumber} - Approval Required`,
          message: `Client requested Revision #${newRevisionNumber} for ticket #${t.ticketNumber}: ${data.revisionNotes.substring(0, 100)}. Review and approve this request.`,
          link: `/dashboard/tickets/${data.ticketId}`,
          ticketId: data.ticketId,
        },
      })
    }

    // Notify the assigned developer (In-App + Email + Teams)
    if (t.assignedToId) {
      recipients.push({
        userId: t.assignedToId,
        inApp: {
          title: `Revision Request #${newRevisionNumber} - Approval Required`,
          message: `Client requested Revision #${newRevisionNumber} for ticket #${t.ticketNumber}.`,
          link: `/dashboard/tickets/${data.ticketId}`,
          ticketId: data.ticketId,
        },
        email: {
          eventType: 'revision_requested',
          templateData: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            requestedByName: currentUser.name || currentUser.id,
            revisionNotes: data.revisionNotes,
            ticketLink,
          },
        },
        teams: {
          payload: {
            ticketNumber: t.ticketNumber, ticketTitle: t.title,
            requestedByName: currentUser.name || currentUser.id,
            revisionNotes: data.revisionNotes,
          },
        },
      })
    }
    // Notify admins (in-app)
    const admins = await db.select({ id: user.id }).from(user).where(eq(user.role, 'admin'))
    for (const admin of admins) {
      recipients.push({
        userId: admin.id,
        channels: ['inApp'],
        inApp: {
          title: `Revision Request #${newRevisionNumber} - Approval Required`,
          message: `Client requested Revision #${newRevisionNumber} for ticket #${t.ticketNumber}. Review and approve this request.`,
          link: `/dashboard/tickets/${data.ticketId}`,
          ticketId: data.ticketId,
        },
      })
    }

    await dispatchNotification({
      eventType: 'revision_requested',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${data.ticketId}` },
      recipients,
    })
  } else {
    // Manager or admin rework — notify the assigned developer and client
    const ticketLink = getPortalUrl() + '/dashboard/tickets/' + data.ticketId
    const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = [
      {
        userId: t.clientId,
        inApp: {
          title: `Rework Requested (Revision #${newRevisionNumber})`,
          message: `${currentUser.name} sent ticket #${t.ticketNumber} back for rework: ${data.revisionNotes.substring(0, 100)}`,
          link: `/dashboard/tickets/${data.ticketId}`,
          ticketId: data.ticketId,
        },
        email: {
          eventType: 'revision_requested',
          templateData: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            requestedByName: currentUser.name || currentUser.id,
            revisionNotes: data.revisionNotes,
            ticketLink,
          },
        },
        teams: {
          payload: {
            ticketNumber: t.ticketNumber, ticketTitle: t.title,
            requestedByName: currentUser.name || currentUser.id, revisionNotes: data.revisionNotes,
          },
        },
      },
    ]
    if (t.assignedToId) {
      recipients.push({
        userId: t.assignedToId,
        inApp: {
          title: `Rework Requested (Revision #${newRevisionNumber})`,
          message: `${currentUser.name} sent ticket #${t.ticketNumber} back for rework: ${data.revisionNotes.substring(0, 100)}`,
          link: `/dashboard/tickets/${data.ticketId}`,
          ticketId: data.ticketId,
        },
        teams: {
          payload: {
            ticketNumber: t.ticketNumber, ticketTitle: t.title,
            requestedByName: currentUser.name || currentUser.id, revisionNotes: data.revisionNotes,
          },
        },
      })
    }

    await dispatchNotification({
      eventType: 'revision_requested',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${data.ticketId}` },
      recipients,
    })
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${data.ticketId}`)
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })

  return result
})

// ============================================================================
// REVISION HISTORY
// ============================================================================

export const getRevisionHistory = wrapServerAction('getRevisionHistory', async function getRevisionHistory(ticketId: number): Promise<RevisionHistoryWithAttachments[]> {
  const revisions = await db
    .select()
    .from(revisionHistory)
    .where(eq(revisionHistory.ticketId, ticketId))
    .orderBy(desc(revisionHistory.createdAt))

  return revisions.map((rev) => {
    // Parse attachmentIds from the stored JSON array to fetch actual attachment metadata
    let attachmentObjects: any[] = []
    if (rev.attachmentIds && Array.isArray(rev.attachmentIds)) {
      attachmentObjects = rev.attachmentIds.map((id: number) => ({
        id,
        // Basic metadata — in a full implementation you'd join with the attachments table
      }))
    }

    return {
      ...rev,
      status: rev.status as RevisionHistory['status'],
      attachmentObjects,
    } as RevisionHistoryWithAttachments
  })
})

// ─── Dashboard Revision Stats ─────────────────────────────────────────────

export const getRevisionDashboardStats = wrapServerAction('getRevisionDashboardStats', async function getRevisionDashboardStats() {
  const currentUser = await getUser()

  // Pending revision requests = tickets explicitly in 'request_for_revision'
  // (manager/admin-initiated) PLUS tickets with an active revision_history
  // record awaiting action (status 'pending' or 'pending_approval').
  // Client-initiated revisions keep the ticket in 'client_review' until a
  // manager approves, so counting tickets by status alone undercounts.
  const pendingRevisionIds = db
    .selectDistinct({ ticketId: revisionHistory.ticketId })
    .from(revisionHistory)
    .where(inArray(revisionHistory.status, ['pending', 'pending_approval']))

  const conditions = [
    or(
      eq(ticket.status, 'request_for_revision'),
      inArray(ticket.id, pendingRevisionIds),
    ),
  ]
  if (currentUser.role === 'client') {
    conditions.push(eq(ticket.clientId, currentUser.id))
  } else if (currentUser.role === 'developer') {
    conditions.push(eq(ticket.assignedToId, currentUser.id))
  } else if (currentUser.role === 'project_manager') {
    const managedProjects = db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.managerId, currentUser.id))
    conditions.push(inArray(ticket.projectId, managedProjects))
  }

  const [result] = await db
    .select({ count: count() })
    .from(ticket)
    .where(and(...conditions))

  const openRevisions = Number(result?.count) || 0

  return {
    openRevisions,
    pendingRevisions: openRevisions,
  }
})

// ─── Get Resolved Tickets (for Review Queue) ──────────────────────────────

export const getResolvedTickets = wrapServerAction('getResolvedTickets', async function getResolvedTickets() {
  const currentUser = await getUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }

  const rows = await db
    .select({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      clientId: ticket.clientId,
      projectId: ticket.projectId,
      moduleId: ticket.moduleId,
      assignedToId: ticket.assignedToId,
      assignedById: ticket.assignedById,
      assignedAt: ticket.assignedAt,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
      revisionCount: ticket.revisionCount,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    })
    .from(ticket)
    .where(and(eq(ticket.status, 'resolved'), isNotNull(ticket.resolvedAt)))
    .orderBy(desc(ticket.resolvedAt))

  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map((r) => r.clientId).filter(Boolean) as string[])]
  const developerIds = [...new Set(rows.map((r) => r.assignedToId).filter(Boolean) as string[])]
  const allUserIds = [...new Set([...userIds, ...developerIds])]

  const users = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, allUserIds))
  const userMap = new Map(users.map((u) => [u.id, u.name]))

  return rows.map((r) => ({
    ...r,
    status: r.status as TicketStatus,
    priority: r.priority as TicketPriority,
    category: r.category as TicketCategory,
    clientName: userMap.get(r.clientId) || 'Unknown',
    assignedToName: r.assignedToId ? userMap.get(r.assignedToId) || 'Unknown' : undefined
  }))
})
