import { getCurrentUser } from '@/app/actions/tickets'
import { getResolvedTickets } from '@/app/actions/revisions'
import { getDevelopers } from '@/app/actions/users'
import { redirect } from 'next/navigation'
import { PageTimer } from '@/lib/performance-profiler'
import { ReviewQueueClient } from '@/components/dashboard/review-queue-client'
import { mark, summary } from '@/lib/request-timing'

export const dynamic = 'force-dynamic'

export default async function ReviewQueuePage() {
  // OPTIMIZED: Start role-independent queries in parallel with auth.
  // getResolvedTickets() and getDevelopers() are conditional on role,
  // so we get the user first, then fetch role-restricted data in parallel
  // with waiting for the other results.
  const userPromise = getCurrentUser()

  const user = await userPromise
  if (user.role !== 'project_manager' && user.role !== 'admin') {
    redirect('/dashboard')
  }

  const [resolvedTickets, developers] = await Promise.all([
    getResolvedTickets().catch(() => [] as any[]),
    getDevelopers().catch(() => [] as { id: string; name: string; email: string; activeTickets: number }[]),
  ])

  return <ReviewQueueClient resolvedTickets={resolvedTickets} developers={developers} />
}
