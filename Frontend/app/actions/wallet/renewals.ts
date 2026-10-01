// @ts-nocheck
'use server'

import { db } from '@/lib/db'
import { supportWallet, notification as notificationSchema, ticketHistory, project, projectClient, user } from '@/lib/db/schema'
import { and, eq, gte, inArray, ne, or } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-utils'
import { isAtOrBelowCreateThreshold } from '@/lib/wallet-validation'
import { sendNotification } from '@/lib/email-backend'
import { getPortalUrl } from '@/lib/urls'
import { companiesByIds, companyIdOfUser, walletOfUser } from '@/lib/company-wallet'

// ─── Internal implementation (no getCurrentUser — accepts currentUser object) ─

export async function _getClientRenewalStatusImpl(currentUser: { id: string; role: string }) {
  if (currentUser.role !== 'client') {
    return { showReminder: false }
  }

  const clientId = currentUser.id
  // The company's shared wallet — every user of the company sees the same values.
  const wallet = await walletOfUser(db, clientId)

  if (!wallet) {
    return {
      showReminder: false, lowHours: false, expiringSoon: false,
      contractExpired: false, remainingHours: 0, totalPurchasedHours: 0,
      contractStartDate: null, contractEndDate: null, daysRemaining: 0, walletId: null,
    }
  }

  const lowHours = wallet.remainingHours <= 10
  let daysRemaining = 0, expiringSoon = false, contractExpired = false

  if (wallet.contractEndDate) {
    const end = new Date(wallet.contractEndDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)
    daysRemaining = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    contractExpired = daysRemaining <= 0
    expiringSoon = daysRemaining > 0 && daysRemaining <= 30
  }

  const showReminder = lowHours || expiringSoon || contractExpired

  if (showReminder) {
    try {
      const notificationTitle = contractExpired ? 'Support Contract Expired' : 'Support Renewal Reminder'
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

      const [existing] = await db
        .select({ id: notificationSchema.id })
        .from(notificationSchema)
        .where(and(
          eq(notificationSchema.userId, clientId),
          eq(notificationSchema.title, notificationTitle),
          gte(notificationSchema.createdAt, twentyFourHoursAgo),
        ))
        .limit(1)

      if (!existing) {
        let message: string
        if (contractExpired) {
          message = 'Your support contract has expired. Please renew your support package to continue creating tickets.'
        } else if (lowHours && expiringSoon) {
          message = `Your support hours are running low (${wallet.remainingHours}h remaining) and your contract expires in ${daysRemaining} days.`
        } else if (lowHours) {
          message = `Only ${wallet.remainingHours} support hours remaining. Please renew your support package.`
        } else {
          message = `Your support package expires in ${daysRemaining} days. Please renew your support package to avoid interruption.`
        }

        db.insert(notificationSchema).values({
          userId: clientId,
          title: notificationTitle,
          message,
          link: wallet.id ? `/dashboard/wallets/${wallet.id}` : '/dashboard/wallets',
          isRead: false,
        }).catch((err: Error) => console.error('[Support Hero] Failed to create renewal notification:', err))
      }
    } catch (err) {
      console.error('[Support Hero] Failed to check renewal notification:', err)
    }
  }

  return {
    showReminder, lowHours, expiringSoon, contractExpired,
    remainingHours: wallet.remainingHours,
    totalPurchasedHours: wallet.totalPurchasedHours,
    contractStartDate: wallet.contractStartDate,
    contractEndDate: wallet.contractEndDate,
    daysRemaining: Math.max(0, daysRemaining),
    walletId: wallet.id,
  }
}

// ─── Cross-request cached wrapper (primitives only, no headers()) ─────────

const getCachedClientRenewalStatus = unstable_cache(
  async (userId: string, role: string) => {
    return _getClientRenewalStatusImpl({ id: userId, role })
  },
  undefined,
  {
    tags: ['wallet-renewal'],
    revalidate: 120,
  }
)

