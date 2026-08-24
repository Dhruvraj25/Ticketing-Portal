// @ts-nocheck
'use server'

import { db } from '@/lib/db'
import { supportWallet, walletTransaction, walletAlert, notification as notificationSchema, user, project, ticket, projectClient } from '@/lib/db/schema'
import { and, or, eq, desc, count, inArray, lte, gte, sql, isNull } from 'drizzle-orm'
import { unstable_cache, revalidateTag } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-utils'
import type { WalletStatus, WalletTransactionType } from '@/lib/types'
import { WALLET_CACHE_TAGS } from './constants'

// ─── Internal helpers (no getCurrentUser — accept currentUser object) ─────
// These are called from both cached wrappers and orchestrators.
// They NEVER call headers() or getCurrentUser().

async function getVisibleWalletIds(currentUser: { id: string; role: string }): Promise<number[] | null> {
  if (currentUser.role === 'admin') return null // null = all
  if (currentUser.role === 'client') {
    const rows = await db
      .select({ id: supportWallet.id })
      .from(supportWallet)
      .where(eq(supportWallet.clientId, currentUser.id))
    return rows.map(r => r.id)
  }
  if (currentUser.role === 'project_manager') {
    const projectRows = await db
      .select({ id: project.id, clientId: project.clientId })
      .from(project)
      .where(eq(project.managerId, currentUser.id))
    const managedIds = projectRows.map(r => r.id)
    const managedClientIds = [...new Set(projectRows.map(r => r.clientId))]
    if (managedIds.length === 0 && managedClientIds.length === 0) return []
    const walletRows = await db
      .select({ id: supportWallet.id })
      .from(supportWallet)
      .where(
        or(
          inArray(supportWallet.projectId, managedIds),
          and(isNull(supportWallet.projectId), inArray(supportWallet.clientId, managedClientIds))
        )
      )
    return walletRows.map(r => r.id)
  }
  return []
}

function buildPermissionConditions(currentUser: { id: string; role: string }): any[] {
  const conditions: any[] = []
  if (currentUser.role === 'client') {
    conditions.push(eq(supportWallet.clientId, currentUser.id))
  } else if (currentUser.role === 'project_manager') {
    // Permission handled via walletId filter after fetching visible IDs
  }
  return conditions
}

function getZeroStats() {
  return {
    totalPurchased: 0, totalConsumed: 0, totalRemaining: 0, totalReserved: 0,
    lowBalanceClients: 0, activeWallets: 0, totalWallets: 0,
    rechargesThisMonth: 0, consumedThisMonth: 0,
  }
}

// ─── Internal implementation: get wallets list ───────────────────────────
async function _getWalletsImpl(
  currentUser: { id: string; role: string },
  filters?: { clientId?: string; projectId?: number; status?: string }
) {
  const conditions = buildPermissionConditions(currentUser)

  if (filters?.clientId && currentUser.role !== 'client') {
    conditions.push(eq(supportWallet.clientId, filters.clientId))
  }
  if (filters?.projectId) {
    conditions.push(eq(supportWallet.projectId, filters.projectId))
  }
  if (filters?.status) {
    conditions.push(eq(supportWallet.status, filters.status))
  }

  // For managers, use wallet ID filter
  let visibleIds: number[] | null = null
  if (currentUser.role === 'project_manager') {
    visibleIds = await getVisibleWalletIds(currentUser)
    if (visibleIds && visibleIds.length === 0) return []
    if (visibleIds) conditions.push(inArray(supportWallet.id, visibleIds))
  }

  const wallets = await db
    .select()
    .from(supportWallet)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supportWallet.updatedAt))

  if (wallets.length === 0) return []

  const userIds = [...new Set(wallets.map(w => w.clientId))]
  const projectIds = [...new Set(wallets.map(w => w.projectId).filter((id): id is number => id !== null))]

  const [users, projects] = await Promise.all([
    userIds.length > 0
      ? db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, userIds))
      : Promise.resolve([] as { id: string; name: string; email: string }[]),
    projectIds.length > 0
      ? db.select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode }).from(project).where(inArray(project.id, projectIds))
      : Promise.resolve([] as { id: number; projectName: string; projectCode: string }[]),
  ])

  const userMap = new Map(users.map(u => [u.id, u]))
  const projectMap = new Map(projects.map(p => [p.id, p]))

  return wallets.map(w => ({
    ...w,
    status: w.status as WalletStatus,
    clientName: userMap.get(w.clientId)?.name ?? undefined,
    clientEmail: userMap.get(w.clientId)?.email ?? undefined,
    projectName: projectMap.get(w.projectId!)?.projectName ?? undefined,
    projectCode: projectMap.get(w.projectId!)?.projectCode ?? undefined,
  }))
}

