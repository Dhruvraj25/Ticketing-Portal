// @ts-nocheck
'use server'

import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { db } from '@/lib/db'
import { ticket, ticketHistory, comment, timeLog, attachment, user, project, module as moduleTable, projectClient, supportWallet, walletTransaction } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { TicketStatus } from '@/lib/types'
import { dispatchNotification, shouldNotifyWalletLow, shouldNotifyWalletEmpty, WALLET_LOW_THRESHOLD } from '@/lib/notify-all'
import { VALIDATION, validateField } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'

export const clearManagerAnalyticsCache = wrapServerAction('clearManagerAnalyticsCache', async function clearManagerAnalyticsCache() {
  // Clears all in-memory analytics caches imported from history module
  const { clearManagerAnalyticsCache: clearHistoryCache } = await import('./history')
  await clearHistoryCache()
})

// ── Status Update ──────────────────────────────────────────────────────────

export const updateTicketStatus = wrapServerAction('updateTicketStatus', async function updateTicketStatus(ticketId: number, newStatus: TicketStatus) {
  const currentUser = await getUser()
  if (currentUser.role !== 'developer' && currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only developers and managers can update ticket status')
  }

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')
  if (currentUser.role === 'developer' && t.assignedToId !== currentUser.id) {
    throw new Error('You can only update status of tickets assigned to you')
  }

  const updateData: Record<string, unknown> = { status: newStatus, updatedAt: new Date() }
  if (newStatus === 'resolved') updateData.resolvedAt = new Date()
  else if (newStatus === 'closed') updateData.closedAt = new Date()

  await db.update(ticket).set(updateData).where(eq(ticket.id, ticketId))
  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'status_changed',
    oldValue: t.status, newValue: newStatus,
  })

  // Send Ticket Resolved notification (In-App + Email + Teams) to client and manager
  if (newStatus === 'resolved' && t.clientId) {
    const ticketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + ticketId
    const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = []

    recipients.push({
      userId: t.clientId,
      inApp: {
        title: 'Ticket Resolved',
        message: `Ticket #${t.ticketNumber} (${t.title}) has been resolved by ${currentUser.name || 'Developer'} and is ready for your review.`,
        link: `/dashboard/tickets/${ticketId}`,
        ticketId,
      },
      email: {
        templateData: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          resolvedBy: currentUser.name || 'Developer',
          resolutionSummary: '',
          ticketLink,
        },
      },
      teams: {
        payload: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          resolvedBy: currentUser.name || 'Developer',
          url: ticketLink,
        },
      },
    })

    // Also notify the project manager when developer resolves a ticket
    if (t.projectId) {
      const [projectRow] = await db
        .select({ managerId: project.managerId })
        .from(project)
        .where(eq(project.id, t.projectId))
        .limit(1)
      if (projectRow?.managerId && projectRow.managerId !== currentUser.id) {
        recipients.push({
          userId: projectRow.managerId,
          inApp: {
            title: 'Ticket Resolved',
            message: `Ticket #${t.ticketNumber} (${t.title}) was resolved by ${currentUser.name || 'Developer'}.`,
            link: `/dashboard/tickets/${ticketId}`,
            ticketId,
          },
          email: {
            templateData: {
              ticketNumber: t.ticketNumber,
              ticketTitle: t.title,
              resolvedBy: currentUser.name || 'Developer',
              resolutionSummary: '',
              ticketLink,
            },
          },
          teams: {
            payload: {
              ticketNumber: t.ticketNumber,
              ticketTitle: t.title,
              resolvedBy: currentUser.name || 'Developer',
              url: ticketLink,
            },
          },
        })
      }
    }

    await dispatchNotification({
      eventType: 'ticket_resolved',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${ticketId}` },
      recipients,
    })
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
  revalidateTag('lookup-projects')
  revalidateTag('lookup-developers')
  revalidateTag('module-ticket-stats', { expire: 60 })
  revalidateTag('project-ticket-analytics', { expire: 60 })
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })
  revalidateTag('ticket-by-id', { expire: 60 })
})

// ── Assignment ─────────────────────────────────────────────────────────────

export const assignTicket = wrapServerAction('assignTicket', async function assignTicket(ticketId: number, developerId: string, skipEstimateWorkflow = false) {
  const currentUser = await getUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers can assign tickets')
  }

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')

  await db.update(ticket).set({
    assignedToId: developerId, assignedById: currentUser.id,
    assignedAt: new Date(), status: 'assigned', updatedAt: new Date(),
    // Persist the skip-estimate state: "Assign Directly" skips the estimate
    // workflow, which makes this ticket's worklogs NON-BILLABLE.
    ...(skipEstimateWorkflow ? { estimateWorkflowSkipped: true } : {}),
  }).where(eq(ticket.id, ticketId))

  const [developer] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, developerId)).limit(1)

  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'assigned',
    oldValue: t.assignedToId, newValue: developer?.name,
  })

  if (developer) {
    const ticketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + ticketId
    const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = []

    // Assigned developer: In-App + Email + Teams
    recipients.push({
      userId: developerId,
      inApp: {
        title: 'Ticket assigned to you',
        message: `Ticket #${t.ticketNumber} has been assigned to you by ${currentUser.name}.`,
        link: `/dashboard/tickets/${ticketId}`,
        ticketId,
      },
      email: {
        templateData: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          clientName: currentUser.name || currentUser.id,
          developerName: developer.name,
          priority: t.priority,
          ticketLink,
        },
      },
      teams: {
        payload: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          clientName: currentUser.name || currentUser.id,
          developerName: developer.name,
          priority: t.priority,
          url: ticketLink,
        },
      },
    })

    // Also notify the client that ticket has been assigned (In-App + Email + Teams)
    if (t.clientId) {
      recipients.push({
        userId: t.clientId,
        inApp: {
          title: 'Ticket Assigned',
          message: `Ticket #${t.ticketNumber} (${t.title}) has been assigned to ${developer.name}.`,
          link: `/dashboard/tickets/${ticketId}`,
          ticketId,
        },
        email: {
          templateData: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            developerName: developer.name,
            priority: t.priority,
            ticketLink,
          },
        },
        teams: {
          payload: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            developerName: developer.name,
            priority: t.priority,
            url: ticketLink,
          },
        },
      })
    }

    await dispatchNotification({
      eventType: 'ticket_assigned',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${ticketId}` },
      recipients,
    })
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/assignments')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
  revalidateTag('lookup-projects')
  revalidateTag('lookup-developers')
  revalidateTag('module-ticket-stats', { expire: 60 })
  revalidateTag('project-ticket-analytics', { expire: 60 })
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })
  revalidateTag('ticket-by-id', { expire: 60 })
})

// ── Manager Review Actions ─────────────────────────────────────────────────

export const managerForwardToClient = wrapServerAction('managerForwardToClient', async function managerForwardToClient(ticketId: number) {
  const currentUser = await getUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers can forward tickets to client')
  }

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')
  if (t.status !== 'resolved') throw new Error('Ticket must be resolved before forwarding to client')

  await db.update(ticket).set({ status: 'client_review', updatedAt: new Date() }).where(eq(ticket.id, ticketId))

  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'forwarded_to_client', newValue: 'Forwarded for client review',
  })

  // Forwarded for client review: In-App + Email + Teams
  const forwardTicketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + ticketId
  await dispatchNotification({
    eventType: 'ticket_resolved',
    triggeredBy: currentUser.id,
    dedup: { scope: `ticket:${ticketId}` },
    recipients: [
      {
        userId: t.clientId,
        inApp: {
          title: 'Ticket ready for your review',
          message: `Your ticket #${t.ticketNumber} has been resolved and is awaiting your approval.`,
          link: `/dashboard/tickets/${ticketId}`,
          ticketId,
        },
        email: {
          templateData: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            resolvedBy: currentUser.name || 'Manager',
            resolutionSummary: '',
            ticketLink: forwardTicketLink,
          },
        },
        teams: {
          payload: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            resolvedBy: currentUser.name || 'Manager',
            url: forwardTicketLink,
          },
        },
      },
    ],
  })

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
  revalidateTag('lookup-projects')
  revalidateTag('module-ticket-stats', { expire: 60 })
  revalidateTag('project-ticket-analytics', { expire: 60 })
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })
  revalidateTag('ticket-by-id', { expire: 60 })
})

