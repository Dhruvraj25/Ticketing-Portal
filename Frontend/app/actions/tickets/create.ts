// @ts-nocheck
'use server'

import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { getPortalUrl } from '@/lib/urls'
import { db } from '@/lib/db'
import { ticket, ticketHistory, user, project, supportWallet, walletTransaction, module as moduleTable } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { TicketPriority, TicketCategory } from '@/lib/types'
import { dispatchNotification } from '@/lib/notify-all'
import { VALIDATION, validateField } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'
import {
  type TicketType,
  validateSupportHoursConsumed,
  checkWalletSufficiency,
  validateHistoricalDates,
  deriveHistoricalTicketFields,
  deriveEstimateWorkflowSkipped,
  planWalletDeduction,
} from '@/lib/historical-ticket'
import { validateModuleSelection } from '@/lib/module-selection'
import { isAtOrBelowCreateThreshold, buildWalletThresholdError, buildWalletInsufficientError } from '@/lib/wallet-validation'
import { createAppError } from '@/lib/error-utils'
import { findTicketWallet } from '@/lib/ticket-wallet'

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
  // Phase 3 — Historical / On Behalf of Client ticket creation (admin/manager only).
  ticketType?: TicketType
  estimateApprovalRequired?: boolean
  supportHoursConsumed?: number
  historicalCreatedAt?: string
  historicalClosedAt?: string | null
}) {
  const currentUser = await getUser()

  // Ticket Type is an admin/project_manager-only concept — never trust the
  // client, re-check server-side (same pattern as the isOverrideTicket guard
  // below). A client/developer-supplied ticketType is silently ignored by
  // every other branch below since they never resolve a non-'client' role,
  // but reject explicitly here for a clear error instead of a silent no-op.
  if (data.ticketType && currentUser.role !== 'admin' && currentUser.role !== 'project_manager') {
    throw new Error('Only admins and project managers can set a ticket type')
  }

  const titleErr = validateField(data.title, VALIDATION.TICKET_TITLE_MAX_LENGTH, 'Title')
  if (titleErr) throw new Error(titleErr)
  const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
  if (descErr) throw new Error(descErr)

  let actualClientId = currentUser.id
  if (currentUser.role !== 'client' && data.clientId) {
    actualClientId = data.clientId
  }

  if (data.isOverrideTicket) {
    if (currentUser.role === 'client') throw new Error('Clients cannot create override tickets')
    if (!data.overrideReason) throw new Error('Override reason is required')
    const validReasons = ['Critical Production Issue', 'Contract Renewal In Progress', 'Emergency Support', 'Management Approval']
    if (!validReasons.includes(data.overrideReason)) throw new Error('Invalid override reason')
  }

  // ── Section 11: a project_manager may only create tickets for a client via
  // a project they actually manage — never trust the frontend's role/project
  // pairing. Admin always passes. Reuses the established single-manager-per-
  // project ownership pattern already used throughout this codebase (e.g.
  // app/actions/projects/queries.ts, app/actions/wallet/queries.ts).
  if (currentUser.role === 'project_manager' && data.projectId) {
    const [projectRow] = await db.select({ managerId: project.managerId }).from(project).where(eq(project.id, data.projectId)).limit(1)
    if (projectRow && projectRow.managerId !== currentUser.id) {
      throw createAppError('You are not authorized to create tickets for this project (access denied).', 'WALLET_CLIENT_ASSOCIATION_INVALID')
    }
  }

  // ── Support Wallet validation (sections 1-3) ────────────────────────────
  // Historical tickets are exempt from this generic gate — they represent
  // already-completed past work being backdated, not new work being opened,
  // and are instead governed by their own dedicated wallet-sufficiency check
  // against the exact Support Hour Consumed amount (see the historical block
  // further down, which already correctly hard-rejects with no role bypass).
  if (data.ticketType !== 'historical') {
    // The ticket's wallet (the client's own, else the project owner's — see
    // lib/ticket-wallet.ts). remainingHours is the AVAILABLE balance: hours
    // reserved by approved estimates on other tickets are already excluded.
    const wallet = await findTicketWallet(db, { clientId: actualClientId, projectId: data.projectId ?? null })
    if (wallet) {
      // Section 1/2: the 10% remaining-balance threshold blocks a CLIENT
      // creating their own ticket only — admin/project_manager are an
      // explicit exception for THIS rule (and only this rule).
      if (currentUser.role === 'client' && isAtOrBelowCreateThreshold(wallet)) {
        throw buildWalletThresholdError()
      }
      // Section 3: if this ticket carries an upfront estimate (e.g. an
      // override ticket), the estimate can never exceed the wallet's actual
      // remaining balance — for EVERY role, no exceptions.
      if (data.estimatedHours && data.estimatedHours > 0) {
        const sufficiencyCheck = checkWalletSufficiency(data.estimatedHours, wallet.remainingHours)
        if (!sufficiencyCheck.ok) throw buildWalletInsufficientError(data.estimatedHours, wallet.remainingHours)
      }
    }
  }

  // ── Phase 3: Ticket Type (On Behalf of Client / Historical) ───────────────
  // Both types require an explicit target client — staff must pick who the
  // ticket is for, it's never implicitly "themselves" the way a plain staff
  // ticket with no clientId would otherwise resolve.
  if (data.ticketType && !data.clientId) {
    throw new Error('A client must be selected for this ticket type')
  }

  // Historical: validate everything BEFORE any DB write, so a validation
  // failure can never leave a partial ticket or a wallet deduction behind
  // ("Prevent ticket creation if wallet deduction cannot safely be
  // completed" / "Prevent wallet deduction if ticket creation fails").
  let historicalPlan: {
    fields: ReturnType<typeof deriveHistoricalTicketFields>
    walletId: number
    deduction: ReturnType<typeof planWalletDeduction>
  } | null = null

  if (data.ticketType === 'historical') {
    const hoursCheck = validateSupportHoursConsumed(data.supportHoursConsumed)
    if (!hoursCheck.valid) throw new Error(hoursCheck.error)

    const parsedCreatedAt = data.historicalCreatedAt ? new Date(data.historicalCreatedAt) : null
    const parsedClosedAt = data.historicalClosedAt ? new Date(data.historicalClosedAt) : null
    const datesCheck = validateHistoricalDates(parsedCreatedAt, parsedClosedAt)
    if (!datesCheck.valid) throw new Error(datesCheck.error)

    const wallet = await findTicketWallet(db, { clientId: actualClientId, projectId: data.projectId ?? null })
    if (!wallet) throw new Error('This client has no Support Wallet — a historical ticket requires an existing wallet to deduct hours from.')

    const sufficiencyCheck = checkWalletSufficiency(hoursCheck.hours, wallet.remainingHours)
    if (!sufficiencyCheck.ok) throw new Error(sufficiencyCheck.error)

    historicalPlan = {
      fields: deriveHistoricalTicketFields({ createdAt: parsedCreatedAt!, closedAt: parsedClosedAt, supportHoursConsumed: hoursCheck.hours }),
      walletId: wallet.id,
      deduction: planWalletDeduction(wallet, hoursCheck.hours),
    }
  }

  // Phase 4: server-side module/service-area validation — never trust that a
  // moduleId submitted by the client actually belongs to the selected
  // project/client. Runs for every caller (client role included), before any
  // write, same discipline as the historical-ticket checks above.
  if (data.moduleId) {
    const [moduleRow] = await db.select({ id: moduleTable.id, projectId: moduleTable.projectId })
      .from(moduleTable).where(eq(moduleTable.id, data.moduleId)).limit(1)
    if (!moduleRow) throw new Error('Invalid module selected')

    let allowedProjectIds: number[] = []
    if (!data.projectId) {
      const { getTicketFormProjects } = await import('./update')
      const clientProjects = await getTicketFormProjects(actualClientId)
      allowedProjectIds = clientProjects.map((p: { id: number }) => p.id)
    }

    const moduleCheck = validateModuleSelection({
      moduleProjectId: moduleRow.projectId,
      selectedProjectId: data.projectId ?? null,
      allowedProjectIdsForClient: allowedProjectIds,
    })
    if (!moduleCheck.valid) throw new Error(moduleCheck.error)
  }

  const ticketNumber = generateTicketNumber()

  const baseValues = {
    ticketNumber,
    title: data.title,
    description: data.description,
    priority: data.priority,
    category: data.category,
    clientId: actualClientId,
    projectId: data.projectId ?? null,
    moduleId: data.moduleId ?? null,
    isOverrideTicket: data.isOverrideTicket ?? false,
    overrideReason: data.isOverrideTicket ? (data.overrideReason ?? null) : null,
    overrideBy: data.isOverrideTicket ? currentUser.id : null,
    overrideDate: data.isOverrideTicket ? new Date() : null,
    estimatedHours: data.estimatedHours ?? null,
  }

  let newTicket: any

  if (historicalPlan) {
    // Atomic: ticket insert + wallet deduction + activity log all succeed
    // together or all roll back together (TRANSACTION SAFETY requirement).
    const plan = historicalPlan
    const result = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(ticket)
        .values({ ...baseValues, ...plan.fields })
        .returning()

      await tx.update(supportWallet).set({
        consumedHours: plan.deduction.newConsumed,
        remainingHours: plan.deduction.newRemaining,
        updatedAt: new Date(),
      }).where(eq(supportWallet.id, plan.walletId))

      await tx.insert(walletTransaction).values({
        walletId: plan.walletId,
        transactionType: 'Deduct Hours',
        hours: plan.fields.consumedHours,
        previousBalance: plan.deduction.previousBalance,
        newBalance: plan.deduction.newRemaining,
        reason: `Historical ticket #${inserted.ticketNumber} created`,
        remarks: `${plan.fields.consumedHours}h deducted for historical ticket entry - ${inserted.title}`,
        performedBy: currentUser.name || currentUser.id,
      })

      await tx.insert(ticketHistory).values({
        ticketId: inserted.id,
        userId: currentUser.id,
        action: 'created',
        newValue: `Historical ticket created (${plan.fields.consumedHours}h consumed)`,
      })

      return inserted
    })
    newTicket = result
    const { invalidateWalletCaches } = await import('@/app/actions/wallet')
    await invalidateWalletCaches(historicalPlan.walletId)
  } else {
    const [inserted] = await db
      .insert(ticket)
      .values({
        ...baseValues,
        status: 'new',
        // On Behalf of Client forces the estimate-approval workflow ON
        // (estimateWorkflowSkipped: false); a plain client/no-type ticket
        // leaves the column untouched at its DB default.
        ...(data.ticketType ? { estimateWorkflowSkipped: deriveEstimateWorkflowSkipped(data.ticketType, !!data.estimateApprovalRequired) } : {}),
      })
      .returning()
    newTicket = inserted

    await db.insert(ticketHistory).values({
      ticketId: newTicket.id,
      userId: currentUser.id,
      action: data.isOverrideTicket ? 'override_created' : 'created',
      newValue: data.isOverrideTicket ? `Override ticket created (${data.overrideReason})` : 'Ticket created',
    })
  }

  // Historical tickets represent already-completed past work — announcing
  // them as "just created" today (the notification/email copy always uses
  // today's date) would be misleading, so skip the creation notification for
  // that type only. On Behalf of Client keeps normal notification behavior.
  if (data.ticketType !== 'historical') {
    // Send Ticket Created email to project manager and client (fire-and-forget)
    sendTicketCreatedNotification(currentUser, newTicket, data, actualClientId).catch((err: Error) => {
      console.error('[Email] ticket_created notification failed:', err)
    })
  }

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
  const ticketLink = getPortalUrl() + '/dashboard/tickets/' + newTicket.id
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
    // Trusted, server-resolved project (the ticket row this function just
    // inserted) — enables project-wise preference enforcement for CLIENT
    // recipients only; internal recipients are unaffected (see notify-all.ts).
    projectId: newTicket.projectId ?? undefined,
  })
}
