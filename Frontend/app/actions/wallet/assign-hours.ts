// @ts-nocheck
'use server'

import { db } from '@/lib/db'
import { supportWallet, walletTransaction, walletAlert, project } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-utils'
import { dispatchNotification, resetNotificationState } from '@/lib/notify-all'
import { WALLET_CACHE_TAGS } from './constants'

// ─── Invalidate all wallet caches ──────────────────────────────────────
function invalidateWalletCaches(walletId: number) {
  revalidateTag('wallet-list')
  revalidateTag('wallet-stats')
  revalidateTag('wallet-low-balance')
  revalidateTag(WALLET_CACHE_TAGS.WALLET_DETAIL(walletId))
  revalidateTag('wallet-transactions')
  // Invalidate dashboard renewal banner cache — hours/contract changes affect it
  revalidateTag('renewal-status')
}

// ─── Add hours to wallet (with support validity) ─────────────────────
export const addWalletHours = async function addWalletHours(data: {
  walletId: number; hours: number; reason: string; remarks?: string;
  transactionType?: string; startDate?: string; endDate?: string;
}) {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can add hours')
  }
  if (data.hours <= 0) throw new Error('Hours must be a positive number')

  const [w] = await db
    .select()
    .from(supportWallet)
    .where(eq(supportWallet.id, data.walletId))
    .limit(1)
  if (!w) throw new Error('Wallet not found')

  const previousBalance = w.remainingHours
  const newTotalPurchased = w.totalPurchasedHours + data.hours
  const newRemaining = w.remainingHours + data.hours

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const effectiveStartDate = data.startDate || todayStr
  const effectiveEndDate = data.endDate || (() => {
    const start = new Date(effectiveStartDate + 'T00:00:00')
    start.setFullYear(start.getFullYear() + 1)
    return start.toISOString().split('T')[0]
  })()

  const [updated] = await db
    .update(supportWallet)
    .set({
      totalPurchasedHours: newTotalPurchased,
      remainingHours: newRemaining,
      contractStartDate: effectiveStartDate,
      contractEndDate: effectiveEndDate,
      status: w.status === 'inactive' ? 'active' : undefined,
      updatedAt: new Date(),
    })
    .where(eq(supportWallet.id, data.walletId))
    .returning()

  await db.insert(walletTransaction).values({
    walletId: data.walletId,
    transactionType: data.transactionType || 'Add Hours',
    hours: data.hours,
    previousBalance,
    newBalance: newRemaining,
    reason: data.reason,
    remarks: data.remarks || null,
    performedBy: currentUser.name || currentUser.id,
    validFrom: data.startDate || null,
    validTo: data.endDate || null,
  })

  await db.insert(walletAlert).values({
    walletId: data.walletId,
    alertType: 'wallet_recharged',
    message: `Support wallet recharged with ${data.hours} hours (${data.reason}). New balance: ${newRemaining} hours.${data.startDate ? ` Valid: ${data.startDate} to ${data.endDate || '—'}` : ''}`,
  })

  // ── Notifications via the unified dispatcher ────────────────────────────
  const walletLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/wallets/' + data.walletId
  const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = [
    {
      userId: w.clientId,
      inApp: {
        title: 'Support Hours Assigned',
        message: `Your support wallet has been assigned ${data.hours} hours${data.startDate ? ` (valid ${data.startDate} to ${data.endDate || '—'})` : ''}. New balance: ${newRemaining} hours.`,
        link: `/dashboard/wallets/${data.walletId}`,
      },
      email: {
        templateData: {
          addedHours: data.hours,
          newBalance: newRemaining,
          supportStartDate: data.startDate,
          supportEndDate: data.endDate,
          walletLink,
        },
      },
      teams: {
        payload: {
          assignedHours: data.hours, remainingBalance: newRemaining,
          supportStartDate: data.startDate, supportEndDate: data.endDate,
        },
      },
    },
  ]

  // Also notify the project manager (if wallet has a project)
  if (w.projectId) {
    const [projectRow] = await db
      .select({ managerId: project.managerId })
      .from(project)
      .where(eq(project.id, w.projectId))
      .limit(1)
    if (projectRow?.managerId) {
      recipients.push({
        userId: projectRow.managerId,
        inApp: {
          title: 'Support Hours Assigned',
          message: `Support wallet #${data.walletId} was recharged with ${data.hours} hours by ${currentUser.name || currentUser.id}.`,
          link: `/dashboard/wallets/${data.walletId}`,
        },
        email: {
          templateData: {
            addedHours: data.hours,
            newBalance: newRemaining,
            supportStartDate: data.startDate,
            supportEndDate: data.endDate,
            walletLink,
          },
        },
        teams: {
          payload: {
            assignedHours: data.hours,
            remainingBalance: newRemaining,
            supportStartDate: data.startDate,
            supportEndDate: data.endDate,
            url: walletLink,
          },
        },
      })
    }
  }

  await dispatchNotification({
    eventType: 'support_hours_assigned',
    triggeredBy: currentUser.id,
    dedup: { scope: `wallet:${data.walletId}` },
    recipients,
  })

  // Phase 8: hours were added — reset the wallet alert state so a future
  // threshold crossing can notify again (notify-on-crossing, not on every close).
  await resetNotificationState('wallet_low', `wallet:${data.walletId}`)
  await resetNotificationState('wallet_empty', `wallet:${data.walletId}`)

  invalidateWalletCaches(data.walletId)
  return updated
}

