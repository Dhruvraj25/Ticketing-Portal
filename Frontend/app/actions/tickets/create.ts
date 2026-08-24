// @ts-nocheck
'use server'

import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { db } from '@/lib/db'
import { ticket, ticketHistory, user, project, supportWallet } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { TicketPriority, TicketCategory } from '@/lib/types'
import { dispatchNotification } from '@/lib/notify-all'
import { VALIDATION, validateField } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'

function generateTicketNumber() {
  const prefix = 'TKT'
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}-${timestamp}-${random}`
}

export const createTicket = wrapServerAction('createTicket', async function createTicket(data: {
  title: string
  description: string
  priority: TicketPriority
  category: TicketCategory
  projectId?: number | null
  moduleId?: number | null
  isOverrideTicket?: boolean
  overrideReason?: string
  estimatedHours?: number
  clientId?: string
}) {
  const currentUser = await getUser()

  const titleErr = validateField(data.title, VALIDATION.TICKET_TITLE_MAX_LENGTH, 'Title')
  if (titleErr) throw new Error(titleErr)
  const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
  if (descErr) throw new Error(descErr)

  let actualClientId = currentUser.id
  if (currentUser.role !== 'client' && data.clientId) {
    actualClientId = data.clientId
  }

  if (actualClientId !== currentUser.id && data.projectId && !data.isOverrideTicket) {
    try {
      const { checkClientCanCreateTicket } = await import('@/app/actions/wallets')
      const balanceCheck = await checkClientCanCreateTicket(actualClientId, data.projectId)
      if (!balanceCheck.canCreate) {
        throw new Error(balanceCheck.reason || 'Support hour balance is below the minimum threshold.')
      }
    } catch (err) {
      if (err instanceof Error && (err.message.includes('Support hour balance') || err.message.includes('below the minimum'))) throw err
    }
  } else if (currentUser.role === 'client' && data.projectId && !data.isOverrideTicket) {
    const { checkClientCanCreateTicket } = await import('@/app/actions/wallets')
    const balanceCheck = await checkClientCanCreateTicket(currentUser.id, data.projectId)
    if (!balanceCheck.canCreate) {
      throw new Error(balanceCheck.reason || 'Support hour balance is below the minimum threshold.')
    }
  }

  if (data.isOverrideTicket) {
    if (currentUser.role === 'client') throw new Error('Clients cannot create override tickets')
    if (!data.overrideReason) throw new Error('Override reason is required')
    const validReasons = ['Critical Production Issue', 'Contract Renewal In Progress', 'Emergency Support', 'Management Approval']
    if (!validReasons.includes(data.overrideReason)) throw new Error('Invalid override reason')
  }

  if (currentUser.role === 'client' && data.projectId) {
    try {
      const { checkClientCanCreateTicket } = await import('@/app/actions/wallets')
      const balanceCheck = await checkClientCanCreateTicket(currentUser.id, data.projectId)
      if (balanceCheck.warning && balanceCheck.remainingHours <= 10) {
        throw new Error(balanceCheck.reason || 'Support hour balance is below the minimum threshold.')
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Support hour balance')) throw err
    }
  }

  const ticketNumber = generateTicketNumber()
  const initialStatus = 'new'

  const [newTicket] = await db
    .insert(ticket)
    .values({
      ticketNumber,
      title: data.title,
      description: data.description,
      priority: data.priority,
      category: data.category,
      status: initialStatus,
      clientId: actualClientId,
      projectId: data.projectId ?? null,
      moduleId: data.moduleId ?? null,
      isOverrideTicket: data.isOverrideTicket ?? false,
      overrideReason: data.isOverrideTicket ? (data.overrideReason ?? null) : null,
      overrideBy: data.isOverrideTicket ? currentUser.id : null,
      overrideDate: data.isOverrideTicket ? new Date() : null,
      estimatedHours: data.estimatedHours ?? null,
    })
    .returning()

  await db.insert(ticketHistory).values({
    ticketId: newTicket.id,
    userId: currentUser.id,
    action: data.isOverrideTicket ? 'override_created' : 'created',
    newValue: data.isOverrideTicket ? `Override ticket created (${data.overrideReason})` : 'Ticket created',
  })

  // Send Ticket Created email to project manager and client (fire-and-forget)
  sendTicketCreatedNotification(currentUser, newTicket, data, actualClientId).catch((err: Error) => {
    console.error('[Email] ticket_created notification failed:', err)
  })

  revalidatePath('/dashboard')
  revalidateTag('lookup-projects')
  revalidateTag('module-ticket-stats', { expire: 60 })
  revalidateTag('project-ticket-analytics', { expire: 60 })
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })
  if (data.projectId) revalidateTag('project-by-id', { expire: 60 })
  return newTicket
})

/**
 * Send ticket created notification to the project manager (and client when the
 * ticket was created on their behalf). Routes through the unified dispatcher:
 * In-App + Email + Teams. Fire-and-forget — failure never blocks the response.
 */
async function sendTicketCreatedNotification(
  currentUser: any,
  newTicket: any,
  data: any,
  actualClientId: string,
): Promise<void> {
  const ticketLink = process.env.NEXT_PUBLIC_APP_URL + '/dashboard/tickets/' + newTicket.id
  const createdDate = new Date().toISOString().split('T')[0]
  const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = []

  // 1. Notify the project manager (In-App + Email + Teams)
  if (data.projectId) {
    const [projectRow] = await db
      .select({ managerId: project.managerId })
      .from(project)
      .where(eq(project.id, data.projectId))
      .limit(1)

    if (projectRow?.managerId) {
      recipients.push({
        userId: projectRow.managerId,
        inApp: {
          title: 'New Ticket Created',
          message: `Ticket #${newTicket.ticketNumber} (${data.title}) was created by ${currentUser.name || currentUser.id}.`,
          link: `/dashboard/tickets/${newTicket.id}`,
          ticketId: newTicket.id,
        },
        email: {
          templateData: {
            ticketNumber: newTicket.ticketNumber,
            ticketTitle: data.title,
            projectName: '',
            priority: data.priority,
            createdBy: currentUser.name || currentUser.id,
            createdDate,
            ticketLink,
          },
        },
        teams: {
          payload: {
            ticketNumber: newTicket.ticketNumber,
            ticketTitle: data.title,
            priority: data.priority,
            createdBy: currentUser.name || currentUser.id,
            url: ticketLink,
          },
        },
      })
    }
  }

  // 2. Notify the client (if the ticket was created on their behalf by manager/admin)
  if (actualClientId !== currentUser.id) {
    recipients.push({
      userId: actualClientId,
      inApp: {
        title: 'Ticket Created on Your Behalf',
        message: `A ticket #${newTicket.ticketNumber} (${data.title}) was created on your behalf.`,
        link: `/dashboard/tickets/${newTicket.id}`,
        ticketId: newTicket.id,
      },
      email: {
        templateData: {
          ticketNumber: newTicket.ticketNumber,
          ticketTitle: data.title,
          projectName: '',
          priority: data.priority,
          createdBy: currentUser.name || currentUser.id,
          createdDate,
          ticketLink,
        },
      },
    })
  }

  await dispatchNotification({
    eventType: 'ticket_created',
    triggeredBy: currentUser.id,
    dedup: { scope: `ticket:${newTicket.id}` },
    recipients,
  })
}