/** Cross-request cached wrapper — primitives only, no headers() inside */
const getCachedWallets = unstable_cache(
  async (userId: string, role: string, filtersJson?: string) => {
    const filters = filtersJson ? JSON.parse(filtersJson) : undefined
    return _getWalletsImpl({ id: userId, role }, filters)
  },
  undefined,
  {
    tags: ['wallet-list'],
    revalidate: 60,
  }
)

// ─── Internal implementation: get wallet by ID ───────────────────────────
async function _getWalletByIdImpl(currentUser: { id: string; role: string }, walletId: number) {
  const [w] = await db
    .select()
    .from(supportWallet)
    .where(eq(supportWallet.id, walletId))
    .limit(1)

  if (!w) throw new Error('Wallet not found')
  if (currentUser.role === 'client' && w.clientId !== currentUser.id) {
    throw new Error('Access denied')
  }
  if (currentUser.role === 'project_manager' && w.projectId !== null) {
    const [p] = await db
      .select({ managerId: project.managerId })
      .from(project)
      .where(eq(project.id, w.projectId))
      .limit(1)
    if (p && p.managerId !== currentUser.id) throw new Error('Access denied')
  }

  const [clientData] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, w.clientId))
    .limit(1)

  let projectData = null
  if (w.projectId !== null) {
    const [pd] = await db
      .select({ projectName: project.projectName, projectCode: project.projectCode })
      .from(project)
      .where(eq(project.id, w.projectId))
      .limit(1)
    projectData = pd
  }

  const alerts = await db
    .select()
    .from(walletAlert)
    .where(eq(walletAlert.walletId, walletId))
    .orderBy(desc(walletAlert.createdAt))

  return {
    ...w,
    status: w.status as WalletStatus,
    clientName: clientData?.name || 'Unknown',
    clientEmail: clientData?.email || '',
    projectName: projectData?.projectName || 'Unknown',
    projectCode: projectData?.projectCode || '',
    alerts,
  }
}

const getCachedWalletById = unstable_cache(
  async (userId: string, role: string, walletId: number) => {
    return _getWalletByIdImpl({ id: userId, role }, walletId)
  },
  undefined,
  {
    tags: ['wallet-detail'],
    revalidate: 30,
  }
)