// ─── Deduct hours from wallet ─────────────────────────────────────────
export const deductWalletHours = async function deductWalletHours(data: {
  walletId: number; hours: number; reason: string; remarks?: string;
}) {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can deduct hours')
  }
  if (data.hours <= 0) throw new Error('Hours must be a positive number')

  const [w] = await db.select().from(supportWallet).where(eq(supportWallet.id, data.walletId)).limit(1)
  if (!w) throw new Error('Wallet not found')

  const previousBalance = w.remainingHours
  const newRemaining = Math.max(0, w.remainingHours - data.hours)
  const newConsumed = w.consumedHours + data.hours

  const [updated] = await db
    .update(supportWallet)
    .set({ consumedHours: newConsumed, remainingHours: newRemaining, updatedAt: new Date() })
    .where(eq(supportWallet.id, data.walletId))
    .returning()

  await db.insert(walletTransaction).values({
    walletId: data.walletId,
    transactionType: 'Deduct Hours',
    hours: data.hours, previousBalance, newBalance: newRemaining,
    reason: data.reason, remarks: data.remarks || null,
    performedBy: currentUser.name || currentUser.id,
  })

  invalidateWalletCaches(data.walletId)
  return updated
}

// ─── Reserve hours from wallet ─────────────────────────────────────────
export const reserveWalletHours = async function reserveWalletHours(data: {
  walletId: number; hours: number; reason: string; remarks?: string;
}) {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can reserve hours')
  }
  if (data.hours <= 0) throw new Error('Hours must be a positive number')

  const [w] = await db.select().from(supportWallet).where(eq(supportWallet.id, data.walletId)).limit(1)
  if (!w) throw new Error('Wallet not found')

  const previousBalance = w.remainingHours
  const newRemaining = Math.max(0, w.remainingHours - data.hours)
  const newReserved = w.reservedHours + data.hours

  const [updated] = await db
    .update(supportWallet)
    .set({ reservedHours: newReserved, remainingHours: newRemaining, updatedAt: new Date() })
    .where(eq(supportWallet.id, data.walletId))
    .returning()

  await db.insert(walletTransaction).values({
    walletId: data.walletId,
    transactionType: 'Deduct Hours',
    hours: data.hours, previousBalance, newBalance: newRemaining,
    reason: data.reason,
    remarks: `[Reserved] ${data.remarks || ''}`.trim(),
    performedBy: currentUser.name || currentUser.id,
  })

  invalidateWalletCaches(data.walletId)
  return updated
}

