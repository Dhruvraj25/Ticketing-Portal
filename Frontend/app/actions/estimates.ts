'use server'

import { cache } from 'react'
import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { db } from '@/lib/db'
import { ticket, ticketHistory, comment, user, project, revisionHistory } from '@/lib/db/schema'
import { and, eq, desc, isNull, isNotNull, ne, count, inArray, gte, lte } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { UserRole } from '@/lib/types'
import { dispatchNotification } from '@/lib/notify-all'
import { AUTO_APPROVAL_DAYS, AUTO_APPROVAL_REMINDER_DAYS, VALIDATION, validateField } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'

// ============================================================================
// ESTIMATE APPROVAL ACTIONS
// ============================================================================

export const submitEstimate = wrapServerAction('submitEstimate', async function submitEstimate(ticketId: number, data: {
  estimatedHours: number
  estimatedCompletionDate: string
  estimateNotes: string
}) {
  const currentUser = await getUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only managers and admins can submit estimates')
  }

  // Validation
  if (data.estimateNotes) {
    const notesErr = validateField(data.estimateNotes, VALIDATION.ESTIMATE_NOTES_MAX_LENGTH, 'Estimate notes')
    if (notesErr) throw new Error(notesErr)
  }

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')
  if (t.status !== 'new' && t.status !== 'estimate_pending') {
    throw new Error('Ticket is not in a state that requires an estimate')
  }
  if (data.estimatedHours <= 0) {
    throw new Error('Estimated hours must be a positive number')
  }

  const approvalDeadline = new Date()
  approvalDeadline.setDate(approvalDeadline.getDate() + AUTO_APPROVAL_DAYS)

  await db
    .update(ticket)
    .set({
      estimatedHours: data.estimatedHours,
      estimatedCompletionDate: data.estimatedCompletionDate,
      estimateNotes: data.estimateNotes,
      estimateSubmittedAt: new Date(),
      status: 'estimate_pending',
      approvalDeadline,
      updatedAt: new Date(),
    })
    .where(eq(ticket.id, ticketId))

  await db.insert(ticketHistory).values({
    ticketId,
    userId: currentUser.id,
    action: 'estimate_created',
    newValue: `${data.estimatedHours}h estimate submitted, deadline: ${approvalDeadline.toISOString().split('T')[0]}`,
  })

  // Notify client: In-App + Email + Teams (estimate requires approval)
  const ticketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + ticketId
  await dispatchNotification({
    eventType: 'estimate_requested',
    triggeredBy: currentUser.id,
    dedup: { scope: `ticket:${ticketId}` },
    recipients: [
      {
        userId: t.clientId,
        inApp: {
          title: 'Estimate Ready for Approval',
          message: `An estimate of ${data.estimatedHours}h has been submitted for ticket #${t.ticketNumber}. Please review and approve.`,
          link: `/dashboard/tickets/${ticketId}`,
          ticketId,
        },
        email: {
          templateData: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            estimatedHours: data.estimatedHours,
            estimateNotes: data.estimateNotes || '',
            approvalDeadline: approvalDeadline.toISOString().split('T')[0],
            ticketLink,
          },
        },
        teams: {
          payload: {
            ticketNumber: t.ticketNumber, ticketTitle: t.title,
            estimatedHours: data.estimatedHours, estimateNotes: data.estimateNotes,
            url: ticketLink,
          },
        },
      },
    ],
  })

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
})

