import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/auth-utils'
import { CustomerOnboardingWizard } from '@/components/dashboard/customer-onboarding-wizard'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { UserPlus } from 'lucide-react'

export default async function CustomerOnboardingPage() {
  const currentUser = await getCurrentUser()

  // Role check
  if (currentUser.role !== 'admin' && currentUser.role !== 'project_manager') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <h2 className="text-lg font-semibold text-destructive">Access Denied</h2>
          <p className="text-sm text-muted-foreground">
            Only admins and project managers can access the customer onboarding wizard.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5" data-tour="customer-onboarding">
        <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
   
      <PageHeader
          title="Customer Onboarding"
          subtitle="Streamlined wizard to onboard new customers — create projects, modules, users, and support wallets in one flow"
          icon={<UserPlus className="h-5 w-5" />}
          iconVariant="green"
        />
        </div>

      <div className="space-y-5">
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center space-y-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                <p className="text-sm text-muted-foreground">Loading onboarding wizard...</p>
              </div>
              
            </div>
          }
        >
          <CustomerOnboardingWizard
            currentUserRole={currentUser.role}
            currentUserId={currentUser.id}
          />
        </Suspense>
        </div>
      </div>
    </div>
  )
}