// ─── Server Action (getCurrentUser called OUTSIDE cached wrapper) ─────────

export const getClientRenewalStatus = async function getClientRenewalStatus() {
  const { id: userId, role } = await getCurrentUser()
  return getCachedClientRenewalStatus(userId, role)
}

// ─── Log renewal reminder activity ────────────────────────────────────
export const logRenewalReminderActivity = async function logRenewalReminderActivity(action: string) {
  const currentUser = await getCurrentUser()
  if (currentUser.role === 'client') {
    db.insert(ticketHistory).values({
      ticketId: 0,
      userId: currentUser.id,
      action: `Support Renewal: ${action}`,
      newValue: `Client ${currentUser.name || currentUser.id}: ${action}`,
    }).catch(() => {})
  }
}

// ─── Renew Now → email the client's Project Manager ────────────────────
// Client Dashboard "Renew Now" no longer navigates to the Support Wallet; it
// asks the client's Project Manager(s) for renewal / additional hours via the
// existing backend email bridge ('support_renewal_request' event).
export const requestSupportRenewal = async function requestSupportRenewal(): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'client') {
    return { success: false, error: 'Only client users can request a support renewal.' }
  }

  // The request is for the COMPANY wallet: the company's projects (owned by any
  // of its users) plus any project this user is assigned to.
  const companyId = await companyIdOfUser(db, currentUser.id)
  const assigned = await db
    .select({ projectId: projectClient.projectId })
    .from(projectClient)
    .where(eq(projectClient.userId, currentUser.id))
  const assignedIds = assigned.map((a) => a.projectId)
  const companyUserIds = companyId
    ? (await db.select({ id: user.id }).from(user).where(and(eq(user.companyId, companyId), eq(user.role, 'client')))).map((u) => u.id)
    : [currentUser.id]

  const projects = await db
    .select({ projectName: project.projectName, managerId: project.managerId })
    .from(project)
    .where(and(
      ne(project.status, 'archived'),
      assignedIds.length > 0
        ? or(inArray(project.clientId, companyUserIds), inArray(project.id, assignedIds))
        : inArray(project.clientId, companyUserIds),
    ))

  const managerIds = [...new Set(projects.map((p) => p.managerId).filter(Boolean))]
  if (managerIds.length === 0) {
    return { success: false, error: 'No Project Manager is assigned to your project yet. Please contact support.' }
  }

  const [managers, [client], companies] = await Promise.all([
    db.select({ email: user.email }).from(user).where(inArray(user.id, managerIds)),
    db.select({ name: user.name, email: user.email, companyName: user.companyName }).from(user).where(eq(user.id, currentUser.id)).limit(1),
    companiesByIds(db, [companyId]),
  ])
  const managerEmails = managers.map((m) => m.email).filter(Boolean)
  if (managerEmails.length === 0) {
    return { success: false, error: 'No Project Manager is assigned to your project yet. Please contact support.' }
  }

  const status = await _getClientRenewalStatusImpl(currentUser)
  const portalUrl = getPortalUrl()

  const sent = await sendNotification('support_renewal_request', managerEmails, {
    clientName: client?.name || currentUser.name || '',
    clientEmail: client?.email || '',
    customerCompanyName: (companyId ? companies.get(companyId)?.name : null) || client?.companyName || undefined,
    projectNames: [...new Set(projects.map((p) => p.projectName))],
    remainingHours: status.remainingHours,
    totalPurchasedHours: status.totalPurchasedHours,
    expiryDate: status.contractEndDate || undefined,
    isLowHours: status.lowHours,
    isExpiring: status.expiringSoon,
    isExpired: status.contractExpired,
    walletLink: status.walletId ? `${portalUrl}/dashboard/wallets/${status.walletId}` : `${portalUrl}/dashboard/wallets`,
  })

  if (!sent) {
    return { success: false, error: 'Failed to send your renewal request. Please try again.' }
  }

  logRenewalReminderActivity('Renewal Requested from Project Manager').catch(() => {})
  return { success: true }
}
// ─── Check if client can create tickets ────────────────────────────────
export const checkClientCanCreateTicket = async function checkClientCanCreateTicket(
  clientId: string, projectId?: number | null
) {
  // One wallet per company — the ticket's company wallet (project first, else the client's company).
  const { findTicketWallet } = await import('@/lib/ticket-wallet')
  const wallet = await findTicketWallet(db, { clientId, projectId: projectId ?? null })

  if (!wallet) {
    return { canCreate: true, reason: null }
  }

  // Check contract validity
  if (wallet.contractEndDate) {
    const endDate = new Date(wallet.contractEndDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    endDate.setHours(0, 0, 0, 0)

    if (endDate < today) {
      return {
        canCreate: false,
        reason: 'Your support contract has expired. Please contact your account manager to renew support.',
        walletId: wallet.id,
        remainingHours: wallet.remainingHours,
        contractExpired: true,
      }
    }

    const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysRemaining <= 30 && daysRemaining > 0) {
      return {
        canCreate: wallet.remainingHours > 10,
        warning: true,
        walletId: wallet.id,
        remainingHours: wallet.remainingHours,
        daysRemaining,
        reason: `Your support contract is expiring soon (${daysRemaining} days remaining). Please contact your account manager to renew support.`,
      }
    }
  }

  // Check remaining hours
  if (wallet.remainingHours <= 10) {
    return {
      canCreate: false,
      reason: 'Your support hours have been exhausted. Please renew your support package.',
      walletId: wallet.id,
      remainingHours: wallet.remainingHours,
    }
  }
  if (wallet.remainingHours <= 20) {
    return {
      canCreate: true,
      warning: true,
      walletId: wallet.id,
      remainingHours: wallet.remainingHours,
      reason: `Your support hours are running low (${wallet.remainingHours} hours remaining).`,
    }
  }

  return { canCreate: true, reason: null, walletId: wallet.id, remainingHours: wallet.remainingHours }
}

