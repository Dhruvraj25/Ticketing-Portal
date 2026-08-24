// @ts-nocheck
'use server'

import { db } from '@/lib/db'
import { supportWallet, walletTransaction, project, user, ticket } from '@/lib/db/schema'
import { and, eq, desc, inArray, isNotNull, gte, lte } from 'drizzle-orm'
import type { ReportFilters, ReportResult } from './types'
import { getDateRange } from './types'
import type { CurrentUser } from './queries'

// ─── Report: Support Wallet ─────────────────────────────────────────────
export async function getSupportWalletReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const conditions: any[] = []
  if (currentUser.role === 'client') conditions.push(eq(supportWallet.clientId, currentUser.id))
  if (currentUser.role === 'project_manager') {
    const managedProjects = db.select({ id: project.id }).from(project).where(eq(project.managerId, currentUser.id))
    conditions.push(inArray(supportWallet.projectId, managedProjects))
  }
  if (filters.clientId) conditions.push(eq(supportWallet.clientId, filters.clientId))
  if (filters.projectId) conditions.push(eq(supportWallet.projectId, filters.projectId))

  const wallets = await db
    .select({
      id: supportWallet.id, clientId: supportWallet.clientId,
      projectId: supportWallet.projectId,
      totalPurchasedHours: supportWallet.totalPurchasedHours,
      reservedHours: supportWallet.reservedHours,
      consumedHours: supportWallet.consumedHours,
      remainingHours: supportWallet.remainingHours,
      updatedAt: supportWallet.updatedAt,
    })
    .from(supportWallet)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supportWallet.updatedAt))

  const userIds = [...new Set(wallets.map(w => w.clientId))]
  const users = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds))
  const userMap = new Map(users.map(u => [u.id, u.name]))

  const projectIds = [...new Set(wallets.map(w => w.projectId).filter((id): id is number => id !== null))]
  const projectsData = await db.select({ id: project.id, projectName: project.projectName }).from(project).where(inArray(project.id, projectIds))
  const projectMap = new Map(projectsData.map(p => [p.id, p.projectName]))

  return {
    meta: {
      totalRecords: wallets.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: {
        'Total Wallets': wallets.length,
        'Total Purchased Hours': wallets.reduce((s, w) => s + w.totalPurchasedHours, 0),
        'Total Consumed Hours': wallets.reduce((s, w) => s + w.consumedHours, 0),
        'Total Remaining Hours': wallets.reduce((s, w) => s + w.remainingHours, 0),
      },
    },
    columns: [
      { key: 'clientName', label: 'Client', type: 'text' },
      { key: 'projectName', label: 'Project', type: 'text' },
      { key: 'totalPurchasedHours', label: 'Purchased', type: 'number' },
      { key: 'reservedHours', label: 'Reserved', type: 'number' },
      { key: 'consumedHours', label: 'Consumed', type: 'number' },
      { key: 'remainingHours', label: 'Remaining', type: 'number' },
    ],
    data: wallets.map(w => ({
      clientName: userMap.get(w.clientId) || 'Unknown',
      projectName: projectMap.get(w.projectId!) || 'Unknown',
      totalPurchasedHours: w.totalPurchasedHours,
      reservedHours: w.reservedHours,
      consumedHours: w.consumedHours,
      remainingHours: w.remainingHours,
    })),
    charts: [{ type: 'bar' as const, title: 'Hours per Wallet', data: wallets.map(w => ({ name: projectMap.get(w.projectId!) || `Wallet #${w.id}`, value: w.totalPurchasedHours })) }],
  }
}