export const approveEstimate = wrapServerAction('approveEstimate', async function approveEstimate(ticketId: number) {
  const currentUser = await getUser()

  if (currentUser.role !== 'client') {
    throw new Error('Only clients can approve estimates')
  }
  if (currentUser.userType !== 'approver') {
    throw new Error('Only Approver-type users can approve estimates. Contact your administrator to change your user type.')
  }

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')
  if (t.clientId !== currentUser.id) throw new Error('Access denied')
  if (t.status !== 'estimate_pending') throw new Error('Estimate is not pending your approval')
  if (!t.estimatedHours) throw new Error('No estimate found')

  await db
    .update(ticket)
    .set({
      status: 'estimate_approved',
      estimateApprovedAt: new Date(),
      estimateApprovedBy: currentUser.id,
      updatedAt: new Date(),
    })
    .where(eq(ticket.id, ticketId))

  await db.insert(ticketHistory).values({
    ticketId,
    userId: currentUser.id,
    action: 'estimate_approved',
    oldValue: 'estimate_pending',
    newValue: `estimate_approved (${t.estimatedHours}h)`,
  })

  // Notify manager
  const [p] = await db
    .select({ managerId: project.managerId })
    .from(project)
    .where(eq(project.id, t.projectId!))
    .limit(1)
  const ticketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + ticketId
  const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = []
  if (p) {
    recipients.push({
      userId: p.managerId,
      inApp: {
        title: 'Estimate Approved',
        message: `Client has approved the estimate (${t.estimatedHours}h) for ticket #${t.ticketNumber}.`,
        link: `/dashboard/tickets/${ticketId}`,
        ticketId,
      },
      email: {
        templateData: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          estimatedHours: t.estimatedHours || 0,
          approvedBy: currentUser.name || 'Client',
          managerName: '',
          ticketLink,
        },
      },
      teams: {
        payload: {
          ticketNumber: t.ticketNumber, ticketTitle: t.title,
          estimatedHours: t.estimatedHours || 0, approvedBy: currentUser.name,
          url: ticketLink,
        },
      },
    })
  }

  // Also notify the assigned developer that estimate was approved (In-App + Email + Teams)
  if (t.assignedToId) {
    recipients.push({
      userId: t.assignedToId,
      inApp: {
        title: 'Estimate Approved',
        message: `The estimate (${t.estimatedHours}h) for ticket #${t.ticketNumber} was approved by the client.`,
        link: `/dashboard/tickets/${ticketId}`,
        ticketId,
      },
      email: {
        templateData: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          estimatedHours: t.estimatedHours || 0,
          approvedBy: currentUser.name || 'Client',
          managerName: '',
          ticketLink,
        },
      },
      teams: {
        payload: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          estimatedHours: t.estimatedHours || 0,
          approvedBy: currentUser.name || 'Client',
          url: ticketLink,
        },
      },
    })
  }

  if (recipients.length > 0) {
    await dispatchNotification({
      eventType: 'estimate_approved',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${ticketId}` },
      recipients,
    })
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
})

export const rejectEstimate = wrapServerAction('rejectEstimate', async function rejectEstimate(ticketId: number, reason: string) {
  const currentUser = await getUser()

  if (currentUser.role !== 'client') {
    throw new Error('Only clients can reject estimates')
  }
  if (currentUser.userType !== 'approver') {
    throw new Error('Only Approver-type users can reject estimates. Contact your administrator to change your user type.')
  }

  // Validation
  const reasonErr = validateField(reason, VALIDATION.REJECT_REASON_MAX_LENGTH, 'Rejection reason')
  if (reasonErr) throw new Error(reasonErr)

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')
  if (t.clientId !== currentUser.id) throw new Error('Access denied')
  if (t.status !== 'estimate_pending') throw new Error('Estimate is not pending your approval')

  await db
    .update(ticket)
    .set({
      status: 'request_for_revision',
      updatedAt: new Date(),
    })
    .where(eq(ticket.id, ticketId))

  await db.insert(ticketHistory).values({
    ticketId,
    userId: currentUser.id,
    action: 'revision_requested',
    oldValue: 'estimate_pending',
    newValue: `estimate_rejected: ${reason}`,
  })

  // Notify manager
  const [p] = await db
    .select({ managerId: project.managerId })
    .from(project)
    .where(eq(project.id, t.projectId!))
    .limit(1)
  const ticketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + ticketId
  const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = []
  if (p) {
    recipients.push({
      userId: p.managerId,
      inApp: {
        title: 'Estimate Declined',
        message: `Client rejected the estimate for ticket #${t.ticketNumber}: ${reason}`,
        link: `/dashboard/tickets/${ticketId}`,
        ticketId,
      },
      email: {
        templateData: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          estimatedHours: t.estimatedHours || 0,
          rejectReason: reason,
          rejectedBy: currentUser.name || 'Client',
          ticketLink,
        },
      },
      teams: {
        payload: {
          ticketNumber: t.ticketNumber, ticketTitle: t.title,
          estimatedHours: t.estimatedHours || 0, rejectReason: reason,
          url: ticketLink,
        },
      },
    })
  }

  // Also notify the assigned developer that estimate was rejected (In-App + Email + Teams)
  if (t.assignedToId && t.assignedToId !== p?.managerId) {
    recipients.push({
      userId: t.assignedToId,
      inApp: {
        title: 'Estimate Declined',
        message: `The estimate for ticket #${t.ticketNumber} was rejected by the client: ${reason}`,
        link: `/dashboard/tickets/${ticketId}`,
        ticketId,
      },
      email: {
        templateData: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          estimatedHours: t.estimatedHours || 0,
          rejectReason: reason,
          rejectedBy: currentUser.name || 'Client',
          ticketLink,
        },
      },
      teams: {
        payload: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          estimatedHours: t.estimatedHours || 0,
          rejectReason: reason,
          url: ticketLink,
        },
      },
    })
  }

  if (recipients.length > 0) {
    await dispatchNotification({
      eventType: 'estimate_rejected',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${ticketId}` },
      recipients,
    })
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })
})

export const requestEstimateClarification = wrapServerAction('requestEstimateClarification', async function requestEstimateClarification(ticketId: number, message: string) {
  const currentUser = await getUser()

  if (currentUser.role !== 'client') {
    throw new Error('Only clients can request clarification')
  }
  if (currentUser.userType !== 'approver') {
    throw new Error('Only Approver-type users can request estimate clarification. Contact your administrator to change your user type.')
  }

  // Validation
  const msgErr = validateField(message, VALIDATION.CLARIFICATION_MESSAGE_MAX_LENGTH, 'Clarification message')
  if (msgErr) throw new Error(msgErr)

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')
  if (t.clientId !== currentUser.id) throw new Error('Access denied')
  if (t.status !== 'estimate_pending') throw new Error('Estimate is not pending your approval')

  // Add a comment with the clarification request
  await db.insert(comment).values({
    ticketId,
    userId: currentUser.id,
    content: `Clarification requested on estimate: ${message}`,
    isInternal: false,
  })

  // Notify manager
  const [p] = await db
    .select({ managerId: project.managerId })
    .from(project)
    .where(eq(project.id, t.projectId!))
    .limit(1)
  if (p) {
    await dispatchNotification({
      eventType: 'estimate_clarification_requested',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${ticketId}` },
      recipients: [
        {
          userId: p.managerId,
          channels: ['inApp'],
          inApp: {
            title: 'Clarification Requested on Estimate',
            message: `Client requested clarification on estimate for ticket #${t.ticketNumber}: ${message.substring(0, 100)}`,
            link: `/dashboard/tickets/${ticketId}`,
            ticketId,
          },
        },
      ],
    })
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
})

