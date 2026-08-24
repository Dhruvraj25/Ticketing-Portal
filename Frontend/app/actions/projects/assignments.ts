'use server'

import { db } from '@/lib/db'
import { project, user, projectDeveloper, projectClient } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { wrapServerAction } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'

// ============================================================================
// PROJECT ASSIGNMENT
// ============================================================================

export const assignClient = wrapServerAction('assignClient', async function assignClient(projectId: number, clientId: string) {
  const currentUser = await getCurrentUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can assign clients')
  }

  const [p] = await db
    .select()
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  if (!p) throw new Error('Project not found')

  const now = new Date()

  // Update the project's primary client
  const [updated] = await db
    .update(project)
    .set({ clientId, updatedAt: now })
    .where(eq(project.id, projectId))
    .returning()

  // Also insert/update the project_client junction table so this client
  // can see the project in their dashboard and create ticket page.
  await db
    .insert(projectClient)
    .values({
      projectId,
      userId: clientId,
      assignedBy: currentUser.id,
      assignedAt: now,
    })
    .onConflictDoNothing({ target: [projectClient.projectId, projectClient.userId] })

  revalidatePath(`/dashboard/projects/${projectId}`)
  return updated
})

export const assignManager = wrapServerAction('assignManager', async function assignManager(projectId: number, managerId: string) {
  const currentUser = await getCurrentUser()

  if (currentUser.role !== 'admin') {
    throw new Error('Only admins can assign project managers')
  }

  const [p] = await db
    .select()
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  if (!p) throw new Error('Project not found')

  const [updated] = await db
    .update(project)
    .set({ managerId, updatedAt: new Date() })
    .where(eq(project.id, projectId))
    .returning()

  revalidatePath(`/dashboard/projects/${projectId}`)
  return updated
})

export const assignDeveloper = wrapServerAction('assignDeveloper', async function assignDeveloper(projectId: number, developerId: string) {
  const currentUser = await getCurrentUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can assign developers')
  }

  const [p] = await db
    .select()
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  if (!p) throw new Error('Project not found')

  const [existing] = await db
    .select()
    .from(projectDeveloper)
    .where(and(eq(projectDeveloper.projectId, projectId), eq(projectDeveloper.userId, developerId)))
    .limit(1)

  if (existing) {
    return { message: 'Developer is already assigned to this project' }
  }

  const [assignment] = await db
    .insert(projectDeveloper)
    .values({ projectId, userId: developerId })
    .returning()

  revalidatePath(`/dashboard/projects/${projectId}`)
  return assignment
})

export const removeDeveloper = wrapServerAction('removeDeveloper', async function removeDeveloper(projectId: number, developerId: string) {
  const currentUser = await getCurrentUser()

  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Only project managers and admins can remove developers')
  }

  await db
    .delete(projectDeveloper)
    .where(and(eq(projectDeveloper.projectId, projectId), eq(projectDeveloper.userId, developerId)))
  revalidatePath(`/dashboard/projects/${projectId}`)
})

export const getProjectDevelopers = wrapServerAction('getProjectDevelopers', async function getProjectDevelopers(projectId: number) {
  const currentUser = await getCurrentUser()

  if (currentUser.role === 'client') {
    throw new Error('Access denied')
  }

  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
    })
    .from(projectDeveloper)
    .innerJoin(user, eq(projectDeveloper.userId, user.id))
    .where(eq(projectDeveloper.projectId, projectId))
})
