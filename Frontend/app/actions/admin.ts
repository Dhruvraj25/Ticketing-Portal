'use server'

import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { getPortalUrl } from '@/lib/urls'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { ticket, timeLog, user, account, session, project, module as moduleTable, projectDeveloper, projectClient, supportWallet, walletTransaction } from '@/lib/db/schema'
import { and, eq, desc, sql, isNull, isNotNull, ne, count, inArray, gte, lte, sum } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { UserRole } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'
import { dispatchNotification } from '@/lib/notify-all'
import { logPasswordAudit } from '@/lib/password-audit'

// ============================================================================
// USER MANAGEMENT (Admin only)
// ============================================================================

// ─── Paginated User Listing (with search, filter, sort) ────────────────
// For admin users page. Uses COUNT(*) OVER() for pagination.
// Supports: search (name/email), role filter, sort column/direction.

export interface UserListFilters {
  search?: string
  role?: string
  banned?: boolean
  page?: number
  pageSize?: number
  sortBy?: 'createdAt' | 'name' | 'email' | 'role'
  sortDir?: 'asc' | 'desc'
}

export interface UserListResult {
  users: {
    id: string
    name: string
    email: string
    role: string
    banned: boolean
    enableTeamsNotifications: boolean
    createdAt: Date
  }[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

async function _getUsersPaginatedImpl(filters: UserListFilters): Promise<UserListResult> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50))
  const offset = (page - 1) * pageSize

  const conditions: any[] = []

  // Role filter
  if (filters.role && filters.role !== 'all') {
    conditions.push(eq(user.role, filters.role))
  }

  // Banned/active filter
  if (filters.banned !== undefined) {
    conditions.push(eq(user.banned, filters.banned))
  }

  // Search on name or email (case-insensitive via ILIKE)
  if (filters.search) {
    const pattern = `%${filters.search}%`
    conditions.push(
      sql`(${user.name} ILIKE ${pattern} OR ${user.email} ILIKE ${pattern})`
    )
  }

  // Sort
  const sortBy = filters.sortBy ?? 'createdAt'
  const sortDir = filters.sortDir ?? 'desc'
  const sortColumn = sortBy === 'createdAt' ? user.createdAt
    : sortBy === 'name' ? user.name
    : sortBy === 'email' ? user.email
    : user.role
  const orderByClause = sortDir === 'asc' ? sql`${sortColumn} ASC` : sql`${sortColumn} DESC`

  // Single query with COUNT(*) OVER() — avoids separate count query
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      enableTeamsNotifications: user.enableTeamsNotifications,
      createdAt: user.createdAt,
      totalCount: sql<number>`COUNT(*) OVER()::int`,
    })
    .from(user)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(orderByClause)
    .limit(pageSize)
    .offset(offset)

  const total = rows.length > 0 ? rows[0].totalCount : 0

  return {
    users: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      banned: r.banned,
      enableTeamsNotifications: r.enableTeamsNotifications,
      createdAt: r.createdAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

const ADMIN_USERS_CACHE_TTL = 120 // 2 min — shorter than full user list because pagination is user-specific

const getCachedUsersPaginated = unstable_cache(
  async (cacheKey: string) => {
    const filters: UserListFilters = JSON.parse(cacheKey)
    return _getUsersPaginatedImpl(filters)
  },
  undefined,
  { revalidate: ADMIN_USERS_CACHE_TTL, tags: ['admin-users-paginated'] },
)

export const getUsersPaginated = wrapServerAction('getUsersPaginated', async function getUsersPaginated(filters?: UserListFilters): Promise<UserListResult> {
  const currentUser = await getUser()
  if (currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }
  const cacheKey = JSON.stringify(filters ?? {})
  return getCachedUsersPaginated(cacheKey)
})

// ─── Cached User Role Counts ────────────────────────────────────────────
// Separates the aggregate count query from the full user listing.
// The admin page needs role counts for KPI cards — this avoids loading
// ALL users just to compute 4 numbers in JS.

export interface UserRoleCounts {
  total: number
  admins: number
  project_managers: number
  developers: number
  clients: number
}

async function _getUserRoleCountsImpl(): Promise<UserRoleCounts> {
  const [result] = await db
    .select({
      total: count().mapWith(Number),
      admins: sql<number>`COUNT(*) FILTER (WHERE ${user.role} = 'admin')::int`.mapWith(Number),
      managers: sql<number>`COUNT(*) FILTER (WHERE ${user.role} = 'project_manager')::int`.mapWith(Number),
      developers: sql<number>`COUNT(*) FILTER (WHERE ${user.role} = 'developer')::int`.mapWith(Number),
      clients: sql<number>`COUNT(*) FILTER (WHERE ${user.role} = 'client')::int`.mapWith(Number),
    })
    .from(user)

  return {
    total: result?.total || 0,
    admins: result?.admins || 0,
    project_managers: result?.managers || 0,
    developers: result?.developers || 0,
    clients: result?.clients || 0,
  }
}

const getCachedUserRoleCounts = unstable_cache(
  async () => _getUserRoleCountsImpl(),
  ['admin-user-role-counts'],
  { revalidate: 300, tags: ['admin-user-role-counts'] },
)

export const getUserRoleCounts = wrapServerAction('getUserRoleCounts', async function getUserRoleCounts(): Promise<UserRoleCounts> {
  const currentUser = await getUser()
  if (currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }
  return getCachedUserRoleCounts()
})

export const updateUserRole = wrapServerAction('updateUserRole', async function updateUserRole(userId: string, newRole: UserRole) {
  const currentUser = await getUser()

  if (currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }

  if (userId === currentUser.id) {
    throw new Error('Cannot change your own role')
  }

  await db
    .update(user)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(user.id, userId))

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/users')
  revalidateTag('admin-users', { expire: 120 })
  revalidateTag('admin-users-paginated', { expire: 120 })
  revalidateTag('admin-user-role-counts', { expire: 120 })
  revalidateTag('auth-user', { expire: 300 })
})