export const updateEstimate = wrapServerAction('updateEstimate', async function updateEstimate(ticketId: number, data: {
  estimatedHours: number
  estimatedCompletionDate: string
  estimateNotes: string
}) {
  const currentUser = await getUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only managers and admins can update estimates')
  }

  // Validation
  if (data.estimateNotes) {
    const notesErr = validateField(data.estimateNotes, VALIDATION.ESTIMATE_NOTES_MAX_LENGTH, 'Estimate notes')
    if (notesErr) throw new Error(notesErr)
  }

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')
  if (t.status !== 'request_for_revision' && t.status !== 'estimate_pending') {
    throw new Error('Ticket is not in a state that allows estimate updates')
  }
  if (data.estimatedHours <= 0) {
    throw new Error('Estimated hours must be a positive number')
  }

  const approvalDeadline = new Date()
  approvalDeadline.setDate(approvalDeadline.getDate() + AUTO_APPROVAL_DAYS)

  await db
    .update(ticket)
    .set({
      estimatedHours: data.estimatedHours,
      estimatedCompletionDate: data.estimatedCompletionDate,
      estimateNotes: data.estimateNotes,
      estimateSubmittedAt: new Date(),
      status: 'estimate_pending',
      approvalDeadline,
      updatedAt: new Date(),
    })
    .where(eq(ticket.id, ticketId))

  await db.insert(ticketHistory).values({
    ticketId,
    userId: currentUser.id,
    action: 'estimate_modified',
    oldValue: t.estimateNotes || 'No previous notes',
    newValue: `${data.estimatedHours}h estimate updated`,
  })

  // Notify client (in-app)
  await dispatchNotification({
    eventType: 'estimate_updated',
    triggeredBy: currentUser.id,
    dedup: { scope: `ticket:${ticketId}` },
    recipients: [
      {
        userId: t.clientId,
        channels: ['inApp'],
        inApp: {
          title: 'Estimate Updated',
          message: `The estimate for ticket #${t.ticketNumber} has been updated to ${data.estimatedHours}h. Please review.`,
          link: `/dashboard/tickets/${ticketId}`,
          ticketId,
        },
      },
    ],
  })

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })
})

