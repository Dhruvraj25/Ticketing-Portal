import { getCurrentUser } from '@/app/actions/tickets'
import { getModules } from '@/app/actions/modules'
import { getProjectNames } from '@/app/actions/projects'
import { redirect } from 'next/navigation'
import { ModulesPageClient } from './modules-page-client'
import { mark, summary } from '@/lib/request-timing'
import { PageTimer } from '@/lib/performance-profiler'
import { moduleBatchFilters } from '@/lib/module-list-batches'

export const dynamic = 'force-dynamic'

export default async function ModulesPage() {
  const pageTimer = new PageTimer('Modules Page')
  mark('Modules - getCurrentUser')
  const user = await getCurrentUser()

  if (user.role !== 'project_manager' && user.role !== 'admin') {
    redirect('/dashboard')
  }

  // Only the FIRST batch (20) is fetched for the first paint — further batches
  // load as the user scrolls (infinite scroll). Projects feed the filter.
  mark('Modules - first batch')
  const [projects, initialPage] = await Promise.all([
    getProjectNames(),
    getModules(moduleBatchFilters({ sortBy: 'created', page: 1 })),
  ])

  mark('Modules - Render')
  pageTimer.finish()
  summary('Modules Page')

  return <ModulesPageClient user={user} projects={projects} initialPage={initialPage} />
}
