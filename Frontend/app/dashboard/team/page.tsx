import { PageTimer } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/app/actions/tickets'
import { getDevelopers } from '@/app/actions/users'
import { getProjects } from '@/app/actions/projects'
import { redirect } from 'next/navigation'
import { TeamClient } from '@/components/dashboard/team-client'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const pageTimer = new PageTimer('Team Page')
  pageTimer.mark('Authentication')
  const user = await getCurrentUser()

  if (user.role !== 'project_manager' && user.role !== 'admin') {
    redirect('/dashboard')
  }

  const developers = await getDevelopers()

  const devProjectsMap: Record<string, { id: number; projectName: string; projectCode: string }[]> = {}

  if (developers.length > 0) {
    const projects = await getProjects()
    for (const dev of developers) {
      const devProjects = projects.filter((p) =>
        p.clientId === dev.id || p.managerId === dev.id
      )
      if (devProjects.length > 0) {
        devProjectsMap[dev.id] = devProjects.map((p) => ({
          id: p.id, projectName: p.projectName, projectCode: p.projectCode,
        }))
      }
    }
  }

  pageTimer.mark('Data Fetching & Render')
  pageTimer.finish()

  return <TeamClient developers={developers} devProjectsMap={devProjectsMap} isAdmin={user.role === 'admin'} />
}