// ─── Additional Hours ──────────────────────────────────────────────────────

export const requestAdditionalHours = wrapServerAction('requestAdditionalHours', async function requestAdditionalHours(ticketId: number, additionalHours: number, reason: string) {
  const currentUser = await getUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only managers and admins can request additional hours')
  }

  // Validation
  const reasonErr = validateField(reason, VALIDATION.ADDITIONAL_HOURS_REASON_MAX_LENGTH, 'Additional hours reason')
  if (reasonErr) throw new Error(reasonErr)

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')
  // Additional hours can be requested once estimate is approved, until ticket is closed
  const activeStatuses = ['estimate_approved', 'assigned', 'in_progress', 'client_review', 'request_for_revision']
  if (!activeStatuses.includes(t.status)) {
    throw new Error('Additional hours can only be requested for active tickets with an approved estimate')
  }
  if (additionalHours <= 0) {
    throw new Error('Additional hours must be a positive number')
  }

  const additionalHoursDeadline = new Date()
  additionalHoursDeadline.setDate(additionalHoursDeadline.getDate() + AUTO_APPROVAL_DAYS)

  await db
    .update(ticket)
    .set({
      additionalHoursRequested: additionalHours,
      additionalHoursApproved: false,
      additionalHoursAutoApproved: false,
      additionalHoursDeadline,
      updatedAt: new Date(),
    })
    .where(eq(ticket.id, ticketId))

  await db.insert(ticketHistory).values({
    ticketId,
    userId: currentUser.id,
    action: 'additional_hours_requested',
    newValue: `${additionalHours}h additional hours requested: ${reason}`,
  })

  // Notify client: In-App + Email + Teams
  const ticketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + ticketId
  await dispatchNotification({
    eventType: 'additional_hours_requested',
    triggeredBy: currentUser.id,
    dedup: { scope: `ticket:${ticketId}` },
    recipients: [
      {
        userId: t.clientId,
        inApp: {
          title: 'Additional Hours Requested',
          message: `Additional ${additionalHours}h requested for ticket #${t.ticketNumber}. Reason: ${reason}`,
          link: `/dashboard/tickets/${ticketId}`,
          ticketId,
        },
        email: {
          templateData: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            requestedHours: additionalHours,
            reason,
            ticketLink,
          },
        },
        teams: {
          payload: {
            ticketNumber: t.ticketNumber, ticketTitle: t.title,
            requestedHours: additionalHours, reason,
            url: ticketLink,
          },
        },
      },
    ],
  })

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
})

