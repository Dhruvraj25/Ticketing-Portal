'use server'

import { db } from '@/lib/db'
import { project, user, account, projectClient } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { wrapServerAction } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'
import type { ClientUserType } from '@/lib/types'
import { companiesByIds, companyIdOfProject, companyIdOfUser } from '@/lib/company-wallet'

// ============================================================================
// PROJECT USERS (Phase 6) — client-org users linked to a project via
// project_client. project.clientId is the "primary" account; project_client
// is the canonical set of ALL client users (approver + standard) who can see
// this project, including the primary.
// ============================================================================

export interface ProjectClientUser {
  id: string
  name: string
  email: string
  role: string
  userType: ClientUserType
  banned: boolean
  assignedAt: Date | null
  isPrimary: boolean
}

export const getProjectClientUsers = wrapServerAction('getProjectClientUsers', async function getProjectClientUsers(projectId: number): Promise<ProjectClientUser[]> {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }

  const [p] = await db.select({ clientId: project.clientId }).from(project).where(eq(project.id, projectId)).limit(1)
  if (!p) throw new Error('Project not found')

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      userType: user.userType,
      banned: user.banned,
      assignedAt: projectClient.assignedAt,
    })
    .from(projectClient)
    .innerJoin(user, eq(projectClient.userId, user.id))
    .where(eq(projectClient.projectId, projectId))

  return rows.map((r) => ({
    ...r,
    userType: (r.userType === 'approver' ? 'approver' : 'standard') as ClientUserType,
    isPrimary: r.id === p.clientId,
  }))
})

export const addUserToProject = wrapServerAction('addUserToProject', async function addUserToProject(projectId: number, data: {
  email: string
  name?: string
  userType: ClientUserType
  password?: string
}) {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can add users to a project')
  }

  // ── Validate project exists ────────────────────────────────────────────
  const [p] = await db.select({ id: project.id }).from(project).where(eq(project.id, projectId)).limit(1)
  if (!p) throw new Error('Project not found')
  // Project users belong to the project's company and share its one wallet.
  const projectCompanyId = await companyIdOfProject(db, projectId)

  // ── Validate email ──────────────────────────────────────────────────────
  const normalizedEmail = (data.email ?? '').trim().toLowerCase()
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Please enter a valid email address.')
  }

  // ── Validate account type ───────────────────────────────────────────────
  if (data.userType !== 'approver' && data.userType !== 'standard') {
    throw new Error('Account type must be either Approver or Standard.')
  }

  // ── Preserve existing user, or create a new one ─────────────────────────
  const [existing] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.email, normalizedEmail)).limit(1)

  if (existing) {
    if (existing.role !== 'client') {
      throw new Error('This email belongs to a non-client account and cannot be added as a project user.')
    }

    // A user of ANOTHER company can't join this project: its tickets draw on
    // this company's wallet, which that user must not use.
    const existingCompanyId = await companyIdOfUser(db, existing.id)
    if (projectCompanyId && existingCompanyId && existingCompanyId !== projectCompanyId) {
      throw new Error('This user belongs to a different company and cannot be added to this project.')
    }

    const [dup] = await db
      .select({ id: projectClient.id })
      .from(projectClient)
      .where(and(eq(projectClient.projectId, projectId), eq(projectClient.userId, existing.id)))
      .limit(1)
    if (dup) throw new Error('This user is already part of this project.')

    try {
      await db.insert(projectClient).values({
        projectId,
        userId: existing.id,
        assignedBy: currentUser.id,
        assignedAt: new Date(),
      })
    } catch (err: any) {
      const msg = err?.message || ''
      if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('23505')) {
        throw new Error('This user is already part of this project.')
      }
      throw err
    }

    revalidatePath(`/dashboard/projects/${projectId}`)
    return { id: existing.id, created: false }
  }

  // Genuinely new account — mirrors app/actions/admin.ts createUser()'s
  // validation and user+account creation exactly (same required fields,
  // same password rule, same id-generation/hashing approach), so a project
  // user created here can log in the same way an admin-created user can.
  if (!data.name?.trim()) throw new Error('Please complete all required fields.')
  if (!data.password) throw new Error('Please complete all required fields.')
  if (data.password.length < 8) throw new Error('Password must be at least 8 characters.')

  const { auth } = await import('@/lib/auth')
  const ctx = await auth.$context
  const hashedPassword = await ctx.password.hash(data.password)

  const userId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const now = new Date()
  const projectCompany = projectCompanyId ? (await companiesByIds(db, [projectCompanyId])).get(projectCompanyId) : undefined

  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: data.name!.trim(),
        email: normalizedEmail,
        emailVerified: false,
        role: 'client',
        userType: data.userType,
        // Joins the project's company (display mirror kept in sync).
        companyId: projectCompanyId,
        companyName: projectCompany?.name ?? null,
        companyCode: projectCompany?.code ?? null,
        banned: false,
        createdAt: now,
        updatedAt: now,
      })

      await tx.insert(account).values({
        id: accountId,
        accountId: userId,
        providerId: 'credential',
        userId,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      })

      await tx.insert(projectClient).values({
        projectId,
        userId,
        assignedBy: currentUser.id,
        assignedAt: now,
      })
    })
  } catch (err: any) {
    // Race-condition backstop: the pre-check SELECT above found no existing
    // user for this email, but a concurrent request could have created one
    // in the gap between that check and this insert. The user.email column
    // is the ONLY unique constraint this transaction can violate (userId/
    // accountId are fresh crypto.randomUUID()s — collision is not a real
    // possibility — and projectId+userId can't already exist for an id that
    // didn't exist a moment ago), so any unique-violation here means the
    // email lost the race. Never surface the raw Postgres error.
    const msg = err?.message || ''
    if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('23505')) {
      throw new Error('An account with this email already exists.')
    }
    console.error('[addUserToProject] Failed to create the new user account:', err)
    throw new Error('Could not create the new user account. Please try again.')
  }

  // Ensure the COMPANY wallet (returns the existing one — never a second wallet).
  try {
    const { autoCreateWalletForClient } = await import('@/app/actions/wallets')
    await autoCreateWalletForClient(userId)
  } catch (err) {
    console.error('[addUserToProject] Failed to auto-create wallet:', err)
  }

  revalidatePath(`/dashboard/projects/${projectId}`)
  revalidatePath('/dashboard/admin/users')
  return { id: userId, created: true }
})