export const managerReassignDeveloper = wrapServerAction('managerReassignDeveloper', async function managerReassignDeveloper(ticketId: number, newDeveloperId: string) {
  const currentUser = await getUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers can reassign tickets')
  }

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')

  const [developer] = await db.select({ name: user.name }).from(user).where(eq(user.id, newDeveloperId)).limit(1)

  await db.update(ticket).set({
    assignedToId: newDeveloperId, assignedById: currentUser.id,
    assignedAt: new Date(), status: 'assigned', resolvedAt: null, updatedAt: new Date(),
  }).where(eq(ticket.id, ticketId))

  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'reassigned', newValue: developer?.name || newDeveloperId,
  })

  // Ticket Reassigned: In-App + Email + Teams to the new developer
  const ticketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + ticketId
  await dispatchNotification({
    eventType: 'ticket_reassigned',
    triggeredBy: currentUser.id,
    dedup: { scope: `ticket:${ticketId}` },
    recipients: [
      {
        userId: newDeveloperId,
        inApp: {
          title: 'Ticket reassigned to you',
          message: `Ticket #${t.ticketNumber} has been reassigned to you.`,
          link: `/dashboard/tickets/${ticketId}`,
          ticketId,
        },
        email: {
          templateData: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            assignedBy: currentUser.name || 'Manager',
            newDeveloper: developer?.name || newDeveloperId,
            priority: t.priority,
            ticketLink,
          },
        },
        teams: {
          payload: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            assignedBy: currentUser.name || 'Manager',
            newDeveloper: developer?.name || newDeveloperId,
            priority: t.priority,
            url: ticketLink,
          },
        },
      },
    ],
  })

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
  revalidateTag('lookup-projects')
  revalidateTag('module-ticket-stats', { expire: 60 })
  revalidateTag('project-ticket-analytics', { expire: 60 })
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })
  revalidateTag('ticket-by-id', { expire: 60 })
})