export const approveAdditionalHours = wrapServerAction('approveAdditionalHours', async function approveAdditionalHours(ticketId: number) {
  const currentUser = await getUser()

  if (currentUser.role !== 'client') {
    throw new Error('Only clients can approve additional hours')
  }
  if (currentUser.userType !== 'approver') {
    throw new Error('Only Approver-type users can approve additional hours. Contact your administrator to change your user type.')
  }

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')
  if (t.clientId !== currentUser.id) throw new Error('Access denied')
  if (!t.additionalHoursRequested) throw new Error('No additional hours request found')
  if (t.additionalHoursApproved) throw new Error('Additional hours already approved')

  const newTotalHours = (t.estimatedHours || 0) + t.additionalHoursRequested

  await db
    .update(ticket)
    .set({
      additionalHoursApproved: true,
      additionalHoursApprovedBy: currentUser.id,
      estimatedHours: newTotalHours,
      updatedAt: new Date(),
    })
    .where(eq(ticket.id, ticketId))

  await db.insert(ticketHistory).values({
    ticketId,
    userId: currentUser.id,
    action: 'additional_hours_approved',
    oldValue: `${t.additionalHoursRequested}h requested`,
    newValue: `${t.additionalHoursRequested}h approved, total: ${newTotalHours}h`,
  })

  // Notify manager
  const [p] = await db
    .select({ managerId: project.managerId })
    .from(project)
    .where(eq(project.id, t.projectId!))
    .limit(1)
  const ticketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + ticketId
  const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = []
  if (p) {
    recipients.push({
      userId: p.managerId,
      inApp: {
        title: 'Additional Hours Approved',
        message: `Client approved additional ${t.additionalHoursRequested}h for ticket #${t.ticketNumber}.`,
        link: `/dashboard/tickets/${ticketId}`,
        ticketId,
      },
      email: {
        templateData: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          requestedHours: t.additionalHoursRequested || 0,
          approvedBy: currentUser.name || 'Client',
          newTotalHours: newTotalHours,
          ticketLink,
        },
      },
      teams: {
        payload: {
          ticketNumber: t.ticketNumber, ticketTitle: t.title,
          requestedHours: t.additionalHoursRequested || 0, approvedBy: currentUser.name,
          url: ticketLink,
        },
      },
    })

    // Also notify the assigned developer (In-App + Email + Teams)
    if (t.assignedToId) {
      recipients.push({
        userId: t.assignedToId,
        inApp: {
          title: 'Additional Hours Approved',
          message: `Additional ${t.additionalHoursRequested}h approved for ticket #${t.ticketNumber}.`,
          link: `/dashboard/tickets/${ticketId}`,
          ticketId,
        },
        email: {
          templateData: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            requestedHours: t.additionalHoursRequested || 0,
            approvedBy: currentUser.name || 'Client',
            newTotalHours: newTotalHours,
            ticketLink,
          },
        },
        teams: {
          payload: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            requestedHours: t.additionalHoursRequested || 0,
            approvedBy: currentUser.name || 'Client',
            url: ticketLink,
          },
        },
      })
    }
  }

  if (recipients.length > 0) {
    await dispatchNotification({
      eventType: 'additional_hours_approved',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${ticketId}` },
      recipients,
    })
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
})

// ─── Decline Additional Hours ─────────────────────────────────────────────

export const declineAdditionalHours = wrapServerAction('declineAdditionalHours', async function declineAdditionalHours(ticketId: number) {
  const currentUser = await getUser()

  if (currentUser.role !== 'client') {
    throw new Error('Only clients can decline additional hours')
  }
  if (currentUser.userType !== 'approver') {
    throw new Error('Only Approver-type users can decline additional hours. Contact your administrator to change your user type.')
  }

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')
  if (t.clientId !== currentUser.id) throw new Error('Access denied')
  if (!t.additionalHoursRequested) throw new Error('No additional hours request found')

  await db
    .update(ticket)
    .set({
      additionalHoursRequested: null,
      additionalHoursApproved: false,
      additionalHoursAutoApproved: false,
      additionalHoursDeadline: null,
      updatedAt: new Date(),
    })
    .where(eq(ticket.id, ticketId))

  // Notify the project manager
  const [p] = await db
    .select({ managerId: project.managerId })
    .from(project)
    .where(eq(project.id, t.projectId!))
    .limit(1)
  const ticketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + ticketId
  const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = []
  if (p) {
    // Resolve project name for the email template
    let projectName = ''
    if (t.projectId) {
      const [projectRow] = await db
        .select({ projectName: project.projectName })
        .from(project)
        .where(eq(project.id, t.projectId))
        .limit(1)
      projectName = projectRow?.projectName || ''
    }
    recipients.push({
      userId: p.managerId,
      inApp: {
        title: 'Additional Hours Declined',
        message: `Client declined the additional hours request for ticket #${t.ticketNumber}.`,
        link: `/dashboard/tickets/${ticketId}`,
        ticketId,
      },
      email: {
        templateData: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          requestedHours: t.additionalHoursRequested || 0,
          clientName: currentUser.name || 'Client',
          rejectReason: 'Declined by client',
          projectName,
          ticketLink,
        },
      },
      teams: {
        payload: {
          ticketNumber: t.ticketNumber, ticketTitle: t.title,
          requestedHours: t.additionalHoursRequested || 0,
          url: ticketLink,
        },
      },
    })

    // Also notify the assigned developer (In-App + Email + Teams)
    if (t.assignedToId) {
      recipients.push({
        userId: t.assignedToId,
        inApp: {
          title: 'Additional Hours Declined',
          message: `The additional hours request for ticket #${t.ticketNumber} was declined by the client.`,
          link: `/dashboard/tickets/${ticketId}`,
          ticketId,
        },
        email: {
          templateData: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            requestedHours: t.additionalHoursRequested || 0,
            clientName: currentUser.name || 'Client',
            rejectReason: 'Declined by client',
            projectName,
            ticketLink,
          },
        },
        teams: {
          payload: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            requestedHours: t.additionalHoursRequested || 0,
            url: ticketLink,
          },
        },
      })
    }
  }

  if (recipients.length > 0) {
    await dispatchNotification({
      eventType: 'additional_hours_rejected',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${ticketId}` },
      recipients,
    })
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
})

// ─── Auto-Approval ────────────────────────────────────────────────────────

export const processEstimateAutoApprovals = wrapServerAction('processEstimateAutoApprovals', async function processEstimateAutoApprovals() {
  const now = new Date()

  // Find estimates past their deadline
  const pendingEstimates = await db
    .select()
    .from(ticket)
    .where(
      and(
        eq(ticket.status, 'estimate_pending'),
        lte(ticket.approvalDeadline, now),
        isNotNull(ticket.approvalDeadline),
        isNotNull(ticket.estimatedHours),
        ne(ticket.autoApproved, true),
      ),
    )

  for (const t of pendingEstimates) {
    const estimatedHours = t.estimatedHours || 0

    await db
      .update(ticket)
      .set({
        status: 'estimate_approved',
        autoApproved: true,
        autoApprovedAt: now,
        estimateApprovedAt: now,
        updatedAt: now,
      })
      .where(eq(ticket.id, t.id))

    await db.insert(ticketHistory).values({
      ticketId: t.id,
      userId: t.clientId,
      action: 'auto_approved',
      newValue: `Auto-approved after ${AUTO_APPROVAL_DAYS} days (${estimatedHours}h)`,
    })

    // Notify client (in-app)
    await dispatchNotification({
      eventType: 'estimate_auto_approved',
      triggeredBy: 'system',
      dedup: { scope: `ticket:${t.id}` },
      recipients: [
        {
          userId: t.clientId,
          channels: ['inApp'],
          inApp: {
            title: 'Estimate Auto-Approved',
            message: `The estimate (${estimatedHours}h) for ticket #${t.ticketNumber} was auto-approved after ${AUTO_APPROVAL_DAYS} days.`,
            link: `/dashboard/tickets/${t.id}`,
            ticketId: t.id,
          },
        },
      ],
    })

    // Notify manager (in-app)
    const [p] = await db
      .select({ managerId: project.managerId })
      .from(project)
      .where(eq(project.id, t.projectId!))
      .limit(1)
    if (p) {
      await dispatchNotification({
        eventType: 'estimate_auto_approved',
        triggeredBy: 'system',
        dedup: { scope: `ticket:${t.id}` },
        recipients: [
          {
            userId: p.managerId,
            channels: ['inApp'],
            inApp: {
              title: 'Estimate Auto-Approved',
              message: `Estimate for ticket #${t.ticketNumber} was auto-approved (${estimatedHours}h).`,
              link: `/dashboard/tickets/${t.id}`,
              ticketId: t.id,
            },
          },
        ],
      })
    }
  }

  // Also process additional hours auto-approvals
  const pendingAdditionalHours = await db
    .select()
    .from(ticket)
    .where(
      and(
        isNotNull(ticket.additionalHoursRequested),
        eq(ticket.additionalHoursApproved, false),
        eq(ticket.additionalHoursAutoApproved, false),
        lte(ticket.additionalHoursDeadline, now),
        isNotNull(ticket.additionalHoursDeadline),
      ),
    )

  for (const t of pendingAdditionalHours) {
    const additionalHours = t.additionalHoursRequested || 0
    const newTotal = (t.estimatedHours || 0) + additionalHours

    await db
      .update(ticket)
      .set({
        additionalHoursApproved: true,
        additionalHoursAutoApproved: true,
        additionalHoursApprovedBy: null, // auto-approved
        estimatedHours: newTotal,
        updatedAt: now,
      })
      .where(eq(ticket.id, t.id))

    await db.insert(ticketHistory).values({
      ticketId: t.id,
      userId: t.clientId,
      action: 'additional_hours_auto_approved',
      newValue: `Additional ${additionalHours}h auto-approved, total: ${newTotal}h`,
    })

    await dispatchNotification({
      eventType: 'additional_hours_auto_approved',
      triggeredBy: 'system',
      dedup: { scope: `ticket:${t.id}` },
      recipients: [
        {
          userId: t.clientId,
          channels: ['inApp'],
          inApp: {
            title: 'Additional Hours Auto-Approved',
            message: `Additional ${additionalHours}h for ticket #${t.ticketNumber} was auto-approved after ${AUTO_APPROVAL_DAYS} days.`,
            link: `/dashboard/tickets/${t.id}`,
            ticketId: t.id,
          },
        },
      ],
    })
  }

  return {
    autoApproved: pendingEstimates.length,
    additionalHoursAutoApproved: pendingAdditionalHours.length,
  }
})