// ─── Teams Notification Preference ─────────────────────────────────────
// Customer-level toggle controlling whether this user's business events are
// posted to Microsoft Teams. In-app and email notifications are unaffected.

export const updateUserTeamsNotifications = wrapServerAction('updateUserTeamsNotifications', async function updateUserTeamsNotifications(userId: string, enabled: boolean) {
  const currentUser = await getUser()

  if (currentUser.role !== 'admin' && currentUser.role !== 'project_manager') {
    throw new Error('Access denied')
  }

  if (typeof enabled !== 'boolean') {
    throw new Error('Invalid value for Teams notifications preference')
  }

  const [target] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, userId)).limit(1)
  if (!target) throw new Error('User not found')
  // This is a customer (client account) preference — internal staff are not gated.
  if (target.role !== 'client') throw new Error('Teams notifications preference applies to customer (client) accounts only')

  await db
    .update(user)
    .set({ enableTeamsNotifications: enabled, updatedAt: new Date() })
    .where(eq(user.id, userId))

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/users')
  revalidateTag('admin-users', { expire: 120 })
  revalidateTag('admin-users-paginated', { expire: 120 })
  revalidateTag('admin-user-role-counts', { expire: 120 })
  revalidateTag('auth-user', { expire: 300 })
  return { enabled }
})

// ============================================================================
// ADMIN — User Creation, Deletion, Password Reset, Activate/Deactivate
// ============================================================================

