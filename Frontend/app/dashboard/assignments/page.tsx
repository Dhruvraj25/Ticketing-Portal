import { PageTimer } from '@/lib/performance-profiler'
import { getCurrentUser, getUnassignedTickets } from '@/app/actions/tickets'
import { getDevelopers } from '@/app/actions/users'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { AssignmentPanel } from '@/components/dashboard/assignment-panel'
import { ListChecks } from 'lucide-react'

export default async function AssignmentsPage() {
  const pageTimer = new PageTimer('Assignments Page')
  
  pageTimer.mark('Authentication')
  const user = await getCurrentUser()
  
  if (user.role !== 'project_manager' && user.role !== 'admin') {
    redirect('/dashboard')
  }

  pageTimer.mark('Data Fetching')
  const [unassignedTickets, developers] = await Promise.all([
    getUnassignedTickets(),
    getDevelopers(),
  ])

  pageTimer.mark('Render')
  pageTimer.finish()

  return (
    <div className="space-y-6" data-tour="assignments-panel">
      <div data-tour="assignments-header">
      <PageHeader
          title="Ticket Assignments"
          subtitle="Assign tickets to developers in your team"
          icon={<ListChecks className="h-5 w-5" />}
          iconVariant="orange"
        />
      </div>
        <AssignmentPanel unassignedTickets={unassignedTickets} developers={developers} />
    </div>
  )
}