// ─── Release reserved hours ────────────────────────────────────────────
export const releaseReservedHours = async function releaseReservedHours(data: {
  walletId: number; hours: number; reason: string; remarks?: string;
}) {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can release reserved hours')
  }
  if (data.hours <= 0) throw new Error('Hours must be a positive number')

  const [w] = await db.select().from(supportWallet).where(eq(supportWallet.id, data.walletId)).limit(1)
  if (!w) throw new Error('Wallet not found')

  const newReserved = Math.max(0, w.reservedHours - data.hours)
  const newRemaining = w.remainingHours + data.hours
  const previousBalance = w.remainingHours

  const [updated] = await db
    .update(supportWallet)
    .set({ reservedHours: newReserved, remainingHours: newRemaining, updatedAt: new Date() })
    .where(eq(supportWallet.id, data.walletId))
    .returning()

  await db.insert(walletTransaction).values({
    walletId: data.walletId,
    transactionType: 'Adjustment',
    hours: -data.hours, previousBalance, newBalance: newRemaining,
    reason: data.reason,
    remarks: `[Released] ${data.remarks || ''}`.trim(),
    performedBy: currentUser.name || currentUser.id,
  })

  invalidateWalletCaches(data.walletId)
  return updated
}

// ─── Adjust wallet hours (manual correction) ──────────────────────────
export const adjustWalletHours = async function adjustWalletHours(data: {
  walletId: number; totalPurchasedHours?: number; reservedHours?: number;
  consumedHours?: number; reason: string; remarks?: string;
}) {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'admin') throw new Error('Only admins can adjust wallet hours')

  const [w] = await db.select().from(supportWallet).where(eq(supportWallet.id, data.walletId)).limit(1)
  if (!w) throw new Error('Wallet not found')

  const newTotalPurchased = data.totalPurchasedHours ?? w.totalPurchasedHours
  const newReserved = data.reservedHours ?? w.reservedHours
  const newConsumed = data.consumedHours ?? w.consumedHours
  const newRemaining = newTotalPurchased - newConsumed - newReserved

  const [updated] = await db
    .update(supportWallet)
    .set({
      totalPurchasedHours: newTotalPurchased,
      reservedHours: newReserved,
      consumedHours: newConsumed,
      remainingHours: Math.max(0, newRemaining),
      updatedAt: new Date(),
    })
    .where(eq(supportWallet.id, data.walletId))
    .returning()

  await db.insert(walletTransaction).values({
    walletId: data.walletId,
    transactionType: 'Adjustment',
    hours: newRemaining - w.remainingHours,
    previousBalance: w.remainingHours,
    newBalance: Math.max(0, newRemaining),
    reason: data.reason,
    remarks: `Adjusted: purchased ${w.totalPurchasedHours}→${newTotalPurchased}, reserved ${w.reservedHours}→${newReserved}, consumed ${w.consumedHours}→${newConsumed}. ${data.remarks || ''}`.trim(),
    performedBy: currentUser.name || currentUser.id,
  })

  invalidateWalletCaches(data.walletId)
  return updated
}

// ─── Auto-create wallet for client ─────────────────────────────────────
export const autoCreateWalletForClient = async function autoCreateWalletForClient(clientId: string) {
  const [existing] = await db
    .select()
    .from(supportWallet)
    .where(eq(supportWallet.clientId, clientId))
    .limit(1)

  if (existing) return existing

  const [newWallet] = await db
    .insert(supportWallet)
    .values({
      clientId, projectId: null,
      totalPurchasedHours: 0, reservedHours: 0, consumedHours: 0, remainingHours: 0,
      status: 'inactive',
    })
    .returning()

  console.log(`[SupportHub] Auto-created client wallet #${newWallet.id} for client ${clientId}`)
  return newWallet
}

// ─── Auto-create wallet for project (redirects to client-level wallet) ──
export const autoCreateWalletForProject = async function autoCreateWalletForProject(projectId: number, clientId: string) {
  // One wallet per client — just ensure the client has a wallet
  return autoCreateWalletForClient(clientId)
}