export const createUser = wrapServerAction('createUser', async function createUser(data: {
  name: string
  email: string
  password: string
  role: UserRole
}) {
  const currentUser = await getUser()
  if (currentUser.role !== 'admin') throw new Error('Access denied')

  // Emails are compared and stored lowercase so USER@X.COM and user@x.com are
  // the same account (case-insensitive email handling).
  const normalizedEmail = data.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('Please enter a valid email address')

  // Check email uniqueness
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, normalizedEmail))
    .limit(1)
  if (existing) throw new Error('A user with this email already exists')

  if (data.password.length < 8) throw new Error('Password must be at least 8 characters')

  // disableSignUp is true, so we cannot call auth.api.signUpEmail.
  // Instead hash the password via Better Auth's internal context and insert directly.
  const { auth } = await import('@/lib/auth')
  const ctx = await auth.$context
  const hashedPassword = await ctx.password.hash(data.password)

  const userId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const now = new Date()

  try {
    await db.insert(user).values({
      id: userId,
      name: data.name,
      email: normalizedEmail,
      emailVerified: true,
      role: data.role,
      banned: false,
      createdAt: now,
      updatedAt: now,
    })
  } catch (err: any) {
    // Detect missing column errors (schema out of sync with database)
    const msg = err?.message || ''
    // Detect missing column errors (schema out of sync with database)
    // PostgreSQL error pattern: column "col_name" of relation "table_name" does not exist
    if (msg.includes('does not exist') || msg.includes('welcome_email_sent')) {
      console.error('[createUser] Schema mismatch detected. The database is missing a column that exists in the schema.', err)
      throw new Error(
        'Database schema out of sync with the application. ' +
        'Run the database migration to add the missing column(s). ' +
        'Execute: node scripts/add-welcome-email-column.mjs'
      )
    }
    // General database error
    console.error('[createUser] Failed to create user:', err)
    throw new Error(`Failed to create user: ${err?.message || 'Unknown database error'}`)
  }

  try {
    await db.insert(account).values({
      id: accountId,
      accountId: userId,
      providerId: 'credential',
      userId,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    })
  } catch (err: any) {
    console.error('[createUser] Failed to create account:', err)
    // Attempt cleanup of the user that was already inserted
    db.delete(user).where(eq(user.id, userId)).catch(() => {})
    throw new Error(`Failed to create user account: ${err?.message || 'Unknown error'}`)
  }

  // Auto-create support wallet for client users
  if (data.role === 'client') {
    try {
      const { autoCreateWalletForClient } = await import('@/app/actions/wallets')
      await autoCreateWalletForClient(userId)
    } catch (err) {
      console.error('[createUser] Failed to auto-create wallet:', err)
    }
  }

  // Send Customer Created notification via the unified dispatcher (fire-and-forget)
  const portalUrl = getPortalUrl()
  dispatchNotification({
    eventType: 'customer_created',
    triggeredBy: currentUser.id,
    dedup: { scope: `user:${userId}` },
    recipients: [
      {
        userId,
        email: {
          templateData: {
            customerName: data.name,
            customerEmail: data.email,
            createdBy: currentUser.name || 'Admin',
            portalUrl,
            projectName: '',
          },
        },
        teams: {
          payload: {
            customerName: data.name, customerEmail: data.email,
            createdBy: currentUser.name || 'Admin', projectName: '',
          },
        },
      },
    ],
  }).catch((err: Error) => console.error('[Notify] customer_created failed:', err))

  revalidatePath('/dashboard/admin/users')
  revalidatePath('/dashboard/wallets')
  revalidateTag('admin-users', { expire: 120 })
  revalidateTag('admin-users-paginated', { expire: 120 })
  revalidateTag('admin-user-role-counts', { expire: 120 })
  revalidateTag('auth-user', { expire: 300 })
  return { id: userId, name: data.name, email: normalizedEmail, role: data.role }
})

