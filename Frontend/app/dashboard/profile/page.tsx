import { getCurrentUser } from '@/app/actions/tickets'
import { ProfileClient } from './profile-client'
import { PageTimer } from '@/lib/performance-profiler'

export default async function ProfilePage() {
  const pageTimer = new PageTimer('Profile Page')
  pageTimer.mark('Authentication')
  const user = await getCurrentUser()
  pageTimer.finish()
  return <ProfileClient user={user} />
}
