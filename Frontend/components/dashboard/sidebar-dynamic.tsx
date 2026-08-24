'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import type { UserRole } from '@/lib/types'
import { ErrorBoundary } from '@/components/ui/error-boundary'

const Sidebar = dynamic(
  () => import('@/components/dashboard/sidebar').then(
    (mod) => {
      if (!mod.DashboardSidebar) {
        throw new Error(
          'Sidebar not found. Exports: ' + Object.keys(mod).join(', ')
        )
      }
      return mod.DashboardSidebar
    },
  ),
  { ssr: false },
)

interface SidebarDynamicProps {
  userRole: UserRole
  userName: string
  userEmail: string
  userAvatarUrl?: string | null
}

export function SidebarDynamic({ userRole, userName, userEmail, userAvatarUrl }: SidebarDynamicProps) {
  return (
    <ErrorBoundary fallback={
      <div className="shrink-0 flex items-center justify-center" style={{ width: 280, minHeight: 100 }}>
        <p className="text-xs text-muted-foreground">Sidebar unavailable</p>
      </div>
    }>
      <Suspense fallback={<div className="shrink-0" style={{ width: 280 }} aria-hidden="true" />}>
        <Sidebar
          userRole={userRole}
          userName={userName}
          userEmail={userEmail}
          userAvatarUrl={userAvatarUrl}
        />
      </Suspense>
    </ErrorBoundary>
  )
}
