// @ts-nocheck
'use server'

import { db } from '@/lib/db'
import { supportWallet, notification as notificationSchema, ticketHistory } from '@/lib/db/schema'
import { and, eq, gte } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-utils'

// ─── Internal implementation (no getCurrentUser — accepts currentUser object) ─

export async function _getClientRenewalStatusImpl(currentUser: { id: string; role: string }) {
  if (currentUser.role !== 'client') {
    return { showReminder: false }
  }

  const clientId = currentUser.id
  const [wallet] = await db
    .select({
      id: supportWallet.id,
      remainingHours: supportWallet.remainingHours,
      totalPurchasedHours: supportWallet.totalPurchasedHours,
      contractStartDate: supportWallet.contractStartDate,
      contractEndDate: supportWallet.contractEndDate,
    })
    .from(supportWallet)
    .where(eq(supportWallet.clientId, clientId))
    .limit(1)

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
        }).catch((err: Error) => console.error('[SupportHub] Failed to create renewal notification:', err))
      }
    } catch (err) {
      console.error('[SupportHub] Failed to check renewal notification:', err)
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

// ─── Check if client can create tickets ────────────────────────────────
export const checkClientCanCreateTicket = async function checkClientCanCreateTicket(
  clientId: string, projectId?: number | null
) {
  const conditions = [eq(supportWallet.clientId, clientId)]
  if (projectId) {
    conditions.push(eq(supportWallet.projectId, projectId))
  }

  const wallets = await db
    .select()
    .from(supportWallet)
    .where(and(...conditions))
    .limit(1)

  if (wallets.length === 0) {
    return { canCreate: true, reason: null }
  }

  const wallet = wallets[0]

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
