// @ts-nocheck
'use server'

import { db } from '@/lib/db'
import { supportWallet, walletAlert, notification as notificationSchema, user, project } from '@/lib/db/schema'
import { and, or, eq, desc, inArray, isNull, gte } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-utils'
import type { WalletAlertType } from '@/lib/types'
import { WALLET_CACHE_TAGS } from './constants'

// ─── Generate alerts based on balance ──────────────────────────────────
export async function generateAlertsForWallet(walletId: number, remainingHours: number) {
  const [w] = await db
    .select()
    .from(supportWallet)
    .where(eq(supportWallet.id, walletId))
    .limit(1)

  if (!w) return

  const { projectId: wProjectId, clientId: wClientId } = w

  const existingAlerts = await db
    .select()
    .from(walletAlert)
    .where(and(eq(walletAlert.walletId, walletId), isNull(walletAlert.resolvedAt)))

  const hasWarning = existingAlerts.some(a => a.alertType === 'low_balance_warning')
  const hasRestricted = existingAlerts.some(a => a.alertType === 'low_balance_restricted')
  const notifications: { userId: string; title: string; message: string; link?: string }[] = []

  // Warning level (≤ 20)
  if (remainingHours <= 20 && remainingHours > 10 && !hasWarning) {
    await db.insert(walletAlert).values({
      walletId,
      alertType: 'low_balance_warning',
      message: `Support hour balance is low (${remainingHours} hours remaining). Please consider recharging.`,
    })
    if (wProjectId) {
      const [p] = await db
        .select({ managerId: project.managerId })
        .from(project)
        .where(eq(project.id, wProjectId))
        .limit(1)
      notifications.push({
        userId: wClientId,
        title: 'Support Hours Low',
        message: `Your support hour balance is low (${remainingHours} hours remaining). Please contact your account manager.`,
        link: `/dashboard/wallets/${walletId}`,
      })
      if (p?.managerId) {
        notifications.push({
          userId: p.managerId,
          title: 'Client Support Hours Low',
          message: `Client wallet (ID: ${walletId}) has only ${remainingHours} hours remaining.`,
          link: `/dashboard/wallets/${walletId}`,
        })
      }
    }
  }

  // Restriction level (≤ 10)
  if (remainingHours <= 10 && !hasRestricted) {
    await db.insert(walletAlert).values({
      walletId,
      alertType: 'low_balance_restricted',
      message: `Support hour balance is critically low (${remainingHours} hours remaining). Ticket creation is restricted.`,
    })
    if (wProjectId) {
      const [p] = await db
        .select({ managerId: project.managerId })
        .from(project)
        .where(eq(project.id, wProjectId))
        .limit(1)
      notifications.push({
        userId: wClientId,
        title: 'Support Hours Critically Low',
        message: `Your support hour balance is critically low (${remainingHours} hours). Ticket creation has been restricted. Please contact your account manager.`,
        link: `/dashboard/wallets/${walletId}`,
      })
      if (p?.managerId) {
        notifications.push({
          userId: p.managerId,
          title: 'Critical: Client Support Hours Exhausted',
          message: `Client wallet (ID: ${walletId}) has only ${remainingHours} hours remaining. Ticket creation is restricted.`,
          link: `/dashboard/wallets/${walletId}`,
        })
      }
    }
  }

  // Admin notifications for warning level
  if (remainingHours <= 20 && remainingHours > 10 && !hasWarning) {
    const admins = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, 'admin'))
    for (const admin of admins) {
      notifications.push({
        userId: admin.id,
        title: 'Support Hours Low Alert',
        message: `Wallet #${walletId} has only ${remainingHours} hours remaining.`,
        link: `/dashboard/wallets/${walletId}`,
      })
    }
  }

  if (notifications.length > 0) {
    await db.insert(notificationSchema).values(
      notifications.map(n => ({
        userId: n.userId,
        title: n.title,
        message: n.message,
        link: n.link ?? null,
        ticketId: null,
        isRead: false,
      }))
    )
  }
}

