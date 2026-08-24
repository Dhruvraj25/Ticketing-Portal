import { getCurrentUser } from '@/app/actions/tickets'
import { NotificationsClient } from './notifications-client'
import { PageTimer } from '@/lib/performance-profiler'

export default async function NotificationsPage() {
  const pageTimer = new PageTimer('Notifications Page')
  pageTimer.mark('Authentication & Data Fetching')
  const user = await getCurrentUser()

  pageTimer.finish()
  return (
    <NotificationsClient user={user} />
  )
}