// ─── Dashboard Estimate Stats ─────────────────────────────────────────────

export const getEstimateDashboardStats = wrapServerAction('getEstimateDashboardStats', async function getEstimateDashboardStats() {
  const currentUser = await getUser()

  const conditions = []
  if (currentUser.role === 'client') {
    conditions.push(eq(ticket.clientId, currentUser.id))
  } else if (currentUser.role === 'project_manager') {
    const managedProjects = db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.managerId, currentUser.id))
    conditions.push(inArray(ticket.projectId, managedProjects))
  }

  const baseFilter = conditions.length > 0 ? and(...conditions) : undefined

  // Single query with SQL aggregations instead of fetching all rows + JS filter
  const stats = await db
    .select({
      status: ticket.status,
      autoApproved: ticket.autoApproved,
      count: count(),
    })
    .from(ticket)
    .where(baseFilter)
    .groupBy(ticket.status, ticket.autoApproved)

  let pendingEstimates = 0, approvedEstimates = 0, rejectedEstimates = 0, autoApprovedEstimates = 0
  for (const row of stats) {
    const c = Number(row.count) || 0
    if (row.status === 'estimate_pending') pendingEstimates += c
    if (row.status === 'estimate_approved' && row.autoApproved) autoApprovedEstimates += c
    if (row.status === 'estimate_approved' && !row.autoApproved) approvedEstimates += c
    if (row.status === 'request_for_revision') rejectedEstimates += c
  }

  // Client-specific stats — single combined query, compute isRecent in JS to avoid PostgreSQL GROUP BY issues
  let awaitingApproval = 0
  let recentlyApproved = 0
  if (currentUser.role === 'client') {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const clientStats = await db
      .select({
        status: ticket.status,
        autoApproved: ticket.autoApproved,
        estimateApprovedAt: ticket.estimateApprovedAt,
        count: count(),
      })
      .from(ticket)
      .where(and(eq(ticket.clientId, currentUser.id), inArray(ticket.status, ['estimate_pending', 'estimate_approved'])))
      .groupBy(ticket.status, ticket.autoApproved, ticket.estimateApprovedAt)

    for (const row of clientStats) {
      const c = Number(row.count) || 0
      const isRecent = row.estimateApprovedAt
        ? new Date(row.estimateApprovedAt).getTime() >= weekAgo.getTime()
        : false
      if (row.status === 'estimate_pending') awaitingApproval += c
      if (row.status === 'estimate_approved' && isRecent) recentlyApproved += c
    }
  }

  return {
    pendingEstimates,
    approvedEstimates,
    rejectedEstimates,
    autoApprovedEstimates,
    awaitingApproval,
    recentlyApproved,
  }
})