/**
 * Removes a user's PROJECT MEMBERSHIP ONLY (deletes the project_client link).
 * Never deletes the user account, never bans/deactivates it, never touches
 * any other project's membership. To deactivate the account entirely, use
 * the separate (admin-only) toggleUserBanned action.
 */
export const removeUserFromProject = wrapServerAction('removeUserFromProject', async function removeUserFromProject(projectId: number, userId: string) {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can remove users from a project')
  }

  const [p] = await db.select({ id: project.id, clientId: project.clientId }).from(project).where(eq(project.id, projectId)).limit(1)
  if (!p) throw new Error('Project not found.')

  const [targetUser] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1)
  if (!targetUser) throw new Error('User not found.')

  // "Last required project membership": project.clientId is a NOT NULL FK —
  // the project cannot exist without an owning client. Removing that user's
  // project_client row while they're still the FK owner would let them vanish
  // from their own project's user list while still technically owning it.
  // Checked BEFORE the "already removed" lookup below because this is a
  // permanent property of the project regardless of whether a project_client
  // row happens to exist for them (assignClient always mirrors one, but this
  // guard must hold even if that row were ever missing/stale).
  if (userId === p.clientId) {
    throw new Error("This user is the project's primary Key User and cannot be removed from the project. Reassign the Key User first.")
  }

  const [link] = await db
    .select({ id: projectClient.id })
    .from(projectClient)
    .where(and(eq(projectClient.projectId, projectId), eq(projectClient.userId, userId)))
    .limit(1)
  if (!link) throw new Error('This user is not part of this project (they may have already been removed).')

  try {
    await db.delete(projectClient).where(and(eq(projectClient.projectId, projectId), eq(projectClient.userId, userId)))
  } catch (err) {
    console.error('[removeUserFromProject] Failed to remove project_client link:', err)
    throw new Error('Could not remove this user from the project due to a database error. Please try again.')
  }

  revalidatePath(`/dashboard/projects/${projectId}`)
  return { success: true }
})
