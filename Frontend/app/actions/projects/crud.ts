'use server'

import { db } from '@/lib/db'
import { project, projectClient, user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import { VALIDATION, validateField } from '@/lib/types'
import { getPortalUrl } from '@/lib/urls'
import type { ProjectStatus } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'
import { dispatchNotification } from '@/lib/notify-all'
import { deriveProjectCodeBase, withUniqueProjectCode } from '@/lib/project-code'
import { buildCompanyDirectory, resolveCompany } from '@/lib/company-directory'

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

/** Client users (with their company fields) — the only source of company data. */
async function loadCompanyDirectoryUsers() {
  return db
    .select({
      id: user.id,
      role: user.role,
      companyName: user.companyName,
      companyCode: user.companyCode,
      userType: user.userType,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.role, 'client'))
}

export interface ProjectCompanyOption {
  key: string
  companyName: string
  companyCode: string | null
  clientCount: number
}

/**
 * New Project → Company dropdown: unique customer companies (from client
 * users' companyName/companyCode). Returns companies only — never individual
 * user names or emails.
 */
export const getProjectCompanies = wrapServerAction('getProjectCompanies', async function getProjectCompanies(): Promise<ProjectCompanyOption[]> {
  const currentUser = await getCurrentUser()
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }
  return buildCompanyDirectory(await loadCompanyDirectoryUsers()).map((c) => ({
    key: c.key,
    companyName: c.companyName,
    companyCode: c.companyCode,
    clientCount: c.clientUserIds.length,
  }))
})

export const createProject = wrapServerAction('createProject', async function createProject(data: {
  projectName: string
  /** Company identifier from getProjectCompanies — resolved again here (authoritative). */
  companyKey: string
  managerId: string
  description?: string
  startDate?: string
}) {
  const currentUser = await getCurrentUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can create projects')
  }

  if (!data.companyKey) {
    throw new Error('Please select a company')
  }

  if (!data.managerId) {
    throw new Error('A project manager must be selected')
  }

  // The project is created for EVERY client user of the selected company.
  // Resolved server-side from the database — never from a client-supplied
  // list of user ids. Only role='client' users belong to a company.
  const company = resolveCompany(await loadCompanyDirectoryUsers(), data.companyKey)
  if (!company) {
    throw new Error('The selected company was not found. Refresh the page and try again.')
  }
  if (company.clientUserIds.length === 0) {
    throw new Error('This company has no client users assigned.')
  }
  const clientId = company.representativeId

  const nameErr = validateField(data.projectName, VALIDATION.PROJECT_NAME_MAX_LENGTH, 'Project name')
  if (nameErr) throw new Error(nameErr)
  if (data.description) {
    const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
    if (descErr) throw new Error(descErr)
  }

  const projectCodeBase = deriveProjectCodeBase(data.projectName)

  // Project + ALL company client links in one transaction (no partial
  // relationships). Same model as Customer Onboarding: project.clientId is the
  // owner (the company's representative) and every client user — owner
  // included — gets a project_client row.
  const newProject = await withUniqueProjectCode(projectCodeBase, (projectCode) => db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(project)
      .values({
        projectName: data.projectName,
        projectCode,
        clientId,
        managerId: data.managerId,
        description: data.description ?? null,
        startDate: data.startDate ?? null,
        status: 'active',
      })
      .returning()
    const now = new Date()
    await tx.insert(projectClient).values(
      company.clientUserIds.map((userId) => ({
        projectId: inserted.id,
        userId,
        assignedBy: currentUser.id,
        assignedAt: now,
      })),
    )
    return inserted
  }))
  const projectCode = newProject.projectCode

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
  if (clientId) {
    recipients.push({
      userId: clientId,
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
    projectId: newProject.id,
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
