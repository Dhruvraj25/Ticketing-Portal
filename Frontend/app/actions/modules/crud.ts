'use server'

import { db } from '@/lib/db'
import { module as moduleTable, project } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import { VALIDATION, validateField } from '@/lib/types'
import type { ModuleStatus } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Cache tags for targeted invalidation — avoids broad revalidatePath('/dashboard').
 */
const MODULE_TAGS = {
  project: (projectId: number) => `module-project-${projectId}`,
  list: 'module-list',
} as const

async function requireModuleManager(currentUser?: Awaited<ReturnType<typeof getCurrentUser>>) {
  const user = currentUser ?? await getCurrentUser()
  if (user.role !== 'project_manager' && user.role !== 'admin') {
    throw new Error('Only project managers and admins can modify modules')
  }
  return user
}

async function findModuleOrThrow(moduleId: number) {
  const [m] = await db
    .select()
    .from(moduleTable)
    .where(eq(moduleTable.id, moduleId))
    .limit(1)
  if (!m) throw new Error('Module not found')
  return m
}

/**
 * Invalidate all module- and analytics-related caches — no broad dashboard refresh.
 * Phase 5: Added invalidation for the new unstable_cache tags so cached project
 * detail pages, module listings, and module ticket stats are refreshed immediately
 * on any module mutation.
 */
function invalidateModuleCache(projectId: number) {
  revalidateTag(MODULE_TAGS.project(projectId), { expire: 60 })
  revalidateTag(MODULE_TAGS.list, { expire: 60 })
  // Phase 5 cache tags — invalidated together since all module mutations
  // affect the module list, ticket stats, and project analytics views.
  revalidateTag('modules-by-project-ids', { expire: 60 })
  revalidateTag('module-ticket-stats', { expire: 60 })
  revalidateTag('module-analytics', { expire: 60 })
  revalidateTag('project-analytics', { expire: 60 })
  revalidateTag('project-by-id', { expire: 60 })
}

// ============================================================================
// CREATE
// ============================================================================

export const createModule = wrapServerAction('createModule', async function createModule(data: {
  projectId: number
  moduleName: string
  description?: string
}) {
  const user = await requireModuleManager()

  // Validation
  const nameErr = validateField(data.moduleName, VALIDATION.MODULE_NAME_MAX_LENGTH, 'Module name')
  if (nameErr) throw new Error(nameErr)
  if (data.description) {
    const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
    if (descErr) throw new Error(descErr)
  }

  // Verify the project exists
  const [p] = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.id, data.projectId))
    .limit(1)

  if (!p) throw new Error('Project not found')

  const [newModule] = await db
    .insert(moduleTable)
    .values({
      projectId: data.projectId,
      moduleName: data.moduleName,
      description: data.description ?? null,
      status: 'active',
    })
    .returning()

  // Targeted cache invalidation — no broad revalidatePath('/dashboard')
  invalidateModuleCache(data.projectId)
  return newModule
})

// ============================================================================
// UPDATE
// ============================================================================

export const updateModule = wrapServerAction('updateModule', async function updateModule(
  moduleId: number,
  data: {
    moduleName?: string
    description?: string | null
    status?: ModuleStatus
  },
) {
  const user = await requireModuleManager()

  const m = await findModuleOrThrow(moduleId)

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (data.moduleName !== undefined) {
    const nameErr = validateField(data.moduleName, VALIDATION.MODULE_NAME_MAX_LENGTH, 'Module name')
    if (nameErr) throw new Error(nameErr)
    updateData.moduleName = data.moduleName
  }
  if (data.description !== undefined) {
    if (data.description !== null) {
      const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
      if (descErr) throw new Error(descErr)
    }
    updateData.description = data.description
  }
  if (data.status !== undefined) updateData.status = data.status

  const [updated] = await db
    .update(moduleTable)
    .set(updateData)
    .where(eq(moduleTable.id, moduleId))
    .returning()

  // Targeted invalidation — only the affected project's modules
  invalidateModuleCache(m.projectId)

  return {
    ...updated,
    status: updated.status as ModuleStatus,
  }
})

export const updateModuleStatus = wrapServerAction('updateModuleStatus', async function updateModuleStatus(moduleId: number, newStatus: ModuleStatus) {
  const user = await requireModuleManager()

  const m = await findModuleOrThrow(moduleId)

  const [updated] = await db
    .update(moduleTable)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(moduleTable.id, moduleId))
    .returning()

  // Targeted invalidation
  invalidateModuleCache(m.projectId)

  return {
    ...updated,
    status: updated.status as ModuleStatus,
  }
})

export const archiveModule = wrapServerAction('archiveModule', async function archiveModule(moduleId: number) {
  const user = await requireModuleManager()

  const m = await findModuleOrThrow(moduleId)

  const [updated] = await db
    .update(moduleTable)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(moduleTable.id, moduleId))
    .returning()

  // Targeted invalidation
  invalidateModuleCache(m.projectId)

  return {
    ...updated,
    status: updated.status as ModuleStatus,
  }
})

export const deleteModule = wrapServerAction('deleteModule', async function deleteModule(moduleId: number) {
  const user = await requireModuleManager()

  const m = await findModuleOrThrow(moduleId)

  try {
    await db.delete(moduleTable).where(eq(moduleTable.id, moduleId))
  } catch (err) {
    console.error('[deleteModule] Database error:', err)
    throw new Error(
      `Failed to delete module "${m.moduleName}". It may have related tickets. ` +
      'Reassign them to a different module first.'
    )
  }

  // Targeted invalidation
  invalidateModuleCache(m.projectId)
})
