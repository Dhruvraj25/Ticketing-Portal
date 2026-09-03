'use server'

import { db } from '@/lib/db'
import { project } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import { VALIDATION, validateField } from '@/lib/types'
import { getPortalUrl } from '@/lib/urls'
import type { ProjectStatus } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'
import { dispatchNotification } from '@/lib/notify-all'

// ============================================================================
// HELPERS
// ============================================================================

function generateProjectCode(name: string): string {
  const prefix = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 6) || 'PRJ'
  const suffix = Date.now().toString(36).slice(-4).toUpperCase()
  return `${prefix}-${suffix}`
}

// ============================================================================
// CREATE
// ============================================================================

/** Invalidate all project-related caches */
function invalidateProjectCaches(projectId?: number) {
  revalidateTag('projects', { expire: 60 })
  if (projectId) revalidateTag('project-by-id', { expire: 60 })
  revalidateTag('project-names', { expire: 60 })
  revalidateTag('project-analytics', { expire: 60 })
  revalidateTag('project-ticket-analytics', { expire: 60 })
}

export const createProject = wrapServerAction('createProject', async function createProject(data: {
  projectName: string
  clientId: string
  managerId: string
  description?: string
  startDate?: string
}) {
  const currentUser = await getCurrentUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can create projects')
  }

  if (!data.managerId) {
    throw new Error('A project manager must be selected')
  }

  const nameErr = validateField(data.projectName, VALIDATION.PROJECT_NAME_MAX_LENGTH, 'Project name')
  if (nameErr) throw new Error(nameErr)
  if (data.description) {
    const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
    if (descErr) throw new Error(descErr)
  }

  const projectCode = generateProjectCode(data.projectName)

  const [newProject] = await db
    .insert(project)
    .values({
      projectName: data.projectName,
      projectCode,
      clientId: data.clientId,
      managerId: data.managerId,
      description: data.description ?? null,
      startDate: data.startDate ?? null,
      status: 'active',
    })
    .returning()

  // Auto-create support wallet for the new project
  try {
    const { autoCreateWalletForProject } = await import('@/app/actions/wallets')
    await autoCreateWalletForProject(newProject.id, newProject.clientId)
  } catch {
    // Wallet creation is non-critical
  }

  // Notifications for project creation via the unified dispatcher
  const projectLink = (getPortalUrl()) + '/dashboard/projects/' + newProject.id
  const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = [
    {
      userId: data.managerId,
      inApp: {
        title: 'New Project Created',
        message: `Project ${data.projectName} (${projectCode}) has been created.`,
        link: `/dashboard/projects/${newProject.id}`,
      },
      email: {
        templateData: { projectName: data.projectName, projectCode, projectLink },
      },
      teams: {
        payload: { projectName: data.projectName, projectCode, url: projectLink },
      },
    },
  ]
  // Client (project owner): In-App + Email + Teams
  if (data.clientId) {
    recipients.push({
      userId: data.clientId,
      inApp: {
        title: 'New Project Created',
        message: `A new project ${data.projectName} (${projectCode}) has been created for you.`,
        link: `/dashboard/projects/${newProject.id}`,
      },
      email: {
        templateData: { projectName: data.projectName, projectCode, projectLink },
      },
      teams: {
        payload: { projectName: data.projectName, projectCode, url: projectLink },
      },
    })
  }

  await dispatchNotification({
    eventType: 'new_project',
    triggeredBy: currentUser.id,
    dedup: { scope: `project:${newProject.id}` },
    recipients,
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/wallets')
  invalidateProjectCaches(newProject.id)
  return newProject
})

// ============================================================================
// UPDATE
// ============================================================================

export const updateProject = wrapServerAction('updateProject', async function updateProject(
  projectId: number,
  data: {
    projectName?: string
    description?: string
    startDate?: string | null
    status?: ProjectStatus
  },
) {
  const currentUser = await getCurrentUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can update projects')
  }

  const [p] = await db
    .select()
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  if (!p) throw new Error('Project not found')

  const updateData: Record<string, unknown> = { updatedAt: new Date() }

  if (data.projectName !== undefined) {
    const nameErr = validateField(data.projectName, VALIDATION.PROJECT_NAME_MAX_LENGTH, 'Project name')
    if (nameErr) throw new Error(nameErr)
    updateData.projectName = data.projectName
  }
  if (data.description !== undefined) {
    if (data.description !== null) {
      const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
      if (descErr) throw new Error(descErr)
    }
    updateData.description = data.description
  }
  if (data.startDate !== undefined) updateData.startDate = data.startDate
  if (data.status !== undefined) updateData.status = data.status

  const [updated] = await db
    .update(project)
    .set(updateData)
    .where(eq(project.id, projectId))
    .returning()

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/projects/${projectId}`)
  invalidateProjectCaches(projectId)

  return { ...updated, status: updated.status as ProjectStatus }
})

export const updateProjectStatus = wrapServerAction('updateProjectStatus', async function updateProjectStatus(projectId: number, newStatus: ProjectStatus) {
  const currentUser = await getCurrentUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can update project status')
  }

  const [p] = await db
    .select()
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  if (!p) throw new Error('Project not found')

  const [updated] = await db
    .update(project)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(project.id, projectId))
    .returning()

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/projects/${projectId}`)
  invalidateProjectCaches(projectId)

  return { ...updated, status: updated.status as ProjectStatus }
})

export const archiveProject = wrapServerAction('archiveProject', async function archiveProject(projectId: number) {
  const currentUser = await getCurrentUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can archive projects')
  }

  const [p] = await db
    .select()
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  if (!p) throw new Error('Project not found')

  const [updated] = await db
    .update(project)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(project.id, projectId))
    .returning()

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/projects/${projectId}`)
  invalidateProjectCaches(projectId)

  return { ...updated, status: updated.status as ProjectStatus }
})

export const deleteProject = wrapServerAction('deleteProject', async function deleteProject(projectId: number) {
  const currentUser = await getCurrentUser()

  if (currentUser.role !== 'admin') {
    throw new Error('Only admins can delete projects')
  }

  const [p] = await db
    .select()
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  if (!p) throw new Error('Project not found')

  try {
    await db.delete(project).where(eq(project.id, projectId))
  } catch (err) {
    console.error('[deleteProject] Database error:', err)
    throw new Error(
      `Failed to delete project "${p.projectName}". It may have related modules or tickets. ` +
      'Delete or reassign them first.',
    )
  }

  revalidatePath('/dashboard')
  invalidateProjectCaches(projectId)
})