// ─── Internal implementation: get wallet dashboard stats ─────────────────
async function _getWalletDashboardStatsImpl(currentUser: { id: string; role: string }) {
  const conditions = buildPermissionConditions(currentUser)

  if (currentUser.role === 'project_manager') {
    const visibleIds = await getVisibleWalletIds(currentUser)
    if (visibleIds && visibleIds.length === 0) return getZeroStats()
    if (visibleIds) conditions.push(inArray(supportWallet.id, visibleIds))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // OPTIMIZATION: Single SQL aggregate query instead of loading ALL wallet rows
  // into JS for summation. Full table scan replaced with index-only aggregate.
  // Before: loaded ALL columns for ALL wallets → JS reduce → 6 values
  // After:  single aggregate SQL → returns 7 numbers directly
  // Expected improvement: wallet page dashboard stats load in <10ms vs 200-500ms
  const [walletAgg] = await db
    .select({
      totalPurchased: sql<number>`COALESCE(SUM(${supportWallet.totalPurchasedHours}), 0)::int`.mapWith(Number),
      totalConsumed: sql<number>`COALESCE(SUM(${supportWallet.consumedHours}), 0)::int`.mapWith(Number),
      totalRemaining: sql<number>`COALESCE(SUM(${supportWallet.remainingHours}), 0)::int`.mapWith(Number),
      totalReserved: sql<number>`COALESCE(SUM(${supportWallet.reservedHours}), 0)::int`.mapWith(Number),
      lowBalanceClients: sql<number>`COUNT(*) FILTER (WHERE ${supportWallet.remainingHours} <= 20)::int`.mapWith(Number),
      activeWallets: sql<number>`COUNT(*) FILTER (WHERE ${supportWallet.status} = 'active')::int`.mapWith(Number),
      totalWallets: count().mapWith(Number),
      consumedThisMonth: sql<number>`COALESCE(SUM(${supportWallet.consumedHours}) FILTER (WHERE ${supportWallet.updatedAt} >= date_trunc('month', now())), 0)::int`.mapWith(Number),
    })
    .from(supportWallet)
    .where(whereClause)

  const firstOfMonth = new Date()
  firstOfMonth.setDate(1)
  firstOfMonth.setHours(0, 0, 0, 0)

  const [rechargesThisMonth] = await db
    .select({ count: count() })
    .from(walletTransaction)
    .where(and(eq(walletTransaction.transactionType, 'Add Hours'), gte(walletTransaction.performedAt, firstOfMonth)))

  return {
    totalPurchased: Number(walletAgg?.totalPurchased) || 0,
    totalConsumed: Number(walletAgg?.totalConsumed) || 0,
    totalRemaining: Number(walletAgg?.totalRemaining) || 0,
    totalReserved: Number(walletAgg?.totalReserved) || 0,
    lowBalanceClients: Number(walletAgg?.lowBalanceClients) || 0,
    activeWallets: Number(walletAgg?.activeWallets) || 0,
    totalWallets: Number(walletAgg?.totalWallets) || 0,
    rechargesThisMonth: Number(rechargesThisMonth?.count) || 0,
    consumedThisMonth: Number(walletAgg?.consumedThisMonth) || 0,
  }
}

const getCachedWalletDashboardStats = unstable_cache(
  async (userId: string, role: string) => {
    return _getWalletDashboardStatsImpl({ id: userId, role })
  },
  undefined,
  {
    tags: ['wallet-stats'],
    revalidate: 60,
  }
)

// ─── Internal implementation: get low balance wallets ────────────────────
async function _getLowBalanceWalletsImpl(currentUser: { id: string; role: string }, threshold: number = 20) {
  const conditions = [lte(supportWallet.remainingHours, threshold)]

  if (currentUser.role === 'client') {
    conditions.push(eq(supportWallet.clientId, currentUser.id))
  } else if (currentUser.role === 'project_manager') {
    const visibleIds = await getVisibleWalletIds(currentUser)
    if (visibleIds && visibleIds.length === 0) return []
    if (visibleIds) conditions.push(inArray(supportWallet.id, visibleIds))
  }

  const wallets = await db
    .select()
    .from(supportWallet)
    .where(and(...conditions))
    .orderBy(supportWallet.remainingHours)

  if (wallets.length === 0) return []

  const userIds = [...new Set(wallets.map(w => w.clientId))]
  const projectIds = [...new Set(wallets.map(w => w.projectId).filter((id): id is number => id !== null))]

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

  return wallets.map(w => ({
    ...w,
    clientName: userMap.get(w.clientId)?.name ?? undefined,
    projectName: projectMap.get(w.projectId!) ?? undefined,
  }))
}

const getCachedLowBalanceWallets = unstable_cache(
  async (userId: string, role: string, threshold: number) => {
    return _getLowBalanceWalletsImpl({ id: userId, role }, threshold)
  },
  undefined,
  {
    tags: ['wallet-low-balance'],
    revalidate: 60,
  }
)

// ─── Get wallet by project (no getCurrentUser needed) ───────────────────
export const getWalletByProject = unstable_cache(
  async function getWalletByProject(projectId: number) {
    const [w] = await db
      .select()
      .from(supportWallet)
      .where(eq(supportWallet.projectId, projectId))
      .limit(1)
    return w || null
  },
  [],
  { tags: ['wallet-project'], revalidate: 120 }
)

// ─── Server Actions (getCurrentUser is called OUTSIDE cached functions) ────

export const getWallets = async function getWallets(filters?: { clientId?: string; projectId?: number; status?: string }) {
  const { id: userId, role } = await getCurrentUser()
  const filtersJson = filters ? JSON.stringify(filters) : undefined
  return getCachedWallets(userId, role, filtersJson)
}

export const getWalletById = async function getWalletById(walletId: number) {
  const { id: userId, role } = await getCurrentUser()
  return getCachedWalletById(userId, role, walletId)
}

export const getWalletDashboardStats = async function getWalletDashboardStats() {
  const { id: userId, role } = await getCurrentUser()
  return getCachedWalletDashboardStats(userId, role)
}

export const getLowBalanceWallets = async function getLowBalanceWallets(threshold: number = 20) {
  const { id: userId, role } = await getCurrentUser()
  return getCachedLowBalanceWallets(userId, role, threshold)
}

// ─── Invalidate all wallet caches after mutation ──────────────────────
export async function invalidateWalletCaches(walletId?: number) {
  revalidateTag(WALLET_CACHE_TAGS.LIST)
  revalidateTag(WALLET_CACHE_TAGS.STATS)
  revalidateTag(WALLET_CACHE_TAGS.LOW_BALANCE)
  revalidateTag(WALLET_CACHE_TAGS.RENEWAL)
  if (walletId) {
    revalidateTag(WALLET_CACHE_TAGS.WALLET_DETAIL(walletId))
    revalidateTag(WALLET_CACHE_TAGS.TRANSACTIONS(walletId))
  }
  // Invalidate dashboard renewal banner cache — hours/contract changes affect it
  revalidateTag('renewal-status')
}

// ─── Internal helpers for project names (no server action nesting) ─────
// These are extracted to avoid getWalletPageData calling getProjectNames()
// which is a separate server action. Instead we call db directly.
async function _getProjectNamesForWallet(userId: string, role: string) {
  if (role === 'client') {
    // Check both: direct project.clientId match AND project_client junction table
    const [directProjects, linkedProjectIds] = await Promise.all([
      db
        .select({ projectId: project.id, projectName: project.projectName, projectCode: project.projectCode, clientId: project.clientId })
        .from(project)
        .where(eq(project.clientId, userId)),
      db
        .select({ projectId: projectClient.projectId })
        .from(projectClient)
        .where(eq(projectClient.userId, userId)),
    ])

    const allProjectIds = [...new Set([
      ...directProjects.map((p) => p.projectId),
      ...linkedProjectIds.map((pc) => pc.projectId),
    ])]

    if (allProjectIds.length === 0) return []

    return db
      .select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode, clientId: project.clientId })
      .from(project)
      .where(inArray(project.id, allProjectIds))
      .orderBy(desc(project.createdAt))
  }
  
  const conditions: any[] = []
  if (role === 'project_manager') {
    conditions.push(eq(project.managerId, userId))
  }
  return db
    .select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode, clientId: project.clientId })
    .from(project)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(project.createdAt))
}