// ─── Get wallet alerts ──────────────────────────────────────────────────
export const getWalletAlerts = async function getWalletAlerts(walletId: number) {
  const currentUser = await getCurrentUser()

  const [w] = await db
    .select()
    .from(supportWallet)
    .where(eq(supportWallet.id, walletId))
    .limit(1)

  if (!w) throw new Error('Wallet not found')
  if (currentUser.role === 'client' && w.clientId !== currentUser.id) {
    throw new Error('Access denied')
  }

  const alerts = await db
    .select()
    .from(walletAlert)
    .where(eq(walletAlert.walletId, walletId))
    .orderBy(desc(walletAlert.createdAt))

  return alerts.map(a => ({
    ...a,
    alertType: a.alertType as WalletAlertType,
  }))
}

// ─── Resolve wallet alert ───────────────────────────────────────────────
export const resolveWalletAlert = async function resolveWalletAlert(alertId: number) {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'admin' && currentUser.role !== 'project_manager') {
    throw new Error('Only admins and managers can resolve alerts')
  }

  const [alert] = await db
    .update(walletAlert)
    .set({ resolvedAt: new Date() })
    .where(eq(walletAlert.id, alertId))
    .returning()

  if (alert) {
    revalidateTag('wallet-alerts')
    revalidateTag(WALLET_CACHE_TAGS.WALLET_DETAIL(alert.walletId))
  }
}

// ─── Get active wallet alerts ──────────────────────────────────────────
export const getActiveWalletAlerts = async function getActiveWalletAlerts() {
  const currentUser = await getCurrentUser()
  const conditions = [isNull(walletAlert.resolvedAt)]
  let walletIdFilter: number[] | null = null

  if (currentUser.role === 'client') {
    const clientWallets = await db
      .select({ id: supportWallet.id })
      .from(supportWallet)
      .where(eq(supportWallet.clientId, currentUser.id))
    walletIdFilter = clientWallets.map(w => w.id)
  } else if (currentUser.role === 'project_manager') {
    const projectRows = await db
      .select({ id: project.id, clientId: project.clientId })
      .from(project)
      .where(eq(project.managerId, currentUser.id))
    const managedIds = projectRows.map(p => p.id)
    const managedClientIds = [...new Set(projectRows.map(p => p.clientId))]
    if (managedIds.length > 0) {
      const walletRows = await db
        .select({ id: supportWallet.id })
        .from(supportWallet)
        .where(or(
          inArray(supportWallet.projectId, managedIds),
          and(isNull(supportWallet.projectId), inArray(supportWallet.clientId, managedClientIds))
        ))
      walletIdFilter = walletRows.map(w => w.id)
    } else {
      return []
    }
  }

  if (walletIdFilter !== null) {
    if (walletIdFilter.length > 0) {
      conditions.push(inArray(walletAlert.walletId, walletIdFilter))
    } else {
      return []
    }
  }

  const alerts = await db
    .select()
    .from(walletAlert)
    .where(and(...conditions))
    .orderBy(desc(walletAlert.createdAt))
    .limit(20)

  if (alerts.length === 0) return []

  const alertWalletIds = [...new Set(alerts.map(a => a.walletId))]
  const walletRows = await db
    .select()
    .from(supportWallet)
    .where(inArray(supportWallet.id, alertWalletIds))

  const userIds = [...new Set(walletRows.map(w => w.clientId))]
  const projectIds = [...new Set(walletRows.map(w => w.projectId).filter((id): id is number => id !== null))]

  const [users, projects] = await Promise.all([
    userIds.length > 0
      ? db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds))
      : Promise.resolve([]),
    projectIds.length > 0
      ? db.select({ id: project.id, projectName: project.projectName }).from(project).where(inArray(project.id, projectIds))
      : Promise.resolve([]),
  ])

  const userMap = new Map(users.map(u => [u.id, u]))
  const projectMap = new Map(projects.map(p => [p.id, p.projectName]))
  const walletMap = new Map(walletRows.map(w => [w.id, { clientId: w.clientId, projectId: w.projectId }]))

  return alerts.map(a => {
    const w = walletMap.get(a.walletId)
    return {
      ...a,
      alertType: a.alertType as WalletAlertType,
      clientName: w ? userMap.get(w.clientId)?.name ?? undefined : undefined,
      projectName: w ? projectMap.get(w.projectId!) ?? undefined : undefined,
    }
  })
}