export const deleteUser = wrapServerAction('deleteUser', async function deleteUser(userId: string) {
  const currentUser = await getUser()
  if (currentUser.role !== 'admin') throw new Error('Access denied')
  if (userId === currentUser.id) throw new Error('Cannot delete your own account')

  // Check target exists and is not an admin
  const [target] = await db.select({ role: user.role, name: user.name }).from(user).where(eq(user.id, userId)).limit(1)
  if (!target) throw new Error('User not found')
  if (target.role === 'admin') throw new Error('Cannot delete an admin account')

  // Check if user has related projects (client or manager)
  const [projectAsClient] = await db
    .select({ count: count() })
    .from(project)
    .where(eq(project.clientId, userId))
    .limit(1)

  const [projectAsManager] = await db
    .select({ count: count() })
    .from(project)
    .where(eq(project.managerId, userId))
    .limit(1)

  if (Number(projectAsClient?.count) > 0 || Number(projectAsManager?.count) > 0) {
    throw new Error(
      `Cannot delete "${target.name}" because they are associated with one or more projects. ` +
      'Reassign or delete their projects first, or deactivate the user instead.'
    )
  }

  try {
    // Delete user (sessions and accounts cascade via DB constraints)
    await db.delete(user).where(eq(user.id, userId))
  } catch (err) {
    console.error('[deleteUser] Database error:', err)
    throw new Error(
      `Failed to delete "${target.name}". The user may have related records ` +
      '(tickets, notifications, etc.) that prevent deletion. ' +
      'Try deactivating the user instead.'
    )
  }

  revalidatePath('/dashboard/admin/users')
  revalidateTag('admin-users', { expire: 120 })
  revalidateTag('admin-users-paginated', { expire: 120 })
  revalidateTag('admin-user-role-counts', { expire: 120 })
  revalidateTag('auth-user', { expire: 300 })
})

export const resetUserPassword = wrapServerAction('resetUserPassword', async function resetUserPassword(userId: string, newPassword: string) {
  const currentUser = await getUser()
  const isAdmin = currentUser.role === 'admin'
  const isManager = currentUser.role === 'project_manager'

  // ── Strict role-based authorization ────────────────────────────────────
  // Only Admin (any user) and Project Manager (users on their own projects)
  // may directly reset a password. Everyone else is denied at the backend —
  // this cannot be bypassed from the frontend.
  if (!isAdmin && !isManager) {
    await logPasswordAudit({
      eventType: 'unauthorized_password_attempt',
      actorUserId: currentUser.id,
      actorName: currentUser.name,
      targetUserId: userId,
      action: 'reset_password',
      result: 'denied',
      detail: 'actor role is not permitted to reset passwords',
    })
    throw new Error('Access denied')
  }

  if (newPassword.length < 8) throw new Error('Password must be at least 8 characters')

  // Verify the user exists
  const [target] = await db
    .select({ email: user.email, role: user.role, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!target) throw new Error('User not found')

  // Managers may only reset passwords for clients/developers on projects they
  // manage — never for admins or other managers.
  if (isManager) {
    if (target.role === 'admin' || target.role === 'project_manager') {
      await logPasswordAudit({
        eventType: 'unauthorized_password_attempt',
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        targetUserId: userId,
        targetEmail: target.email,
        action: 'reset_password',
        result: 'denied',
        detail: 'target role is not manageable by a project manager',
      })
      throw new Error('Access denied')
    }

    const managedProjects = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.managerId, currentUser.id))
    const projectIds = managedProjects.map((p) => p.id)

    let authorized = false
    if (projectIds.length > 0) {
      const [asClientOwner] = await db
        .select({ id: project.id })
        .from(project)
        .where(and(eq(project.managerId, currentUser.id), eq(project.clientId, userId)))
        .limit(1)
      const [asProjectClient] = await db
        .select({ id: projectClient.id })
        .from(projectClient)
        .where(and(inArray(projectClient.projectId, projectIds), eq(projectClient.userId, userId)))
        .limit(1)
      const [asDeveloper] = await db
        .select({ id: projectDeveloper.id })
        .from(projectDeveloper)
        .where(and(inArray(projectDeveloper.projectId, projectIds), eq(projectDeveloper.userId, userId)))
        .limit(1)
      authorized = !!(asClientOwner || asProjectClient || asDeveloper)
    }

    if (!authorized) {
      await logPasswordAudit({
        eventType: 'unauthorized_password_attempt',
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        targetUserId: userId,
        targetEmail: target.email,
        action: 'reset_password',
        result: 'denied',
        detail: 'target user is not associated with any project managed by the actor',
      })
      throw new Error('Access denied')
    }
  }

  // Hash the new password using Better Auth's internal password hasher
  const { auth } = await import('@/lib/auth')
  const ctx = await auth.$context
  const hashedPassword = await ctx.password.hash(newPassword)

  // Use Better Auth's internal adapter to update the password
  await ctx.internalAdapter.updatePassword(userId, hashedPassword)

  // ── Audit + notify ────────────────────────────────────────────────────
  const actorLabel = isAdmin ? 'an administrator' : 'a project manager'
  await logPasswordAudit({
    eventType: 'password_changed',
    actorUserId: currentUser.id,
    actorName: currentUser.name,
    targetUserId: userId,
    targetEmail: target.email,
    action: isAdmin ? 'reset_password_by_admin' : 'reset_password_by_manager',
    result: 'success',
    detail: `target=${target.name || target.email}`,
  })

  dispatchNotification({
    eventType: 'password_changed',
    triggeredBy: currentUser.id,
    dedup: { scope: `user:${userId}` },
    recipients: [
      {
        userId,
        inApp: {
          title: 'Password changed',
          message: `Your Support Hero password was reset by ${currentUser.name || actorLabel}. If you did not request this change, contact Support immediately.`,
        },
      },
    ],
  }).catch((err: Error) => console.error('[Notify] password_changed failed:', err))

  revalidatePath('/dashboard/admin/users')
  revalidateTag('auth-user', { expire: 300 })
  return { success: true }
})

