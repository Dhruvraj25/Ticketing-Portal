import { getCurrentUser } from '@/app/actions/tickets'
import { getModulesByProjectIds, getModulesTicketStats } from '@/app/actions/modules'
import { getProjectNames } from '@/app/actions/projects'
import { redirect } from 'next/navigation'
import { ModulesPageClient } from './modules-page-client'
import { mark, summary } from '@/lib/request-timing'
import { PageTimer } from '@/lib/performance-profiler'
import type { UserRole } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ModulesPage() {
  const pageTimer = new PageTimer('Modules Page')
  mark('Modules - getCurrentUser')
  const user = await getCurrentUser()

  if (user.role !== 'project_manager' && user.role !== 'admin') {
    redirect('/dashboard')
  }

  // Lightweight: only need project IDs/names for module lookup
  const projects = await getProjectNames()
  const projectIds = projects.map((p) => p.id)
  const allModules = projectIds.length > 0 ? await getModulesByProjectIds(projectIds) : []

  mark('Modules - getModulesTicketStats')
  const moduleIds = allModules.map((m) => m.id)
  const ticketStats = await getModulesTicketStats(moduleIds)
  const statsMap = new Map(ticketStats.map((s) => [s.moduleId, s]))

  mark('Modules - Render')
  pageTimer.finish()
  summary('Modules Page')

  return (
    <ModulesPageClient
      user={user}
      projects={projects}
      modules={allModules}
      statsMap={Object.fromEntries(statsMap)}
    />
  )
}