// ─── Orchestrator: load all wallet page data (no nested server actions) ──
export async function getWalletPageData() {
  const currentUser = await getCurrentUser()
  const { id: userId, role } = currentUser

  const [wallets, stats, lowBalanceWallets, projects] = await Promise.all([
    _getWalletsImpl(currentUser),
    _getWalletDashboardStatsImpl(currentUser),
    _getLowBalanceWalletsImpl(currentUser, 20),
    _getProjectNamesForWallet(userId, role).catch(() => [] as { id: number; projectName: string; projectCode: string; clientId?: string }[]),
  ])

  // Import wallet renewal status lazily to avoid circular dependency at file level
  const { getClientRenewalStatus: getRenewalStatus } = await import('./renewals')
  const renewalStatus = await getRenewalStatus()

  return {
    currentUser,
    wallets,
    stats,
    lowBalanceWallets,
    projects,
    renewalStatus,
  }
}

// ─── Orchestrator: load wallet detail page data (no nested server actions) ─
export async function getWalletDetailPageData(walletId: number) {
  const currentUser = await getCurrentUser()
  const { id: userId, role } = currentUser

  // Import lazily to avoid circular deps
  const { _getWalletTransactionsImpl, _getWalletTicketConsumptionImpl } = await import('./transactions')

  const [wallet, transactions, consumption] = await Promise.all([
    _getWalletByIdImpl(currentUser, walletId),
    _getWalletTransactionsImpl(currentUser, walletId, 1, 20),
    _getWalletTicketConsumptionImpl(currentUser, walletId),
  ])

  return {
    currentUser,
    wallet,
    transactions: transactions.transactions,
    transactionsPagination: transactions.pagination,
    consumption,
  }
}