export const toggleUserBanned = wrapServerAction('toggleUserBanned', async function toggleUserBanned(userId: string) {
  const currentUser = await getUser()
  if (currentUser.role !== 'admin') throw new Error('Access denied')
  if (userId === currentUser.id) throw new Error('Cannot deactivate your own account')

  const [target] = await db.select({ banned: user.banned, role: user.role }).from(user).where(eq(user.id, userId)).limit(1)
  if (!target) throw new Error('User not found')
  if (target.role === 'admin') throw new Error('Cannot deactivate an admin account')

  const newBanned = !target.banned

  await db
    .update(user)
    .set({ banned: newBanned, updatedAt: new Date() })
    .where(eq(user.id, userId))

  // If deactivating, delete all active sessions for the user
  if (newBanned) {
    await db.delete(session).where(eq(session.userId, userId))
  } else {
    // Account Activated — user was banned, now unbanned
    const [activatedUser] = await db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)

    if (activatedUser) {
      const loginUrl = getPortalUrl()
      dispatchNotification({
        eventType: 'account_activated',
        triggeredBy: currentUser.id,
        dedup: { scope: `user:${userId}` },
        recipients: [
          {
            userId,
            email: {
              templateData: {
                userEmail: activatedUser.email,
                userName: activatedUser.name || '',
                loginUrl,
              },
            },
            teams: {
              payload: {
                userEmail: activatedUser.email, userName: activatedUser.name || '', loginUrl,
              },
            },
          },
        ],
      }).catch((err: Error) => console.error('[Notify] account_activated failed:', err))
    }
  }

  revalidatePath('/dashboard/admin/users')
  revalidateTag('admin-users', { expire: 120 })
  revalidateTag('admin-users-paginated', { expire: 120 })
  revalidateTag('admin-user-role-counts', { expire: 120 })
  revalidateTag('auth-user', { expire: 300 })
  return { banned: newBanned }
})

// ============================================================================
// PROJECT METRICS — aggregate project-level numbers for admin dashboard
// ============================================================================

