import { PageTimer } from '@/lib/performance-profiler'
import { getCurrentUser, getEmployeeProductivity, getDeveloperAnalytics, getWorklogSummary } from '@/app/actions/tickets'
import { redirect } from 'next/navigation'
import { ResourcesClient } from './resources-client'
import type { UserRole } from '@/lib/types'

export default async function ProductivityPage() {
  const pageTimer = new PageTimer('Resources Page')
  pageTimer.mark('Authentication')
  const user = await getCurrentUser()

  if (user.role === 'developer') {
    const [analytics, worklog] = await Promise.all([
      getDeveloperAnalytics(7),
      getWorklogSummary(7),
    ])

  pageTimer.mark('Data Fetching & Render')
  pageTimer.finish()

    return (
      <ResourcesClient
        role={user.role}
        developerAnalytics={analytics}
        worklog={worklog}
      />
    )
  }

  if (user.role !== 'project_manager' && user.role !== 'admin') {
    redirect('/dashboard')
  }

  // Initial fetch matches the client's default 7D period so the highlighted
  // button always corresponds to the data shown on first load.
  const rangeStart = new Date()
  rangeStart.setDate(rangeStart.getDate() - 7)
  const productivityData = await getEmployeeProductivity({ startDate: rangeStart, endDate: new Date() })

  pageTimer.mark('Render')
  pageTimer.finish()

  return (
    <ResourcesClient
      role={user.role}
      productivityData={productivityData}
    />
  )
}
