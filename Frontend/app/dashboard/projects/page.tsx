import { getCurrentUser } from '@/app/actions/tickets'
import { getProjects } from '@/app/actions/projects'
import { ProjectsPageClient } from './projects-page-client'
import { mark, summary } from '@/lib/request-timing'
import { PageTimer } from '@/lib/performance-profiler'
import type { UserRole } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const pageTimer = new PageTimer('Projects Page')
  mark('Projects - Parallel Data Fetching')
  const [user, projects] = await Promise.all([
    getCurrentUser(),
    getProjects(),
  ])
  const isManagerOrAdmin = user.role === 'project_manager' || user.role === 'admin'
  mark('Projects - Render')
  pageTimer.finish()
  summary('Projects Page')

  return <ProjectsPageClient user={user} projects={projects} isManagerOrAdmin={isManagerOrAdmin} />
}
