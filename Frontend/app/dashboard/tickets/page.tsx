import { getCurrentUser, getTicketsList, getConsolidatedDashboardData } from '@/app/actions/tickets'
import { getDevelopers } from '@/app/actions/users'
import { getProjectNames } from '@/app/actions/projects'
import { TicketsPageClient } from './tickets-page-client'

const TICKETS_PER_PAGE = 25

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; q?: string; projectId?: string; moduleId?: string; view?: string; page?: string }>
}) {
  const params = await searchParams
  const currentPage = Math.max(1, parseInt(params.page || '1', 10) || 1)
  
  // OPTIMIZED: Kick off role-independent queries immediately in parallel.
  // getCurrentUser() starts with the others. Once we have the user's role,
  // we conditionally fetch developers (manager/admin only) in parallel
  // with awaiting the remaining query results.
  //
  // Before: Promise.all(4 queries) → sequential getDevelopers()
  // After:  getCurrentUser() + independent queries in parallel,
  //         then conditional getDevelopers() in parallel with remaining results.
  
  const userPromise = getCurrentUser()
  const ticketPromise = getTicketsList({
    search: params.q,
    status: params.status,
    priority: params.priority,
    projectId: params.projectId ? parseInt(params.projectId) : undefined,
    moduleId: params.moduleId ? parseInt(params.moduleId) : undefined,
    page: currentPage,
    limit: TICKETS_PER_PAGE,
  })

  const projectsPromise = getProjectNames().catch(() => [] as { id: number; projectName: string; projectCode: string }[])
  const dashboardPromise = getConsolidatedDashboardData()

  // Get user first to determine role — this already started in parallel
  // with tickets, projects, and dashboard queries via the promises above.
  const user = await userPromise
  const isManagerOrAdmin = user.role === 'project_manager' || user.role === 'admin'

  // Fetch developers (conditional) in parallel with remaining results
  const [ticketResult, projectsResult, dashboardData, developers] = await Promise.all([
    ticketPromise,
    projectsPromise,
    dashboardPromise,
    isManagerOrAdmin
      ? getDevelopers().catch(() => [] as { id: string; name: string; email: string; activeTickets: number }[])
      : Promise.resolve([] as { id: string; name: string; email: string; activeTickets: number }[]),
  ])

  const roleTitle = {
    client: 'My Tickets',
    developer: 'Assigned Tickets',
    project_manager: 'All Tickets',
    admin: 'All Tickets',
  }[user.role]

  const { tickets, total, page, limit, totalPages } = ticketResult

  // Use accurate counts from getConsolidatedDashboardData across ALL tickets
  const { openTickets: openCount, inProgressTickets: inProgressCount, resolvedTickets: resolvedCount } = dashboardData
  const closedCount = dashboardData.totalTickets - openCount - inProgressCount - resolvedCount

  return (
    <TicketsPageClient
      user={user}
      tickets={tickets as any}
      stats={{
        openCount,
        inProgressCount,
        resolvedCount,
        closedCount,
        totalCount: total,
      }}
      roleTitle={roleTitle}
      projects={projectsResult}
      initialView={params.view as 'list' | 'grid' | undefined}
      developers={developers}
      pagination={{ page, totalPages, total, limit }}
    />
  )
}
