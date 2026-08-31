// @ts-nocheck
'use server'

import { db } from '@/lib/db'
import { supportWallet, walletTransaction, ticket, user, project } from '@/lib/db/schema'
import { and, eq, desc, inArray, gte, lte, sql, isNull, count as drizzleCount } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-utils'
import type { WalletTransactionType } from '@/lib/types'

const TRANSACTIONS_PER_PAGE = 20

// ─── Internal implementation (no getCurrentUser — accepts currentUser object) ─

export async function _getWalletTransactionsImpl(
  currentUser: { id: string; role: string },
  walletId: number,
  page: number = 1,
  limit: number = TRANSACTIONS_PER_PAGE,
  filters?: { type?: string; dateFrom?: string; dateTo?: string; search?: string; sortOrder?: 'asc' | 'desc' }
) {
  const [w] = await db
    .select()
    .from(supportWallet)
    .where(eq(supportWallet.id, walletId))
    .limit(1)

  if (!w) throw new Error('Wallet not found')
  if (currentUser.role === 'client' && w.clientId !== currentUser.id) {
    throw new Error('Access denied')
  }

  const conditions = [eq(walletTransaction.walletId, walletId)]

  if (filters?.type) {
    conditions.push(eq(walletTransaction.transactionType, filters.type))
  }
  if (filters?.dateFrom) {
    conditions.push(gte(walletTransaction.performedAt, new Date(filters.dateFrom)))
  }
  if (filters?.dateTo) {
    const endDate = new Date(filters.dateTo)
    endDate.setHours(23, 59, 59, 999)
    conditions.push(lte(walletTransaction.performedAt, endDate))
  }
  if (filters?.search) {
    conditions.push(
      sql`(${walletTransaction.reason} ILIKE ${'%' + filters.search + '%'} OR ${walletTransaction.remarks} ILIKE ${'%' + filters.search + '%'} OR ${walletTransaction.performedBy} ILIKE ${'%' + filters.search + '%'})`
    )
  }

  const offset = (page - 1) * limit
  const sortDir = filters?.sortOrder === 'asc' ? walletTransaction.performedAt : desc(walletTransaction.performedAt)

  const [transactions, totalResult] = await Promise.all([
    db
      .select()
      .from(walletTransaction)
      .where(and(...conditions))
      .orderBy(sortDir)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: drizzleCount() })
      .from(walletTransaction)
      .where(and(...conditions)),
  ])

  const total = Number(totalResult[0]?.count) || 0

  return {
    transactions: transactions.map(t => ({
      ...t,
      transactionType: t.transactionType as WalletTransactionType,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export async function _getWalletTicketConsumptionImpl(currentUser: { id: string; role: string }, walletId: number) {
  const [w] = await db
    .select()
    .from(supportWallet)
    .where(eq(supportWallet.id, walletId))
    .limit(1)

  if (!w) throw new Error('Wallet not found')
  if (currentUser.role === 'client' && w.clientId !== currentUser.id) {
    throw new Error('Access denied')
  }

  // One wallet per client — fetch all tickets for this client
  const tickets = await db
    .select({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      estimatedHours: ticket.estimatedHours,
      reservedHours: ticket.reservedHours,
      consumedHours: ticket.consumedHours,
      status: ticket.status,
      resolvedAt: ticket.resolvedAt,
      completedAt: ticket.closedAt,
      createdAt: ticket.createdAt,
    })
    .from(ticket)
    .where(eq(ticket.clientId, w.clientId))
    .orderBy(desc(ticket.createdAt))

  return tickets.map(t => ({
    ...t,
    estimatedHours: t.estimatedHours ?? 0,
    reservedHours: t.reservedHours ?? 0,
    consumedHours: t.consumedHours ?? 0,
    completedAt: t.completedAt ?? t.resolvedAt,
  }))
}

// ─── Cross-request cached wrappers (primitives only, no headers()) ────────

const getCachedWalletTransactions = unstable_cache(
  async (userId: string, role: string, walletId: number, page: number, limit: number, filtersJson?: string) => {
    const filters = filtersJson ? JSON.parse(filtersJson) : undefined
    return _getWalletTransactionsImpl({ id: userId, role }, walletId, page, limit, filters)
  },
  undefined,
  {
    tags: ['wallet-transactions'],
    revalidate: 30,
  }
)

const getCachedWalletTicketConsumption = unstable_cache(
  async (userId: string, role: string, walletId: number) => {
    return _getWalletTicketConsumptionImpl({ id: userId, role }, walletId)
  },
  undefined,
  {
    tags: ['wallet-consumption'],
    revalidate: 60,
  }
)

// ─── Server Actions (getCurrentUser called OUTSIDE cached wrappers) ───────

export const getWalletTransactions = async function getWalletTransactions(
  walletId: number,
  page: number = 1,
  limit: number = TRANSACTIONS_PER_PAGE,
  filters?: { type?: string; dateFrom?: string; dateTo?: string; search?: string; sortOrder?: 'asc' | 'desc' }
) {
  const { id: userId, role } = await getCurrentUser()
  const filtersJson = filters ? JSON.stringify(filters) : undefined
  return getCachedWalletTransactions(userId, role, walletId, page, limit, filtersJson)
}

export const getWalletTicketConsumption = async function getWalletTicketConsumption(walletId: number) {
  const { id: userId, role } = await getCurrentUser()
  return getCachedWalletTicketConsumption(userId, role, walletId)
}

// ─── Get wallet recharges this month (no getCurrentUser needed) ─────────
export const getWalletRechargesThisMonth = unstable_cache(
  async function getWalletRechargesThisMonth() {
    const firstOfMonth = new Date()
    firstOfMonth.setDate(1)
    firstOfMonth.setHours(0, 0, 0, 0)

    const rows = await db
      .select({
        id: walletTransaction.id,
        walletId: walletTransaction.walletId,
        hours: walletTransaction.hours,
        performedAt: walletTransaction.performedAt,
        reason: walletTransaction.reason,
      })
      .from(walletTransaction)
      .where(and(
        gte(walletTransaction.performedAt, firstOfMonth),
        eq(walletTransaction.transactionType, 'Add Hours'),
      ))
      .orderBy(desc(walletTransaction.performedAt))
      .limit(10)

    return rows
  },
  [],
  {
    tags: ['wallet-recharges'],
    revalidate: 120,
  }
)