// ── Client Approval Actions ────────────────────────────────────────────────

export const clientApproveTicket = wrapServerAction('clientApproveTicket', async function clientApproveTicket(ticketId: number) {
  const currentUser = await getUser()
  if (currentUser.role !== 'client') throw new Error('Only clients can approve tickets')

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')
  if (t.clientId !== currentUser.id) throw new Error('Access denied')
  if (t.status !== 'client_review') throw new Error('Ticket is not awaiting your approval')

  await db.update(ticket).set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() }).where(eq(ticket.id, ticketId))

  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'client_approved', newValue: 'closed',
  })

  // Wallet deduction
  if (t.projectId) {
    try {
      const [wallet] = await db.select().from(supportWallet).where(eq(supportWallet.projectId, t.projectId)).limit(1)
      if (wallet) {
        const estimatedHours = t.estimatedHours || 0
        const additionalHours = t.additionalHoursApproved ? (t.additionalHoursRequested || 0) : 0
        // NOTE: approved additional hours are already folded into estimatedHours
        // (approveAdditionalHours / the auto-approval job update estimatedHours to
        // the new total). Adding additionalHoursRequested again here would deduct
        // the additional hours TWICE, so the deduction is just estimatedHours.
        const totalDeduction = estimatedHours
        if (totalDeduction > 0) {
          // Phase 8: capture the balance BEFORE deduction so alerts only fire on
          // an actual threshold CROSSING, not on every ticket close.
          const previousRemaining = wallet.remainingHours
          const newConsumed = wallet.consumedHours + totalDeduction
          const newRemaining = Math.max(0, wallet.remainingHours - totalDeduction)
          await db.update(supportWallet).set({ consumedHours: newConsumed, remainingHours: newRemaining, updatedAt: new Date() }).where(eq(supportWallet.id, wallet.id))
          await db.insert(walletTransaction).values({
            walletId: wallet.id, transactionType: 'Deduct Hours', hours: totalDeduction,
            previousBalance: wallet.remainingHours, newBalance: newRemaining,
            reason: `Ticket #${t.ticketNumber} closed`,
            remarks: `${totalDeduction}h deducted on ticket close (est: ${estimatedHours}h${additionalHours > 0 ? `, additional: ${additionalHours}h` : ''}) - ${t.title}`,
            performedBy: currentUser.name || currentUser.id,
          })
          await db.update(ticket).set({ consumedHours: totalDeduction, updatedAt: new Date() }).where(eq(ticket.id, ticketId))

          // Send Wallet Low alert ONLY when crossing below the threshold.
          // (In-App + Email + Teams to client; Email + Teams to manager.)
          if (shouldNotifyWalletLow(previousRemaining, newRemaining)) {
            const walletLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/wallets/' + wallet.id
            const [projectRow] = await db
              .select({ projectName: project.projectName })
              .from(project)
              .where(eq(project.id, wallet.projectId!))
              .limit(1)
            const projectName = projectRow?.projectName || 'Support Wallet'
            const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = [
              {
                userId: wallet.clientId,
                inApp: {
                  title: 'Support Hours Running Low',
                  message: `Your support wallet balance is now ${newRemaining} hours (below the ${WALLET_LOW_THRESHOLD}h threshold).`,
                  link: `/dashboard/wallets/${wallet.id}`,
                },
                email: {
                  templateData: { projectName, remainingHours: newRemaining, threshold: WALLET_LOW_THRESHOLD, walletLink },
                },
                teams: {
                  payload: { projectName, remainingHours: newRemaining, threshold: WALLET_LOW_THRESHOLD, url: walletLink },
                },
              },
            ]

            if (wallet.projectId) {
              const [managerRow] = await db
                .select({ managerId: project.managerId })
                .from(project)
                .where(eq(project.id, wallet.projectId))
                .limit(1)
              if (managerRow?.managerId) {
                recipients.push({
                  userId: managerRow.managerId,
                  inApp: {
                    title: 'Client Support Hours Low',
                    message: `Support wallet for ${projectName} is now ${newRemaining} hours.`,
                    link: `/dashboard/wallets/${wallet.id}`,
                  },
                  email: {
                    templateData: { projectName, remainingHours: newRemaining, threshold: WALLET_LOW_THRESHOLD, walletLink },
                  },
                  teams: {
                    payload: { projectName, remainingHours: newRemaining, threshold: WALLET_LOW_THRESHOLD, url: walletLink },
                  },
                })
              }
            }

            await dispatchNotification({
              eventType: 'wallet_low',
              triggeredBy: currentUser.id,
              dedup: { scope: `wallet:${wallet.id}` },
              recipients,
            })
          }

          // Send Wallet Empty alert ONLY when crossing to zero.
          if (shouldNotifyWalletEmpty(previousRemaining, newRemaining)) {
            const walletLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/wallets/' + wallet.id
            const [projectRow] = await db
              .select({ projectName: project.projectName })
              .from(project)
              .where(eq(project.id, wallet.projectId!))
              .limit(1)
            const projectName = projectRow?.projectName || 'Support Wallet'
            const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = [
              {
                userId: wallet.clientId,
                inApp: {
                  title: 'Support Hours Exhausted',
                  message: `Your support wallet for ${projectName} is now empty. Please renew your support package.`,
                  link: `/dashboard/wallets/${wallet.id}`,
                },
                email: {
                  templateData: { projectName, walletLink },
                },
                teams: {
                  payload: { projectName, url: walletLink },
                },
              },
            ]

            if (wallet.projectId) {
              const [managerRow] = await db
                .select({ managerId: project.managerId })
                .from(project)
                .where(eq(project.id, wallet.projectId))
                .limit(1)
              if (managerRow?.managerId) {
                recipients.push({
                  userId: managerRow.managerId,
                  inApp: {
                    title: 'Client Support Hours Exhausted',
                    message: `Support wallet for ${projectName} is now empty.`,
                    link: `/dashboard/wallets/${wallet.id}`,
                  },
                  email: {
                    templateData: { projectName, walletLink },
                  },
                  teams: {
                    payload: { projectName, url: walletLink },
                  },
                })
              }
            }

            await dispatchNotification({
              eventType: 'wallet_empty',
              triggeredBy: currentUser.id,
              dedup: { scope: `wallet:${wallet.id}` },
              recipients,
            })
          }
        }
      }
    } catch (err) {
      console.error('[clientApproveTicket] wallet deduction failed:', err)
    }
  }

  // Ticket Closed: In-App + Email + Teams to developer and manager
  const closeTicketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + ticketId
  const closedRecipients: Parameters<typeof dispatchNotification>[0]['recipients'] = []

  if (t.assignedToId) {
    closedRecipients.push({
      userId: t.assignedToId,
      inApp: {
        title: 'Ticket approved and closed',
        message: `The client has approved and closed ticket #${t.ticketNumber}.`,
        link: `/dashboard/tickets/${ticketId}`,
        ticketId,
      },
      email: {
        templateData: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          closedBy: currentUser.name || 'Client',
          resolutionTime: '',
          feedbackLink: closeTicketLink,
        },
      },
      teams: {
        payload: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          closedBy: currentUser.name || 'Client',
          url: closeTicketLink,
        },
      },
    })
  }

  if (t.projectId) {
    const [projectRow] = await db
      .select({ managerId: project.managerId })
      .from(project)
      .where(eq(project.id, t.projectId))
      .limit(1)
    if (projectRow?.managerId) {
      closedRecipients.push({
        userId: projectRow.managerId,
        inApp: {
          title: 'Ticket Closed',
          message: `Ticket #${t.ticketNumber} (${t.title}) was approved and closed by the client.`,
          link: `/dashboard/tickets/${ticketId}`,
          ticketId,
        },
        email: {
          templateData: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            closedBy: currentUser.name || 'Client',
            resolutionTime: '',
            feedbackLink: closeTicketLink,
          },
        },
        teams: {
          payload: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            closedBy: currentUser.name || 'Client',
            url: closeTicketLink,
          },
        },
      })
    }
  }

  if (closedRecipients.length > 0) {
    await dispatchNotification({
      eventType: 'ticket_closed',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${ticketId}` },
      recipients: closedRecipients,
    })
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
  revalidateTag('lookup-projects')
  revalidateTag('module-ticket-stats', { expire: 60 })
  revalidateTag('project-ticket-analytics', { expire: 60 })
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })
  revalidateTag('ticket-by-id', { expire: 60 })
})

export const clientReopenTicket = wrapServerAction('clientReopenTicket', async function clientReopenTicket(ticketId: number, reason: string) {
  const currentUser = await getUser()
  if (currentUser.role !== 'client') throw new Error('Only clients can reopen tickets')

  const reasonErr = validateField(reason, VALIDATION.COMMENT_MAX_LENGTH, 'Reopen reason')
  if (reasonErr) throw new Error(reasonErr)

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')
  if (t.clientId !== currentUser.id) throw new Error('Access denied')
  if (t.status !== 'closed') throw new Error('Only closed tickets can be reopened')
  if (t.closedAt) {
    const daysSinceClosed = Math.floor((Date.now() - new Date(t.closedAt).getTime()) / (1000 * 60 * 60 * 24))
    if (daysSinceClosed >= 7) {
      throw new Error('This ticket was closed more than 7 days ago and can no longer be reopened. Please create a new ticket instead.')
    }
  }

  await db.update(ticket).set({ status: 'in_progress', closedAt: null, updatedAt: new Date() }).where(eq(ticket.id, ticketId))

  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'reopened_by_client',
    oldValue: 'closed', newValue: `reopened: ${reason}`,
  })
  await db.insert(comment).values({
    ticketId, userId: currentUser.id, content: `Ticket reopened: ${reason}`, isInternal: false,
  })

  // Ticket Reopened: In-App + Email + Teams to developer and manager
  const ticketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + ticketId
  const reopenedRecipients: Parameters<typeof dispatchNotification>[0]['recipients'] = []

  if (t.assignedToId) {
    reopenedRecipients.push({
      userId: t.assignedToId,
      inApp: {
        title: 'Ticket Reopened',
        message: `Ticket #${t.ticketNumber} (${t.title}) was reopened by ${currentUser.name || currentUser.id}: ${reason}`,
        link: `/dashboard/tickets/${ticketId}`,
        ticketId,
      },
      email: {
        templateData: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          reopenedBy: currentUser.name || currentUser.id,
          reopenReason: reason,
          ticketLink,
        },
      },
      teams: {
        payload: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          reopenedBy: currentUser.name || currentUser.id,
          reopenReason: reason,
          url: ticketLink,
        },
      },
    })
  }

  if (t.projectId) {
    const [projectRow] = await db
      .select({ managerId: project.managerId })
      .from(project)
      .where(eq(project.id, t.projectId))
      .limit(1)
    if (projectRow?.managerId) {
      reopenedRecipients.push({
        userId: projectRow.managerId,
        inApp: {
          title: 'Ticket Reopened',
          message: `Ticket #${t.ticketNumber} (${t.title}) was reopened by ${currentUser.name || currentUser.id}.`,
          link: `/dashboard/tickets/${ticketId}`,
          ticketId,
        },
        email: {
          templateData: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            reopenedBy: currentUser.name || currentUser.id,
            reopenReason: reason,
            ticketLink,
          },
        },
        teams: {
          payload: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            reopenedBy: currentUser.name || currentUser.id,
            reopenReason: reason,
            url: ticketLink,
          },
        },
      })
    }
  }

  if (reopenedRecipients.length > 0) {
    await dispatchNotification({
      eventType: 'ticket_reopened',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${ticketId}` },
      recipients: reopenedRecipients,
    })
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
  revalidateTag('lookup-projects')
  revalidateTag('module-ticket-stats', { expire: 60 })
  revalidateTag('project-ticket-analytics', { expire: 60 })
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })
  revalidateTag('ticket-by-id', { expire: 60 })
})

// ── Form Dropdown Data ─────────────────────────────────────────────────────

export const getTicketFormClients = wrapServerAction('getTicketFormClients', async function getTicketFormClients() {
  const currentUser = await getUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') return []
  const clients = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.role, 'client')).orderBy(user.name)
  return clients
})

export const getTicketFormProjects = wrapServerAction('getTicketFormProjects', async function getTicketFormProjects(clientId?: string) {
  const currentUser = await getUser()
  
  if (currentUser.role === 'client') {
    // Check both: direct project.clientId match AND project_client junction table
    // This ensures ALL client users (primary + secondary) can see their projects.
    const [directProjects, linkedProjectIds] = await Promise.all([
      db.select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode })
        .from(project).where(and(eq(project.clientId, currentUser.id), eq(project.status, 'active'))).orderBy(project.projectName),
      db.select({ projectId: projectClient.projectId })
        .from(projectClient)
        .where(eq(projectClient.userId, currentUser.id)),
    ])

    // Collect all unique project IDs
    const projectIds = new Set([
      ...directProjects.map((p) => p.id),
      ...linkedProjectIds.map((pc) => pc.projectId),
    ])

    if (projectIds.size === 0) return []

    return db.select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode })
      .from(project)
      .where(and(inArray(project.id, [...projectIds]), eq(project.status, 'active')))
      .orderBy(project.projectName)
  }
  
  if (clientId) {
    // Check both: direct project.clientId match AND project_client junction table for the selected client
    const [directProjects, linkedProjectIds] = await Promise.all([
      db.select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode })
        .from(project).where(and(eq(project.clientId, clientId), eq(project.status, 'active'))).orderBy(project.projectName),
      db.select({ projectId: projectClient.projectId })
        .from(projectClient)
        .where(eq(projectClient.userId, clientId)),
    ])

    const projectIds = new Set([
      ...directProjects.map((p) => p.id),
      ...linkedProjectIds.map((pc) => pc.projectId),
    ])

    if (projectIds.size === 0) return []

    return db.select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode })
      .from(project)
      .where(and(inArray(project.id, [...projectIds]), eq(project.status, 'active')))
      .orderBy(project.projectName)
  }
  
  return db.select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode })
    .from(project).where(eq(project.status, 'active')).orderBy(project.projectName)
})

export const getTicketFormModules = wrapServerAction('getTicketFormModules', async function getTicketFormModules(projectId: number) {
  console.log('[getTicketFormModules] Request for projectId:', projectId)
  const mods = await db.select({ id: moduleTable.id, moduleName: moduleTable.moduleName })
    .from(moduleTable).where(and(eq(moduleTable.projectId, projectId), eq(moduleTable.status, 'active'))).orderBy(moduleTable.moduleName)
  console.log('[getTicketFormModules] Found modules:', JSON.stringify(mods))
  return mods
})