export const getProjectMetrics = wrapServerAction('getProjectMetrics', async function getProjectMetrics() {
  const currentUser = await getUser()

  if (currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }

  // Combine 5 sequential queries into 3 parallel queries
  const [projectStats, ticketStats, timeResult] = await Promise.all([
    // Project counts (total + active) in one query with CASE WHEN
    db
      .select({
        total: sql<number>`COUNT(*)::int`,
        active: sql<number>`COUNT(*) FILTER (WHERE ${project.status} = 'active')::int`,
      })
      .from(project),

    // Ticket counts (open + closed) in one query with CASE WHEN
    db
      .select({
        openCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} IN ('open', 'assigned', 'in_progress', 'reopened'))::int`,
        closedCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'closed')::int`,
      })
      .from(ticket),

    // Total logged hours (completed logs)
    db
      .select({ total: sum(timeLog.durationMinutes) })
      .from(timeLog)
      .where(sql`${timeLog.endTime} IS NOT NULL`),
  ])

  const ps = projectStats?.[0] || { total: 0, active: 0 }
  const ts = ticketStats?.[0] || { openCount: 0, closedCount: 0 }

  return {
    totalProjects: Number(ps.total) || 0,
    activeProjects: Number(ps.active) || 0,
    totalProjectHours: Math.round((Number(timeResult?.[0]?.total) || 0) / 60 * 10) / 10,
    openTickets: Number(ts.openCount) || 0,
    closedTickets: Number(ts.closedCount) || 0,
  }
})

// ============================================================================
// PROJECT DETAIL ANALYTICS — per-project deep dive for project page
// ============================================================================

export const getProjectDetailAnalytics = wrapServerAction('getProjectDetailAnalytics', async function getProjectDetailAnalytics(projectId: number) {
  const currentUser = await getUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }

  // ── PARALLELIZED: 3 independent queries in 2 steps (was 7 sequential queries) ──
  // Step 1: Fetch tickets + ticket counts + module counts in parallel (all use projectId)
  const [projectTickets, ticketCounts, moduleTicketCounts] = await Promise.all([
    db.select({ id: ticket.id }).from(ticket).where(eq(ticket.projectId, projectId)),
    db.select({ status: ticket.status, count: count() }).from(ticket).where(eq(ticket.projectId, projectId)).groupBy(ticket.status),
    db.select({ moduleId: ticket.moduleId, count: count() }).from(ticket).where(and(eq(ticket.projectId, projectId), sql`${ticket.moduleId} IS NOT NULL`)).groupBy(ticket.moduleId),
  ])

  const projectTicketIds = projectTickets.map((t) => t.id)
  const moduleIds = moduleTicketCounts.filter((r) => r.moduleId !== null).map((r) => r.moduleId as number)

  // Step 2: Fetch time logs + module names in parallel (both depend on step 1)
  let totalMinutesLogged = 0
  let devTimeLogs: { userId: string; totalMinutes: number }[] = []
  let moduleNames: { id: number; name: string }[] = []

  if (projectTicketIds.length > 0 || moduleIds.length > 0) {
    const [timeResult, timeLogRows, names] = await Promise.all([
      projectTicketIds.length > 0
        ? db.select({ total: sum(timeLog.durationMinutes) }).from(timeLog).where(and(inArray(timeLog.ticketId, projectTicketIds), sql`${timeLog.endTime} IS NOT NULL`))
        : Promise.resolve([{ total: null }]),
      projectTicketIds.length > 0
        ? db.select({ userId: timeLog.userId, totalMinutes: sum(timeLog.durationMinutes) }).from(timeLog).where(and(inArray(timeLog.ticketId, projectTicketIds), sql`${timeLog.endTime} IS NOT NULL`)).groupBy(timeLog.userId)
        : Promise.resolve([] as { userId: string; totalMinutes: number | null }[]),
      moduleIds.length > 0
        ? db.select({ id: moduleTable.id, name: moduleTable.moduleName }).from(moduleTable).where(inArray(moduleTable.id, moduleIds))
        : Promise.resolve([] as { id: number; name: string }[]),
    ])

    totalMinutesLogged = Number(timeResult?.[0]?.total) || 0
    devTimeLogs = timeLogRows.map((r) => ({ userId: r.userId, totalMinutes: Number(r.totalMinutes) || 0 }))
    moduleNames = names
  }

  const moduleNameMap = new Map(moduleNames.map((m) => [m.id, m.name]))

  // Process results
  const ticketStatusMap: Record<string, number> = {}
  let totalTickets = 0
  for (const r of ticketCounts) {
    const c = Number(r.count) || 0
    ticketStatusMap[r.status] = c
    totalTickets += c
  }

  const moduleStats = moduleTicketCounts
    .filter((r) => r.moduleId !== null)
    .map((r) => ({
      moduleId: r.moduleId as number,
      moduleName: moduleNameMap.get(r.moduleId as number) || `Module #${r.moduleId}`,
      ticketCount: Number(r.count) || 0,
    }))

  // Developer contribution — fetch user names
  const developerUserIds = devTimeLogs.map((r) => r.userId)
  const devUsers = developerUserIds.length > 0
    ? await db.select({ id: user.id, name: user.name, role: user.role }).from(user).where(inArray(user.id, developerUserIds))
    : []
  const devUserMap = new Map(devUsers.map((u) => [u.id, u]))

  const developerContributions = devTimeLogs
    .map((r) => {
      const u = devUserMap.get(r.userId)
      return {
        userId: r.userId,
        userName: u?.name || 'Unknown',
        role: u?.role || 'developer',
        totalMinutes: Number(r.totalMinutes) || 0,
      }
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes)

  const developerHours = developerContributions
    .filter((c) => c.role === 'developer')
    .reduce((s, c) => s + c.totalMinutes, 0)
  const managerHours = developerContributions
    .filter((c) => c.role === 'project_manager' || c.role === 'admin')
    .reduce((s, c) => s + c.totalMinutes, 0)

  return {
    totalHours: Math.round((totalMinutesLogged || 0) / 60 * 10) / 10,
    totalTickets,
    ticketStatusMap,
    moduleStats,
    developerContributions,
    developerHours: Math.round(developerHours / 60 * 10) / 10,
    managerHours: Math.round(managerHours / 60 * 10) / 10,
  }
})