// ─── Send Approval Reminders ──────────────────────────────────────────────

export const sendEstimateReminders = wrapServerAction('sendEstimateReminders', async function sendEstimateReminders() {
  const now = new Date()

  const pendingEstimates = await db
    .select()
    .from(ticket)
    .where(
      and(
        eq(ticket.status, 'estimate_pending'),
        isNotNull(ticket.approvalDeadline),
        eq(ticket.autoApproved, false),
      ),
    )

  let remindersSent = 0

  for (const t of pendingEstimates) {
    const deadline = t.approvalDeadline!
    const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    // Send reminders at Day 7, 15, 25
    const shouldRemind = AUTO_APPROVAL_REMINDER_DAYS.includes(
      AUTO_APPROVAL_DAYS - daysRemaining,
    )

    if (!shouldRemind) continue

    await dispatchNotification({
      eventType: 'estimate_reminder',
      triggeredBy: 'system',
      dedup: { scope: `ticket:${t.id}`, windowMinutes: 24 * 60 },
      recipients: [
        {
          userId: t.clientId,
          channels: ['inApp'],
          inApp: {
            title: `Estimate Reminder: ${daysRemaining} Days Left`,
            message: `Please review and respond to the estimate for ticket #${t.ticketNumber}. The estimate will auto-approve on ${deadline.toISOString().split('T')[0]}.`,
            link: `/dashboard/tickets/${t.id}`,
            ticketId: t.id,
          },
        },
      ],
    })

    remindersSent++
  }

  return { remindersSent }
})