// ─── Section 1/8/22: client-side "can I create a ticket" threshold status ──
// Used by the ticket-creation form to disable/warn a CLIENT caller BEFORE
// submission — the actual enforcement lives server-side in createTicket()
// (app/actions/tickets/create.ts), which independently re-checks the same
// wallet row; this is UX only, per section 8/10 ("frontend state must not
// be trusted"). Deliberately separate from checkClientCanCreateTicket above
// (which has its own, unrelated flat-10-hour/contract-expiry concerns that
// this phase does not touch) — this is specifically the 10%-of-limit rule.
export const getMyWalletThresholdStatus = async function getMyWalletThresholdStatus() {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'client') {
    return { applicable: false, atOrBelowThreshold: false, remainingHours: null, totalPurchasedHours: null }
  }

  const wallet = await walletOfUser(db, currentUser.id)
  if (!wallet) {
    return { applicable: false, atOrBelowThreshold: false, remainingHours: null, totalPurchasedHours: null }
  }

  return {
    applicable: true,
    atOrBelowThreshold: isAtOrBelowCreateThreshold(wallet),
    remainingHours: wallet.remainingHours,
    totalPurchasedHours: wallet.totalPurchasedHours,
  }
}

// ─── Calculate remaining hours helper ──────────────────────────────────
export async function recalculateWallet(walletId: number) {
  const [w] = await db
    .select()
    .from(supportWallet)
    .where(eq(supportWallet.id, walletId))
    .limit(1)

  if (!w) throw new Error('Wallet not found')

  const remaining = w.totalPurchasedHours - w.consumedHours - w.reservedHours

  await db
    .update(supportWallet)
    .set({
      remainingHours: Math.max(0, remaining),
      updatedAt: new Date(),
    })
    .where(eq(supportWallet.id, walletId))

  return Math.max(0, remaining)
}