// ============================================================================
// MODULE ANALYTICS — per-module ticket, hour, and resolution stats
// ============================================================================

export const getModuleAnalytics = wrapServerAction('getModuleAnalytics', async function getModuleAnalytics(projectId: number) {
  const currentUser = await getUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }

  // ── PARALLELIZED: modules + tickets fetched concurrently (were sequential) ──
  const [modules, ticketData] = await Promise.all([
    db
      .select({ id: moduleTable.id, moduleName: moduleTable.moduleName, status: moduleTable.status })
      .from(moduleTable)
      .where(eq(moduleTable.projectId, projectId))
      .orderBy(moduleTable.moduleName),
    db
      .select({
        moduleId: ticket.moduleId, status: ticket.status,
        createdAt: ticket.createdAt, resolvedAt: ticket.resolvedAt, id: ticket.id,
      })
      .from(ticket)
      .where(and(eq(ticket.projectId, projectId), sql`${ticket.moduleId} IS NOT NULL`)),
  ])

  if (modules.length === 0) return []

  // Hours per module (from timeLogs) — depends on ticket IDs from ticketData
  const moduleTicketIds = ticketData.map((t) => t.id)
  const hourData = moduleTicketIds.length > 0
    ? await db
        .select({
          ticketId: timeLog.ticketId,
          totalMinutes: sum(timeLog.durationMinutes),
        })
        .from(timeLog)
        .where(
          and(inArray(timeLog.ticketId, moduleTicketIds), sql`${timeLog.endTime} IS NOT NULL`),
        )
        .groupBy(timeLog.ticketId)
    : []

  const hoursByTicket = new Map(hourData.map((h) => [h.ticketId, Number(h.totalMinutes) || 0]))

  // Build module analytics (JS processing — same as before but data arrives faster)
  return modules.map((mod) => {
    const modTickets = ticketData.filter((t) => t.moduleId === mod.id)
    const total = modTickets.length
    const resolved = modTickets.filter((t) => t.status === 'resolved' || t.status === 'closed')
    const resolutionTimes = resolved.filter((t) => t.resolvedAt).map((t) =>
      (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60))
    const avgResolutionHours = resolutionTimes.length > 0
      ? Math.round((resolutionTimes.reduce((s, h) => s + h, 0) / resolutionTimes.length) * 10) / 10
      : 0
    const moduleMinutes = modTickets.reduce((s, t) => s + (hoursByTicket.get(t.id) || 0), 0)

    return {
      moduleId: mod.id, moduleName: mod.moduleName, status: mod.status,
      ticketCount: total, resolvedCount: resolved.length,
      totalMinutes: moduleMinutes,
      totalHours: Math.round((moduleMinutes / 60) * 10) / 10,
      avgResolutionHours,
    }
  })
})

