// @ts-nocheck
'use server'

import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { getPortalUrl } from '@/lib/urls'
import { db } from '@/lib/db'
import { ticket, ticketHistory, comment, timeLog, attachment, user, project, module as moduleTable, projectClient, supportWallet, walletTransaction } from '@/lib/db/schema'
import { eq, and, inArray, count, isNull } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { TicketStatus } from '@/lib/types'
import { dispatchNotification, shouldNotifyWalletLow, shouldNotifyWalletEmpty, WALLET_LOW_THRESHOLD } from '@/lib/notify-all'
import { VALIDATION, validateField } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'
import { buildWalletInsufficientError } from '@/lib/wallet-validation'
import { consumeReservedHoursAtomic, planClose } from '@/lib/wallet-reservation'
import { findTicketWallet, refreshWalletViews } from '@/lib/ticket-wallet'
import { ASSIGNABLE_STATUS, DIRECT_ASSIGNABLE_STATUS, canAssignResource, canBeAssignee } from '@/lib/ticket-assignment'
import { canCompleteWork, COMPLETE_REQUIRES_WORK_MESSAGE, reopenStatusFor } from '@/lib/ticket-work-flow'
import { canCloseTicket, clientTicketActionDenial, NO_TICKET_ACCESS_MESSAGE, type ClientActionResult } from '@/lib/client-ticket-rules'
import { getFriendlyError } from '@/lib/error-utils'
import { isClientOfTicketProject, ticketRaiserName } from '@/lib/client-ticket-permissions'

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
  // Completion only from work in progress (lib/ticket-work-flow.ts): a newly
  // assigned or REOPENED ticket must go Start Work → timer → Complete first.
  if (newStatus === 'resolved' && !canCompleteWork(t.status)) {
    throw new Error(COMPLETE_REQUIRES_WORK_MESSAGE)
  }

  const updateData: Record<string, unknown> = { status: newStatus, updatedAt: new Date() }
  if (newStatus === 'resolved') updateData.resolvedAt = new Date()
  else if (newStatus === 'closed') updateData.closedAt = new Date()

  await db.update(ticket).set(updateData).where(eq(ticket.id, ticketId))
  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'status_changed',
    oldValue: t.status, newValue: newStatus,
  })

  // Send Manager Review notification (In-App + Email + Teams) to the project
  // manager. The CLIENT is intentionally NOT notified here: 'resolved' is an
  // internal, pre-manager-review state — the client cannot act on it yet (no
  // approve/reject action is shown until the manager forwards it to
  // 'client_review', see managerForwardToClient below). Notifying the client
  // "ready for your review" at this point was both premature (nothing for
  // them to do) and a duplicate of the correct notification sent on forward.
  if (newStatus === 'resolved' && t.clientId) {
    const ticketLink = (getPortalUrl()) + '/dashboard/tickets/' + ticketId
    const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = []

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
            title: 'Ticket Ready for Your Review',
            message: `${currentUser.name || 'Developer'} marked ticket #${t.ticketNumber} (${t.title}) resolved. Review it, then forward to the client or send it back for rework.`,
            link: `/dashboard/tickets/${ticketId}`,
            ticketId,
          },
          email: {
            eventType: 'manager_review',
            templateData: {
              ticketNumber: t.ticketNumber,
              ticketTitle: t.title,
              resolvedByName: currentUser.name || 'Developer',
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

    if (recipients.length > 0) {
      // Requirement #9 — approval email on EVERY distinct manager-review
      // cycle (resolve -> rework -> resolve again is a NEW cycle). revisionCount
      // only increases on each rework/revision (see app/actions/revisions.ts),
      // so it's a stable, already-tracked per-cycle marker — no new column.
      await dispatchNotification({
        eventType: 'manager_review',
        triggeredBy: currentUser.id,
        dedup: { scope: `ticket:${ticketId}:cycle:${t.revisionCount || 0}` },
        recipients,
      })
    }
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

// ── Ticket Priority Editing (Manager/Admin only) ───────────────────────────

export const updateTicketPriority = wrapServerAction('updateTicketPriority', async function updateTicketPriority(ticketId: number, priority: string) {
  const currentUser = await getUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can change ticket priority')
  }

  const valid = ['low', 'medium', 'high', 'urgent', 'critical']
  if (!valid.includes(priority)) throw new Error('Invalid priority')

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')

  await db.update(ticket).set({ priority, updatedAt: new Date() }).where(eq(ticket.id, ticketId))

  await db.insert(ticketHistory).values({
    ticketId,
    userId: currentUser.id,
    action: 'priority_changed',
    oldValue: t.priority,
    newValue: priority,
  })

  // Notify the assigned developer + client (in-app) about the priority change.
  try {
    const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = []
    if (t.assignedToId) {
      recipients.push({
        userId: t.assignedToId,
        channels: ['inApp'],
        inApp: {
          title: 'Priority Changed',
          message: `Priority for ticket #${t.ticketNumber} (${t.title}) changed to ${priority}.`,
          link: `/dashboard/tickets/${ticketId}`,
          ticketId,
        },
      })
    }
    if (t.clientId && t.clientId !== t.assignedToId) {
      recipients.push({
        userId: t.clientId,
        channels: ['inApp'],
        inApp: {
          title: 'Priority Changed',
          message: `Priority for ticket #${t.ticketNumber} (${t.title}) changed to ${priority}.`,
          link: `/dashboard/tickets/${ticketId}`,
          ticketId,
        },
      })
    }
    if (recipients.length > 0) {
      await dispatchNotification({
        eventType: 'ticket_priority_changed',
        triggeredBy: currentUser.id,
        dedup: { scope: `ticket:${ticketId}:${priority}` },
        recipients,
      })
    }
  } catch (err) {
    console.error('[Priority] notification failed:', err)
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })
  revalidateTag('ticket-by-id', { expire: 60 })
  return { success: true, priority }
})