// ─── Report: Wallet Transaction ─────────────────────────────────────
export async function getWalletTransactionReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  let walletIds: number[] = []
  const walletConditions: any[] = []
  if (currentUser.role === 'client') walletConditions.push(eq(supportWallet.clientId, currentUser.id))
  if (currentUser.role === 'project_manager') {
    const managedProjects = db.select({ id: project.id }).from(project).where(eq(project.managerId, currentUser.id))
    walletConditions.push(inArray(supportWallet.projectId, managedProjects))
  }
  if (filters.clientId) walletConditions.push(eq(supportWallet.clientId, filters.clientId))
  if (filters.projectId) walletConditions.push(eq(supportWallet.projectId, filters.projectId))

  const wallets = await db.select({ id: supportWallet.id }).from(supportWallet).where(walletConditions.length > 0 ? and(...walletConditions) : undefined)
  walletIds = wallets.map(w => w.id)

  if (walletIds.length === 0) {
    return { meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: [], summary: {} }, columns: defaultTxColumns(), data: [] }
  }

  const txConditions: any[] = [inArray(walletTransaction.walletId, walletIds), gte(walletTransaction.performedAt, since), lte(walletTransaction.performedAt, until)]
  const rows = await db.select().from(walletTransaction).where(and(...txConditions)).orderBy(desc(walletTransaction.performedAt)).limit(200)

  if (rows.length === 0) {
    return { meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: [], summary: {} }, columns: defaultTxColumns(), data: [] }
  }

  // ── OPTIMIZATION: Deduplicate wallet IDs + batch enrichment in parallel
  // Uses a Set to deduplicate wallet IDs, then fetches wallet details + users
  // + projects in 3 parallel queries.
  const uniqueTxWalletIds = [...new Set(rows.map(r => r.walletId))]

  const [fullWallets, users, projectsData] = await Promise.all([
    db.select({ id: supportWallet.id, clientId: supportWallet.clientId, projectId: supportWallet.projectId })
      .from(supportWallet)
      .where(inArray(supportWallet.id, uniqueTxWalletIds)),
    db.select({ id: user.id, name: user.name }).from(user),
    db.select({ id: project.id, projectName: project.projectName }).from(project),
  ])
  const userMap = new Map(users.map(u => [u.id, u.name]))
  const projectMap = new Map(projectsData.map(p => [p.id, p.projectName]))
  const walletDetails = new Map(fullWallets.map(w => [w.id, { clientId: w.clientId, projectId: w.projectId }]))

  return {
    meta: { totalRecords: rows.length, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { 'Total Transactions': rows.length } },
    columns: defaultTxColumns(),
    data: rows.map(r => {
      const details = walletDetails.get(r.walletId)
      return {
        date: r.performedAt.toISOString(),
        client: details ? userMap.get(details.clientId) || 'Unknown' : 'Unknown',
        project: details ? projectMap.get(details.projectId!) || 'Unknown' : 'Unknown',
        transactionType: r.transactionType,
        hours: r.hours,
        previousBalance: r.previousBalance,
        newBalance: r.newBalance,
        performedBy: r.performedBy,
      }
    }),
  }
}

function defaultTxColumns() {
  return [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'client', label: 'Client', type: 'text' },
    { key: 'project', label: 'Project', type: 'text' },
    { key: 'transactionType', label: 'Type', type: 'badge' },
    { key: 'hours', label: 'Hours', type: 'number' },
    { key: 'previousBalance', label: 'Previous Balance', type: 'number' },
    { key: 'newBalance', label: 'New Balance', type: 'number' },
    { key: 'performedBy', label: 'Performed By', type: 'text' },
  ]
}

// ─── Report: Wallet Consumption ────────────────────────────────────
export async function getWalletConsumptionReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions: any[] = [gte(ticket.createdAt, since), lte(ticket.createdAt, until)]
  if (currentUser.role === 'client') conditions.push(eq(ticket.clientId, currentUser.id))
  if (currentUser.role === 'project_manager') {
    const managedProjects = db.select({ id: project.id }).from(project).where(eq(project.managerId, currentUser.id))
    conditions.push(inArray(ticket.projectId, managedProjects))
  }
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))

  const rows = await db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      status: ticket.status, createdAt: ticket.createdAt,
      closedAt: ticket.closedAt, estimatedHours: ticket.estimatedHours,
      consumedHours: ticket.consumedHours,
      estimatedCompletionDate: ticket.estimatedCompletionDate,
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(desc(ticket.createdAt))
    .limit(200)
  const withConsumption = rows.filter(r => (r.estimatedHours && r.estimatedHours > 0) || (r.consumedHours && r.consumedHours > 0))

  return {
    meta: { totalRecords: withConsumption.length, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { 'Total Tickets': withConsumption.length, 'Total Est. Hours': withConsumption.reduce((s, r) => s + (r.estimatedHours || 0), 0), 'Total Consumed Hours': withConsumption.reduce((s, r) => s + (r.consumedHours || 0), 0) } },
    columns: [
      { key: 'ticketNumber', label: 'Ticket Number', type: 'text' },
      { key: 'title', label: 'Ticket Title', type: 'text' },
      { key: 'estimatedHours', label: 'Estimated Hours', type: 'number' },
      { key: 'actualHours', label: 'Actual Hours', type: 'number' },
      { key: 'completionStatus', label: 'Timing', type: 'badge' },
    ],
    data: withConsumption.map(r => ({
      ticketNumber: r.ticketNumber,
      title: r.title,
      estimatedHours: r.estimatedHours || 0,
      actualHours: r.consumedHours || 0,
      completionStatus: r.status === TicketStatus.CLOSED && r.closedAt && r.estimatedCompletionDate
        ? new Date(r.closedAt) <= new Date(r.estimatedCompletionDate) ? 'ON TIME' : 'LATE' : '',
    })),
  }
}