// ============================================================================
// PROJECT TICKET ANALYTICS — per-project ticket stats for dashboard
// ============================================================================

/**
 * In-memory cache for project analytics (30-second TTL).
 * Project data and ticket counts change slowly — caching avoids
 * redundant queries on every render, especially on the Dashboard sidebar.
 * Keyed by user role so managers only see their own projects.
 */
const projectAnalyticsCache = new Map<string, { data: any; expiresAt: number }>()
const PROJECT_ANALYTICS_CACHE_TTL = 30_000 // 30 seconds

function getCachedProjectAnalytics<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const cached = projectAnalyticsCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.data)
  }
  return compute().then((data) => {
    projectAnalyticsCache.set(key, { data, expiresAt: Date.now() + PROJECT_ANALYTICS_CACHE_TTL })
    return data
  })
}

export const getProjectTicketAnalytics = wrapServerAction('getProjectTicketAnalytics', async function getProjectTicketAnalytics() {
  const currentUser = await getUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }

  // Cache key is role-specific so managers don't see other managers' data
  const cacheKey = `project_analytics_${currentUser.role}_${currentUser.id}`

  return getCachedProjectAnalytics(cacheKey, async () => {
    // Get projects this manager manages (or all if admin)
    const projects = await db
      .select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode })
      .from(project)
      .where(
        currentUser.role === 'project_manager'
          ? eq(project.managerId, currentUser.id)
          : undefined,
      )
      .orderBy(desc(project.projectName))

    if (projects.length === 0) return []

    const projectIds = projects.map((p) => p.id)

    // Get ticket counts per project
    const ticketCounts = await db
      .select({
        projectId: ticket.projectId,
        status: ticket.status,
        count: count(),
      })
      .from(ticket)
      .where(
        and(
          inArray(ticket.projectId, projectIds),
          isNotNull(ticket.projectId),
        ),
      )
      .groupBy(ticket.projectId, ticket.status)

    // Organize by project
    const countsByProject = new Map<number, {
      total: number
      open: number
      inProgress: number
      resolved: number
      closed: number
    }>()

    for (const row of ticketCounts) {
      if (!row.projectId) continue
      let entry = countsByProject.get(row.projectId)
      if (!entry) {
        entry = { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 }
        countsByProject.set(row.projectId, entry)
      }
      const c = Number(row.count) || 0
      entry.total += c
      if (row.status === 'open' || row.status === 'assigned') entry.open += c
      if (row.status === 'in_progress' || row.status === 'reopened') entry.inProgress += c
      if (row.status === 'resolved' || row.status === 'pending_client') entry.resolved += c
      if (row.status === 'closed') entry.closed += c
    }

    return projects.map((p) => ({
      id: p.id,
      projectName: p.projectName,
      projectCode: p.projectCode,
      ...(countsByProject.get(p.id) || { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 }),
    }))
  })
})
