'use server'

import { db } from '@/lib/db'
import { project, user, account, projectClient } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { wrapServerAction } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'
import type { ClientUserType } from '@/lib/types'

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

  await db.transaction(async (tx) => {
    await tx.insert(user).values({
      id: userId,
      name: data.name!.trim(),
      email: normalizedEmail,
      emailVerified: false,
      role: 'client',
      userType: data.userType,
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

  // Auto-create support wallet for the new client user (non-critical, matches createUser()).
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
