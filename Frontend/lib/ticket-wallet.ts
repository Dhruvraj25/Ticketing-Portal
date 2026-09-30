// ============================================================================
// Ticket ↔ Support Wallet: which wallet a ticket uses, and its reservations
// ============================================================================
// Wallet of a ticket (same rule everywhere — estimate, approval, close):
//   1. the wallet of the client who raised the ticket (ticket.clientId) —
//      the long-standing lookup;
//   2. otherwise the wallet of the ticket project's owner (project.clientId),
//      as getWalletByProject does. A Standard account usually has no wallet
//      of its own; its tickets draw on the company's (project owner's) wallet
//      instead of silently bypassing the wallet.
// ============================================================================

import { eq } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { project, supportWallet, ticket, walletTransaction } from '@/lib/db/schema'
import { hoursOf, releaseWalletReservationAtomic, reserveWalletHoursAtomic } from '@/lib/wallet-reservation'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Handle = typeof db | Tx
export type WalletRow = typeof supportWallet.$inferSelect

export async function findTicketWallet(
  handle: Handle,
  t: { clientId: string | null; projectId: number | null },
): Promise<WalletRow | null> {
  if (t.clientId) {
    const [own] = await handle.select().from(supportWallet).where(eq(supportWallet.clientId, t.clientId)).limit(1)
    if (own) return own
  }
  if (t.projectId) {
    const [p] = await handle.select({ ownerId: project.clientId }).from(project).where(eq(project.id, t.projectId)).limit(1)
    if (p?.ownerId && p.ownerId !== t.clientId) {
      const [owner] = await handle.select().from(supportWallet).where(eq(supportWallet.clientId, p.ownerId)).limit(1)
      if (owner) return owner
    }
  }
  return null
}

export class WalletReservationError extends Error {
  constructor(public requested: number, public available: number) {
    super('Insufficient available support hours to reserve')
  }
}

/**
 * Reserve `hours` more for this ticket (inside the caller's transaction).
 * Throws WalletReservationError when the wallet's AVAILABLE hours can't cover
 * it (the caller maps it to its user-facing message); returns null when the
 * ticket has no wallet (unchanged behaviour: no wallet → no wallet checks).
 */
export async function reserveHoursForTicket(
  tx: Tx,
  t: { id: number; ticketNumber: string; title: string; clientId: string | null; projectId: number | null; reservedHours: number | null },
  hours: number,
  audit: { performedBy: string; reason: string },
): Promise<{ walletId: number; previousRemaining: number; newRemaining: number } | null> {
  const h = hoursOf(hours)
  if (h === 0) return null
  const wallet = await findTicketWallet(tx, t)
  if (!wallet) return null

  const updated = await reserveWalletHoursAtomic(tx, wallet.id, h)
  if (!updated) {
    const [current] = await tx.select({ remainingHours: supportWallet.remainingHours }).from(supportWallet).where(eq(supportWallet.id, wallet.id)).limit(1)
    throw new WalletReservationError(h, current?.remainingHours ?? wallet.remainingHours)
  }

  await tx.update(ticket).set({ reservedHours: hoursOf(t.reservedHours) + h }).where(eq(ticket.id, t.id))
  // 'Adjustment' (not 'Deduct Hours'): reports count 'Deduct Hours' as
  // consumption, and these hours are only consumed when the ticket closes.
  await tx.insert(walletTransaction).values({
    walletId: wallet.id, transactionType: 'Adjustment', hours: h,
    previousBalance: updated.remainingHours + h, newBalance: updated.remainingHours,
    reason: audit.reason,
    remarks: `[Reserved] ${h}h reserved for ticket #${t.ticketNumber} - ${t.title}`,
    performedBy: audit.performedBy,
  })
  return { walletId: wallet.id, previousRemaining: updated.remainingHours + h, newRemaining: updated.remainingHours }
}

/** Return everything this ticket holds in reserve to the available balance. */
export async function releaseTicketReservation(
  tx: Tx,
  t: { id: number; ticketNumber: string; title: string; clientId: string | null; projectId: number | null; reservedHours: number | null },
  audit: { performedBy: string; reason: string },
): Promise<number | null> {
  const held = hoursOf(t.reservedHours)
  if (held === 0) return null
  const wallet = await findTicketWallet(tx, t)
  await tx.update(ticket).set({ reservedHours: 0 }).where(eq(ticket.id, t.id))
  if (!wallet) return null

  const before = wallet.remainingHours
  const updated = await releaseWalletReservationAtomic(tx, wallet.id, held)
  if (updated && updated.remainingHours !== before) {
    await tx.insert(walletTransaction).values({
      walletId: wallet.id, transactionType: 'Adjustment', hours: updated.remainingHours - before,
      previousBalance: before, newBalance: updated.remainingHours,
      reason: audit.reason,
      remarks: `[Released] ${updated.remainingHours - before}h reservation released for ticket #${t.ticketNumber} - ${t.title}`,
      performedBy: audit.performedBy,
    })
  }
  return wallet.id
}

/** Wallet KPI cards / lists / history refresh on the next render. */
export function refreshWalletViews(walletId?: number | null): void {
  for (const tag of [
    'wallet-list', 'wallet-stats', 'wallet-low-balance', 'wallet-renewal', 'wallet-detail',
    'wallet-project', 'wallet-transactions', 'wallet-consumption', 'renewal-status', 'consolidated-dashboard-stats',
  ]) revalidateTag(tag, { expire: 0 })
  if (walletId) {
    revalidateTag(`wallet-detail-${walletId}`, { expire: 0 })
    revalidateTag(`wallet-txns-${walletId}`, { expire: 0 })
  }
  revalidatePath('/dashboard/wallets', 'layout')
  revalidatePath('/dashboard/support-wallet')
}
