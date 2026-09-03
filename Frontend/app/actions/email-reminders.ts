'use server'

import { db } from '@/lib/db'
import { getPortalUrl } from '@/lib/urls'
import { supportWallet, notificationLog, user, project, ticket } from '@/lib/db/schema'
import { and, eq, lte, gte, isNotNull, or, count, inArray } from 'drizzle-orm'
import { dispatchNotification } from '@/lib/notify-all'
import { wrapServerAction } from '@/lib/performance-profiler'

// ─── Support Renewal Reminder Scheduler ───────────────────────────────────
// Call this via a cron job (e.g., Vercel Cron, GitHub Actions, etc.)
// It detects wallets that need renewal reminders and sends them.
// Maximum 3 reminder emails per week per client (enforced by email_log check).

export const processRenewalReminders = wrapServerAction('processRenewalReminders', async function processRenewalReminders() {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  // Find wallets that need reminders:
  // 1. Remaining hours <= 10 (low hours)
  // 2. Contract expires within 30 days (expiring soon)
  // 3. Contract already expired (expired)
  const expiringWallets = await db
    .select()
    .from(supportWallet)
    .where(
      and(
        eq(supportWallet.status, 'active'),
        or(
          lte(supportWallet.remainingHours, 10),
          and(
            isNotNull(supportWallet.contractEndDate),
            lte(supportWallet.contractEndDate, thirtyDaysFromNow.toISOString().split('T')[0]),
          ),
        ),
      ),
    )

  let remindersSent = 0

  for (const wallet of expiringWallets) {
    const lowHours = wallet.remainingHours <= 10
    const contractEnd = wallet.contractEndDate ? new Date(wallet.contractEndDate + 'T00:00:00') : null
    const daysToExpiry = contractEnd
      ? Math.ceil((contractEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      : null
    const isExpiring = daysToExpiry !== null && daysToExpiry > 0 && daysToExpiry <= 30
    const isExpired = daysToExpiry !== null && daysToExpiry <= 0

    if (!lowHours && !isExpiring && !isExpired) continue

    // ── Enforce max 3 reminder emails per week per client ──────────────
    // Get the user's email to check how many reminders were already sent this week
    const [userRow] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, wallet.clientId))
      .limit(1)

    const userEmail = userRow?.email
    if (!userEmail) continue

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    // Weekly cap enforced against notification_log — the dispatch ledger written
    // by the unified dispatcher (the legacy email_log queue is deprecated).
    const [reminderCountResult] = await db
      .select({ sentCount: count().mapWith(Number) })
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.eventType, 'support_renewal_reminder'),
          eq(notificationLog.recipientUserId, wallet.clientId),
          gte(notificationLog.createdAt, sevenDaysAgo),
        ),
      )

    const weeklyEmailCount = Number(reminderCountResult?.sentCount) || 0
    if (weeklyEmailCount >= 3) {
      // Already sent max reminders this week — skip
      continue
    }

    // ── Client: In-App + Email + Teams via the unified dispatcher ──────────
    // Scheduled reminders legitimately repeat, so dispatcher-level dedup is
    // disabled here — duplicate protection is the weekly cap enforced above
    // (max 3 reminders per week per client, tracked in notification_log).
    const walletLink = (getPortalUrl()) + '/dashboard/wallets/' + wallet.id
    await dispatchNotification({
      eventType: 'support_renewal_reminder',
      triggeredBy: 'system',
      dedup: false,
      recipients: [
        {
          userId: wallet.clientId,
          inApp: {
            title: isExpired ? 'Support Contract Expired' : 'Support Renewal Reminder',
            message: isExpired
              ? 'Your support contract has expired. Please renew your support package.'
              : lowHours && isExpiring
                ? 'Your support hours are running low and your contract is expiring soon (' + daysToExpiry + ' days).'
                : lowHours
                  ? 'Only ' + wallet.remainingHours + ' support hours remaining.'
                  : 'Your support package expires in ' + daysToExpiry + ' days.',
            link: '/dashboard/wallets/' + wallet.id,
          },
          email: {
            templateData: {
              remainingHours: wallet.remainingHours,
              expiryDate: wallet.contractEndDate || undefined,
              daysToExpiry: daysToExpiry ?? undefined,
              isLowHours: lowHours,
              isExpiring,
              isExpired,
              walletLink,
            },
          },
          teams: {
            payload: {
              remainingHours: wallet.remainingHours,
              expiryDate: wallet.contractEndDate || undefined,
              isLowHours: lowHours, isExpiring, isExpired,
            },
          },
        },
      ],
    })

    // Also notify project managers about renewal (Teams)
    // Find projects this client has tickets on
    const clientProjects = await db
      .select({ projectId: ticket.projectId })
      .from(ticket)
      .where(eq(ticket.clientId, wallet.clientId))
      .groupBy(ticket.projectId)
    const projectIds = clientProjects.map(p => p.projectId).filter((id): id is number => id !== null)
    if (projectIds.length > 0) {
      const managerRows = await db
        .select({ managerId: project.managerId })
        .from(project)
        .where(inArray(project.id, projectIds))
      for (const projectRow of managerRows) {
        if (projectRow?.managerId) {
          await dispatchNotification({
            eventType: 'support_renewal_reminder',
            triggeredBy: 'system',
            dedup: false,
            recipients: [
              {
                userId: projectRow.managerId,
                channels: ['teams'],
                teams: {
                  payload: {
                    remainingHours: wallet.remainingHours,
                    expiryDate: wallet.contractEndDate || undefined,
                    clientId: wallet.clientId,
                  },
                },
              },
            ],
          })
        }
      }
    }

    // Also notify all admins (In-App)
    const admins = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, 'admin'))
    if (admins.length > 0) {
      await dispatchNotification({
        eventType: 'support_renewal_reminder',
        triggeredBy: 'system',
        dedup: false,
        recipients: admins.map((admin) => ({
          userId: admin.id,
          channels: ['inApp'] as const,
          inApp: {
            title: isExpired ? 'Support Contract Expired' : 'Support Renewal Reminder',
            message: isExpired
              ? `Support contract expired for wallet #${wallet.id}.`
              : `Support renewal reminder for wallet #${wallet.id}. ${lowHours ? wallet.remainingHours + ' hours left. ' : ''}${isExpiring ? 'Expires in ' + daysToExpiry + ' days.' : ''}`,
            link: '/dashboard/wallets/' + wallet.id,
          },
        })),
      })
    }

    remindersSent++
  }

  return { remindersSent, walletsChecked: expiringWallets.length }
})
