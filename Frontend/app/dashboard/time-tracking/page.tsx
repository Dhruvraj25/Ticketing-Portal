import { PageTimer } from '@/lib/performance-profiler'
import { getCurrentUser, getTickets, getActiveTimer, getTimeLogsBatch, getWorklogSummary } from '@/app/actions/tickets'
import { redirect } from 'next/navigation'
import { TimeTrackingClient } from './time-tracking-client'
import type { TicketWithRelations } from '@/lib/types'

export default async function TimeTrackingPage() {
  const pageTimer = new PageTimer('Time Tracking Page')
  pageTimer.mark('Authentication')
  const user = await getCurrentUser()

  if (user.role !== 'developer') {
    redirect('/dashboard')
  }

  const [ticketsData, activeTimer, worklogData] = await Promise.all([
    getTickets() as Promise<TicketWithRelations[]>,
    getActiveTimer(),
    getWorklogSummary(30),
  ])

  const tickets = ticketsData

  // Batch-fetch all time logs in a single query instead of N+1 per ticket
  const ticketIds = tickets.map((t) => t.id)
  const timeLogsMap = ticketIds.length > 0 ? await getTimeLogsBatch(ticketIds) : new Map<number, any[]>()

  const allTimeLogs = tickets.map((t) => ({
    ticketId: t.id,
    ticketNumber: t.ticketNumber,
    ticketTitle: t.title,
    projectName: t.projectName,
    projectCode: t.projectCode,
    moduleName: t.moduleName,
    logs: timeLogsMap.get(t.id) || [],
  }))

  pageTimer.mark('Data Fetching & Render')
  pageTimer.finish()

  return (
    <TimeTrackingClient
      tickets={tickets}
      activeTimer={activeTimer}
      allTimeLogs={allTimeLogs}
      worklogData={worklogData}
    />
  )
}