/**
 * Who may be the resource (lib/ticket-assignment.ts canBeAssignee): a
 * developer, or a project manager of THIS ticket's project (a manager can
 * assign themselves there). Never trusts the id sent by the browser. Used by
 * both Assign and Reassign.
 */
async function assertAssignableResource(t: { projectId: number | null }, resourceId: string): Promise<void> {
  const [assignee] = await db.select({ role: user.role }).from(user).where(eq(user.id, resourceId)).limit(1)
  if (!assignee) throw new Error('The selected resource could not be found.')
  const managesProject = assignee.role === 'project_manager' && t.projectId
    ? (await db.select({ id: project.id }).from(project).where(and(eq(project.id, t.projectId), eq(project.managerId, resourceId))).limit(1)).length > 0
    : false
  if (!canBeAssignee({ role: assignee.role, managedProjectIds: managesProject && t.projectId ? [t.projectId] : [] }, t.projectId)) {
    throw new Error('This resource cannot be assigned to this ticket. Managers can only be assigned to tickets in projects they manage.')
  }
}

export const assignTicket = wrapServerAction('assignTicket', async function assignTicket(ticketId: number, developerId: string, skipEstimateWorkflow = false) {
  const currentUser = await getUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers can assign tickets')
  }

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) throw new Error('Ticket not found')

  // Lifecycle rule (lib/ticket-assignment.ts): assign only after the client has
  // approved the estimate (or, for "Assign Directly", from a NEW ticket), and
  // never over an existing assignee — changing the resource is Reassign.
  if (t.assignedToId) {
    throw new Error('This ticket is already assigned to a resource. Use Reassign to change it.')
  }
  if (!canAssignResource(t, skipEstimateWorkflow)) {
    throw new Error(
      skipEstimateWorkflow
        ? 'Assign Directly is only available for new tickets.'
        : 'A resource can be assigned only after the client approves the estimate.',
    )
  }

  await assertAssignableResource(t, developerId)

  // Atomic guard against duplicate/concurrent assignment (double-click, two
  // managers at once): the update only applies while the ticket is STILL
  // unassigned and in the expected status.
  const updated = await db.update(ticket).set({
    assignedToId: developerId, assignedById: currentUser.id,
    assignedAt: new Date(), status: 'assigned', updatedAt: new Date(),
    // Persist the skip-estimate state: "Assign Directly" skips the estimate
    // workflow, which makes this ticket's worklogs NON-BILLABLE.
    ...(skipEstimateWorkflow ? { estimateWorkflowSkipped: true } : {}),
  }).where(and(
    eq(ticket.id, ticketId),
    isNull(ticket.assignedToId),
    eq(ticket.status, skipEstimateWorkflow ? DIRECT_ASSIGNABLE_STATUS : ASSIGNABLE_STATUS),
  )).returning({ id: ticket.id })
  if (updated.length === 0) {
    throw new Error('This ticket was just assigned or changed status. Refresh to see its current state.')
  }

  const [developer] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, developerId)).limit(1)

  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'assigned',
    oldValue: t.assignedToId, newValue: developer?.name,
  })

  if (developer) {
    const ticketLink = (getPortalUrl()) + '/dashboard/tickets/' + ticketId
    const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = []

    // The developer's "Ticket Assigned" email shows which CLIENT the ticket
    // belongs to — this must be the ticket's actual client (t.clientId), never
    // the manager/admin performing the assignment (currentUser).
    let realClientName = 'Client'
    if (t.clientId) {
      const [clientRow] = await db.select({ name: user.name }).from(user).where(eq(user.id, t.clientId)).limit(1)
      if (clientRow?.name) realClientName = clientRow.name
    }

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
          clientName: realClientName,
          developerName: developer.name,
          priority: t.priority,
          ticketLink,
        },
      },
      teams: {
        payload: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          clientName: realClientName,
          developerName: developer.name,
          priority: t.priority,
          url: ticketLink,
        },
      },
    })

    // Also notify the client that ticket has been assigned (In-App + Email + Teams)
    // NOTE: developerName is intentionally omitted from the EMAIL templateData
    // below — the assigned-developer identity is internal-only and must never
    // appear in a client-facing email (CLIENT PRIVACY). In-App/Teams are
    // unrelated existing channels/workflows and are left unchanged.
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
      projectId: t.projectId ?? undefined,
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

  // Forwarded for client review: In-App + Email + Teams. This is the ONLY
  // point the client is told "ready for your review" — never on the
  // developer's earlier 'resolved' transition (see updateTicketStatus).
  const forwardTicketLink = (getPortalUrl()) + '/dashboard/tickets/' + ticketId
  await dispatchNotification({
    eventType: 'ticket_resolved',
    triggeredBy: currentUser.id,
    // Requirement #9 — approval email on EVERY distinct client-review cycle
    // (forward -> client requests changes -> rework -> forward again is a NEW
    // cycle). revisionCount only increases on each rework/revision, so it's a
    // stable, already-tracked per-cycle marker — no new column needed.
    dedup: { scope: `ticket:${ticketId}:cycle:${t.revisionCount || 0}` },
    projectId: t.projectId ?? undefined,
    recipients: [
      {
        userId: t.clientId,
        inApp: {
          title: 'Ticket ready for your review',
          message: `Your ticket #${t.ticketNumber} has been resolved and is awaiting your approval.`,
          link: `/dashboard/tickets/${ticketId}`,
          ticketId,
        },
        // resolvedBy (the manager/PM's name) is intentionally omitted here —
        // this template is client-only and must never reveal the internal
        // manager's identity (CLIENT PRIVACY). In-App/Teams below are
        // unrelated channels and keep their existing behavior.
        email: {
          templateData: {
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
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
  await assertAssignableResource(t, newDeveloperId)

  const [developer] = await db.select({ name: user.name }).from(user).where(eq(user.id, newDeveloperId)).limit(1)

  await db.update(ticket).set({
    assignedToId: newDeveloperId, assignedById: currentUser.id,
    assignedAt: new Date(), status: 'assigned', resolvedAt: null, updatedAt: new Date(),
  }).where(eq(ticket.id, ticketId))

  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'reassigned', newValue: developer?.name || newDeveloperId,
  })

  // Ticket Reassigned: In-App + Email + Teams to the new developer
  const ticketLink = (getPortalUrl()) + '/dashboard/tickets/' + ticketId
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

/**
 * Client "Approve & Complete". Returns a structured result — refusals and
 * failures are NEVER thrown: in production Next.js strips messages from errors
 * thrown by server actions, so a thrown refusal reached the UI as a generic /
 * minified React error instead of the real reason.
 */
export const clientApproveTicket = wrapServerAction('clientApproveTicket', async function clientApproveTicket(ticketId: number): Promise<ClientActionResult> {
  try {
    return await closeTicketAsClient(ticketId)
  } catch (err) {
    // Unexpected failure (e.g. database) — log server-side, return a safe message.
    console.error('[clientApproveTicket] failed:', err instanceof Error ? err.message : err)
    return { success: false, error: getFriendlyError(err) }
  }
})

async function closeTicketAsClient(ticketId: number): Promise<ClientActionResult> {
  const currentUser = await getUser()
  if (currentUser.role !== 'client') return { success: false, error: 'Only clients can approve tickets.' }

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!t) return { success: false, error: 'Ticket not found.' }
  // Only the client account that CREATED the ticket may close it
  // (lib/client-ticket-rules.ts). A colleague on the same project is told who
  // created it; anyone else learns nothing about the ticket. Checked BEFORE any
  // write, notification or activity-log entry.
  if (!canCloseTicket(currentUser, t.clientId)) {
    const actorOnProject = await isClientOfTicketProject(currentUser.id, t)
    const error = clientTicketActionDenial({
      actorId: currentUser.id,
      ticketClientId: t.clientId,
      raiserName: actorOnProject ? await ticketRaiserName(t.clientId) : null,
      actorOnProject,
      action: 'close',
    })
    return { success: false, error: error ?? NO_TICKET_ACCESS_MESSAGE }
  }
  if (t.status !== 'client_review') return { success: false, error: 'This ticket is not awaiting your approval.' }

  const estimatedHours = t.estimatedHours || 0
  const additionalHours = t.additionalHoursApproved ? (t.additionalHoursRequested || 0) : 0
  // NOTE: approved additional hours are already folded into estimatedHours
  // (approveAdditionalHours / the auto-approval job update estimatedHours to
  // the new total). Adding additionalHoursRequested again here would deduct
  // the additional hours TWICE, so the deduction is just estimatedHours.
  const totalDeduction = estimatedHours
  // Hours this ticket already holds in reserve (reserved when its estimate /
  // additional hours were approved — lib/wallet-reservation.ts). Closing
  // converts them to consumed hours; only a shortfall (e.g. tickets approved
  // before reservations existed) is taken from the available balance.
  const reservedOnTicket = t.reservedHours || 0

  // The ticket's wallet (raiser's, else the project owner's — lib/ticket-wallet.ts),
  // resolved once before the transaction. This pre-transaction snapshot is
  // used only for the wallet-low/-empty threshold-crossing comparison; the
  // never-negative guarantee comes from the atomic conditional UPDATE inside
  // the transaction below, not from this snapshot.
  let wallet: typeof supportWallet.$inferSelect | undefined
  if (totalDeduction > 0 || reservedOnTicket > 0) {
    wallet = (await findTicketWallet(db, t)) ?? undefined
  }

  // Section 6/12/19/20: the ticket status change, the wallet deduction, and
  // the activity-log entry all succeed together or all roll back together —
  // a ticket must never end up "closed" with a deduction that didn't (or
  // couldn't safely) happen, and the wallet must never be touched for a
  // close that doesn't end up committing. This is a deliberate behavior
  // change from the previous implementation: a ticket can now fail to close
  // if the client's wallet balance has become insufficient since the
  // estimate was approved (e.g. another ticket for the same client closed
  // and consumed hours in the interim) — the client sees a clear error
  // instead of the wallet silently going negative.
  let deductionResult: { remainingHours: number } | null = null
  const previousRemaining = wallet?.remainingHours ?? null

  let alreadyClosed = false
  await db.transaction(async (tx) => {
    // Claim the close: only one request can move client_review → closed, so a
    // double click can never settle the wallet twice.
    const [claimed] = await tx
      .update(ticket)
      .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(ticket.id, ticketId), eq(ticket.status, 'client_review')))
      .returning({ id: ticket.id })
    if (!claimed) {
      alreadyClosed = true
      return
    }
    const ticketUpdate: Record<string, unknown> = { reservedHours: 0 }

    if (wallet && (totalDeduction > 0 || reservedOnTicket > 0)) {
      const settled = await consumeReservedHoursAtomic(tx, wallet.id, totalDeduction, reservedOnTicket)
      if (!settled) {
        // The unreserved part of the deduction exceeds the AVAILABLE balance —
        // report the TRUE current value, not the pre-transaction snapshot.
        const [current] = await tx.select({ remainingHours: supportWallet.remainingHours }).from(supportWallet).where(eq(supportWallet.id, wallet.id)).limit(1)
        throw buildWalletInsufficientError(planClose(totalDeduction, reservedOnTicket).extraRequired, current?.remainingHours ?? wallet.remainingHours)
      }
      deductionResult = settled
      ticketUpdate.consumedHours = totalDeduction
      const previousBalance = settled.remainingHours - planClose(totalDeduction, reservedOnTicket).availableChange

      if (totalDeduction > 0) {
        await tx.insert(walletTransaction).values({
          walletId: wallet.id, transactionType: 'Deduct Hours', hours: totalDeduction,
          previousBalance, newBalance: settled.remainingHours,
          reason: `Ticket #${t.ticketNumber} closed`,
          remarks: `${totalDeduction}h deducted on ticket close (est: ${estimatedHours}h${additionalHours > 0 ? `, additional: ${additionalHours}h` : ''}` +
            `${reservedOnTicket > 0 ? `; ${Math.min(reservedOnTicket, totalDeduction)}h from reserved hours` : ''}) - ${t.title}`,
          performedBy: currentUser.name || currentUser.id,
        })
      }
    }

    await tx.update(ticket).set(ticketUpdate).where(eq(ticket.id, ticketId))

    await tx.insert(ticketHistory).values({
      ticketId, userId: currentUser.id, action: 'client_approved', newValue: 'closed',
    })
  })
  // Another request closed it first — nothing was written by this one.
  if (alreadyClosed) return { success: false, error: 'This ticket is not awaiting your approval.' }
  if (wallet) refreshWalletViews(wallet.id)

  // Post-commit: wallet-low/wallet-empty alerts, firing only after a
  // SUCCESSFUL, committed deduction (never for a close that didn't deduct,
  // and never for one that aborted).
  if (wallet && deductionResult && previousRemaining !== null) {
    try {
      {
        const newRemaining = (deductionResult as { remainingHours: number }).remainingHours

          // Send Wallet Low alert ONLY when crossing below the threshold.
          // (In-App + Email + Teams to client; Email + Teams to manager.)
          if (shouldNotifyWalletLow(previousRemaining, newRemaining)) {
            const walletLink = (getPortalUrl()) + '/dashboard/wallets/' + wallet.id
            const [projectRow] = await db
              .select({ projectName: project.projectName })
              .from(project)
              .where(eq(project.id, t.projectId!))
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

            if (t.projectId) {
              const [managerRow] = await db
                .select({ managerId: project.managerId })
                .from(project)
                .where(eq(project.id, t.projectId))
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
              projectId: t.projectId ?? undefined,
            })
          }

          // Send Wallet Empty alert ONLY when crossing to zero.
          if (shouldNotifyWalletEmpty(previousRemaining, newRemaining)) {
            const walletLink = (getPortalUrl()) + '/dashboard/wallets/' + wallet.id
            const [projectRow] = await db
              .select({ projectName: project.projectName })
              .from(project)
              .where(eq(project.id, t.projectId!))
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

            if (t.projectId) {
              const [managerRow] = await db
                .select({ managerId: project.managerId })
                .from(project)
                .where(eq(project.id, t.projectId))
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
              projectId: t.projectId ?? undefined,
            })
          }
      }
    } catch (err) {
      // The deduction already committed inside the transaction above — a
      // failure here is purely a best-effort alert/notification problem,
      // never a reason to undo or fail the (already-successful) ticket close.
      console.error('[clientApproveTicket] wallet-low/-empty notification failed:', err)
    }
  }

  // Ticket Closed: In-App + Email + Teams to developer and manager
  const closeTicketLink = (getPortalUrl()) + '/dashboard/tickets/' + ticketId
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

  // Ticket Closed — Client (Email only). The template's own copy is written
  // for the client ("Thank you for your business!", "Leave Feedback"), but
  // the client was never actually a recipient — only the developer/manager
  // were. currentUser IS the client in this flow (role-guarded above), so
  // "closedBy: 'You'" is self-referential, not an internal-name leak.
  // In-App/Teams are intentionally not added here (not requested; the client
  // is the one who just took this action).
  if (t.clientId) {
    closedRecipients.push({
      userId: t.clientId,
      channels: ['email'],
      email: {
        templateData: {
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          closedBy: 'You',
          resolutionTime: '',
          feedbackLink: closeTicketLink,
        },
      },
    })
  }

  if (closedRecipients.length > 0) {
    // Cycle-aware dedup: a ticket can be closed, reopened (clientReopenTicket),
    // and closed again — each closure is a legitimate NEW event that must send
    // its own notification. ticketHistory's 'client_approved' action is
    // inserted exactly once per successful close (the status guard above
    // prevents this action from running twice for the same cycle), so its
    // running count is a stable, already-tracked per-cycle marker — no new
    // column needed. The just-inserted row for THIS close is already counted.
    const [{ value: closeCycleRaw }] = await db
      .select({ value: count() })
      .from(ticketHistory)
      .where(and(eq(ticketHistory.ticketId, ticketId), eq(ticketHistory.action, 'client_approved')))
    const closeCycle = Number(closeCycleRaw) || 1

    await dispatchNotification({
      eventType: 'ticket_closed',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${ticketId}:close:${closeCycle}` },
      recipients: closedRecipients,
      projectId: t.projectId ?? undefined,
    })
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/tickets/${ticketId}`)
  revalidateTag('lookup-projects')
  revalidateTag('module-ticket-stats', { expire: 60 })
  revalidateTag('project-ticket-analytics', { expire: 60 })
  revalidateTag('consolidated-dashboard-stats', { expire: 60 })
  revalidateTag('ticket-by-id', { expire: 60 })
  return { success: true }
}

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

  // Back to the resource, NOT started (lib/ticket-work-flow.ts) — like a newly
  // assigned ticket: Start Work → timer → Complete again. Time logs untouched.
  await db.update(ticket).set({ status: reopenStatusFor(t.assignedToId), closedAt: null, updatedAt: new Date() }).where(eq(ticket.id, ticketId))

  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'reopened_by_client',
    oldValue: 'closed', newValue: `reopened: ${reason}`,
  })
  await db.insert(comment).values({
    ticketId, userId: currentUser.id, content: `Ticket reopened: ${reason}`, isInternal: false,
  })

  // Ticket Reopened: In-App + Email + Teams to developer and manager
  const ticketLink = (getPortalUrl()) + '/dashboard/tickets/' + ticketId
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
    // Cycle-aware dedup — mirrors ticket_closed above: a ticket can be closed
    // and reopened multiple times (each within its own 7-day window), and
    // each reopen is a legitimate NEW event. 'reopened_by_client' is inserted
    // exactly once per successful reopen (the status guard above prevents a
    // second reopen of the same cycle), so its running count is a stable
    // per-cycle marker.
    const [{ value: reopenCycleRaw }] = await db
      .select({ value: count() })
      .from(ticketHistory)
      .where(and(eq(ticketHistory.ticketId, ticketId), eq(ticketHistory.action, 'reopened_by_client')))
    const reopenCycle = Number(reopenCycleRaw) || 1

    await dispatchNotification({
      eventType: 'ticket_reopened',
      triggeredBy: currentUser.id,
      dedup: { scope: `ticket:${ticketId}:reopen:${reopenCycle}` },
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

// Resolves every ACTIVE project id a client is associated with, whether via
// their own project.clientId (the primary/owning account) or via the
// project_client junction table (secondary org accounts — e.g. an "approver"
// account distinct from the primary client account). This is the one place
// that union-dedup query lives; getTicketFormProjects and getModulesForClient
// both call it so the two lists (projects, modules) never disagree about
// which projects belong to a given client.
async function getClientProjectIds(clientId: string): Promise<Set<number>> {
  const [directProjects, linkedProjectIds] = await Promise.all([
    db.select({ id: project.id })
      .from(project).where(and(eq(project.clientId, clientId), eq(project.status, 'active'))),
    db.select({ projectId: projectClient.projectId })
      .from(projectClient)
      .where(eq(projectClient.userId, clientId)),
  ])

  return new Set<number>([
    ...directProjects.map((p) => p.id),
    ...linkedProjectIds.map((pc) => pc.projectId),
  ])
}

export const getTicketFormProjects = wrapServerAction('getTicketFormProjects', async function getTicketFormProjects(clientId?: string) {
  const currentUser = await getUser()

  const resolvedClientId = currentUser.role === 'client' ? currentUser.id : clientId

  if (resolvedClientId) {
    const projectIds = await getClientProjectIds(resolvedClientId)
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

// Phase 4: every module/service area across every project associated with a
// client (used on ticket creation when no specific project has been chosen
// yet). Uses the same client→project resolution as getTicketFormProjects, so
// "all modules for this client" and "all projects for this client" always
// agree on which projects count.
export const getModulesForClient = wrapServerAction('getModulesForClient', async function getModulesForClient(clientId?: string) {
  const currentUser = await getUser()

  let resolvedClientId: string | undefined
  if (currentUser.role === 'client') {
    // Never trust a passed clientId for a client's own identity.
    resolvedClientId = currentUser.id
  } else if (currentUser.role === 'admin' || currentUser.role === 'project_manager') {
    resolvedClientId = clientId
  }

  if (!resolvedClientId) return []

  const projectIds = await getClientProjectIds(resolvedClientId)
  if (projectIds.size === 0) return []

  return db.select({ id: moduleTable.id, moduleName: moduleTable.moduleName })
    .from(moduleTable)
    .where(and(inArray(moduleTable.projectId, [...projectIds]), eq(moduleTable.status, 'active')))
    .orderBy(moduleTable.moduleName)
})