// ─── Report: Wallet History ──────────────────────────────────
export async function getWalletHistoryReport(filters: ReportFilters, currentUser: CurrentUser): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  let walletIds: number[] = []
  const walletConditions: any[] = []
  if (currentUser.role === 'client') walletConditions.push(eq(supportWallet.clientId, currentUser.id))
  if (currentUser.role === 'project_manager') {
    const managedProjects = db.select({ id: project.id }).from(project).where(eq(project.managerId, currentUser.id))
    walletConditions.push(inArray(supportWallet.projectId, managedProjects))
  }
  if (filters.clientId) walletConditions.push(eq(supportWallet.clientId, filters.clientId))
  if (filters.projectId) walletConditions.push(eq(supportWallet.projectId, filters.projectId))

  const wallets = await db.select({ id: supportWallet.id, clientId: supportWallet.clientId, projectId: supportWallet.projectId })
    .from(supportWallet).where(walletConditions.length > 0 ? and(...walletConditions) : undefined)
  walletIds = wallets.map(w => w.id)

  if (walletIds.length === 0) {
    return { meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: [], summary: {} }, columns: defaultHistoryColumns(), data: [] }
  }

  const rows = await db.select().from(walletTransaction)
    .where(and(inArray(walletTransaction.walletId, walletIds), gte(walletTransaction.performedAt, since), lte(walletTransaction.performedAt, until)))
    .orderBy(desc(walletTransaction.performedAt)).limit(500)

  if (rows.length === 0) {
    return { meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: [], summary: {} }, columns: defaultHistoryColumns(), data: [] }
  }

  // ── OPTIMIZATION: Merge 3 sequential enrichment queries into 1 parallel ──
  const [fullWallets, users] = await Promise.all([
    db.select({ id: supportWallet.id, clientId: supportWallet.clientId, projectId: supportWallet.projectId })
      .from(supportWallet)
      .where(inArray(supportWallet.id, [...new Set(rows.map(r => r.walletId))])),
    db.select({ id: user.id, name: user.name }).from(user),
  ])
  const userMap = new Map(users.map(u => [u.id, u.name]))
  const walletDetails = new Map(fullWallets.map(w => [w.id, { clientId: w.clientId, projectId: w.projectId }]))

  let totalAdded = 0, totalUsed = 0
  const dataRows = rows.map(r => {
    const isAdd = r.transactionType === 'Add Hours' || r.transactionType === 'Emergency Credit'
    const isDeduct = r.transactionType === 'Deduct Hours'
    if (isAdd) totalAdded += r.hours
    if (isDeduct) totalUsed += r.hours
    const details = walletDetails.get(r.walletId)
    return {
      date: r.performedAt.toISOString(),
      client: details ? userMap.get(details.clientId) || 'Unknown' : 'Unknown',
      openingBalance: r.previousBalance,
      hoursAdded: isAdd ? r.hours : 0,
      hoursUsed: isDeduct ? r.hours : 0,
      currentBalance: r.newBalance,
      addedBy: isAdd ? r.performedBy : '',
      deductedBy: isDeduct ? r.performedBy : '',
      ticketNumber: '',
    }
  })

  return {
    meta: { totalRecords: rows.length, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { 'Total Transactions': rows.length, 'Total Hours Added': totalAdded, 'Total Hours Used': totalUsed } },
    columns: defaultHistoryColumns(),
    data: dataRows,
    charts: [
      { type: 'bar' as const, title: 'Hours Added vs Used', data: [{ name: 'Hours Added', value: totalAdded }, { name: 'Hours Used', value: totalUsed }] },
      { type: 'line' as const, title: 'Balance Trend', data: rows.slice().reverse().map(r => ({ name: r.performedAt.toISOString().split('T')[0], value: r.newBalance })) },
    ],
  }
}

function defaultHistoryColumns() {
  return [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'client', label: 'Client', type: 'text' },
    { key: 'openingBalance', label: 'Opening Balance', type: 'number' },
    { key: 'hoursAdded', label: 'Hours Added', type: 'number' },
    { key: 'hoursUsed', label: 'Hours Used', type: 'number' },
    { key: 'currentBalance', label: 'Current Balance', type: 'number' },
    { key: 'addedBy', label: 'Added By', type: 'text' },
    { key: 'deductedBy', label: 'Deducted By', type: 'text' },
  ]
}
