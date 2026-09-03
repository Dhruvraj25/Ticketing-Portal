import { Suspense } from 'react'
import { BrandingProvider } from '@/components/dashboard/branding-provider'
import { SidebarDynamic } from '@/components/dashboard/sidebar-dynamic'
import { SidebarProvider } from '@/components/dashboard/sidebar-provider'
import { TopHeader } from '@/components/dashboard/top-header'
import { BrandingFetcher } from '@/components/dashboard/branding-fetcher'
import { NotificationProvider } from '@/components/dashboard/notification-provider'
import { KeyboardShortcutsProvider } from '@/components/dashboard/keyboard-shortcuts-provider'
import { LoadingProvider } from '@/components/loading-provider'
import { TourProvider } from '@/components/tour/tour-provider'
import { TimezoneProvider } from '@/components/timezone-provider'
import { getCurrentUser } from '@/lib/auth-utils'
import { getNotifications } from '@/app/actions/notifications'
import type { UserRole } from '@/lib/types'
import type { NotificationResponse } from '@/components/dashboard/notification-provider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const layoutStart = performance.now()

  // ── PHASE 4: Fetch auth + notifications in parallel ─────────────
  // Notifications are cached (120s TTL) and the query is optimized
  // (2 parallel index-only scans, each <5ms on cache hit). By fetching
  // alongside auth and seeding the SWR provider, we eliminate the
  // duplicate client-side fetch on every page hydration.

  const [currentUser, notificationData] = await Promise.all([
    getCurrentUser(),
    getNotifications().catch(() => null),
  ])

  const layoutDataTime = Math.round(performance.now() - layoutStart)

  // Dev-only: log layout phase timing
  if (process.env.NODE_ENV !== 'production') {
    const flag = layoutDataTime > 1000 ? '🔴' : layoutDataTime > 500 ? '🟡' : layoutDataTime > 200 ? '🟠' : '  '
    console.log(`  ${flag} [LAYOUT] Auth + Notifications: ${layoutDataTime}ms`)
  }

  const totalLayoutTime = Math.round(performance.now() - layoutStart)
  if (process.env.NODE_ENV !== 'production') {
    const totalFlag = totalLayoutTime > 2000 ? '🔴' : totalLayoutTime > 1000 ? '🟡' : totalLayoutTime > 500 ? '🟠' : '  '
    console.log(`  ${totalFlag} [LAYOUT] Total render: ${totalLayoutTime}ms`)
  }

  return (
    <BrandingProvider initialBranding={null}>
      <LoadingProvider>
      {/* Background branding fetch — doesn't block layout rendering */}
      <Suspense fallback={null}>
        <BrandingFetcher />
      </Suspense>
      {/* Seeded with real notification data — eliminates initial SWR fetch */}
      <NotificationProvider initialData={notificationData as NotificationResponse | null}>
        <SidebarProvider>
          <TimezoneProvider timezone={currentUser!.timezone}>

          <TourProvider
            userId={currentUser!.id}
            userRole={currentUser!.role as UserRole}
            userName={currentUser!.name}
          >
            <KeyboardShortcutsProvider userRole={currentUser!.role as UserRole}>
            <div className="min-h-screen bg-[#F4F7F9] dark:bg-slate-950 flex">
              {/* Sidebar — dynamically loaded (no SSR) to eliminate hydration mismatches */}
              <SidebarDynamic
                userRole={currentUser!.role as UserRole}
                userName={currentUser!.name}
                userEmail={currentUser!.email ?? ''}
                userAvatarUrl={currentUser!.avatarUrl ?? null}
              />
              {/* Main content area */}
              <main className="flex-1 min-w-0 flex flex-col overflow-x-hidden">
                <TopHeader
                  userName={currentUser!.name}
                  userEmail={currentUser!.email ?? ''}
                  userAvatarUrl={currentUser!.avatarUrl ?? null}
                  userRole={currentUser!.role as UserRole}
                />
                <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-10 pt-4 lg:pt-6 pb-6 lg:pb-8">
                  {children}
                </div>
              </main>
            </div>
            </KeyboardShortcutsProvider>
          </TourProvider>
          </TimezoneProvider>
        </SidebarProvider>
      </NotificationProvider>
      </LoadingProvider>
    </BrandingProvider>
  )
}
