import { getCurrentUser } from '@/app/actions/tickets'
import { HelpContent } from '@/components/dashboard/help/help-content'
import {
  gettingStartedSteps, clientGuide, managerGuide,
  resourceGuide, adminGuide, ticketLifecycleStages,
  statusGuides, priorityGuides, notificationEvents,
  supportHoursConcepts, faqItems, troubleshootingItems,
  contactInfo, releaseNotes, searchableItems,
} from '@/components/dashboard/help/help-data'

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>
}) {
  const user = await getCurrentUser()
  // Optional deep-link target — e.g. /dashboard/help?section=contact opens the
  // Contact Support section directly (used by the Help Hub menu).
  const { section } = await searchParams

  return (
    <HelpContent
      gettingStartedSteps={gettingStartedSteps}
      clientGuide={clientGuide}
      managerGuide={managerGuide}
      resourceGuide={resourceGuide}
      adminGuide={adminGuide}
      ticketLifecycleStages={ticketLifecycleStages}
      statusGuides={statusGuides}
      priorityGuides={priorityGuides}
      notificationEvents={notificationEvents}
      supportHoursConcepts={supportHoursConcepts}
      faqItems={faqItems}
      troubleshootingItems={troubleshootingItems}
      contactInfo={contactInfo}
      releaseNotes={releaseNotes}
      searchableItems={searchableItems}
      userRole={user.role}
      initialSection={section}
    />
  )
}