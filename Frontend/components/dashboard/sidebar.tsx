'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { resolveActiveNav, isRouteActive } from '@/lib/navigation'
import { useTheme } from '@/components/theme-provider'
import { useBranding } from '@/components/dashboard/branding-provider'
import { useSidebar } from '@/components/dashboard/sidebar-provider'
import { signOutAndRedirect } from '@/lib/client-sign-out'
import {
  Ticket,
  LayoutDashboard,
  Plus,
  Clock,
  Settings,
  ChevronDown,
  LogOut,
  User,
  FolderKanban,
  Layers,
  BarChart2,
  FileText,
  CheckSquare,
  Activity,
  Bell,
  ClipboardList,
  TrendingUp,
  ListChecks,
  UserCog,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  Wallet,
  UserPlus,
  MessageSquare,
  CircleHelp,
} from 'lucide-react'
import type { UserRole } from '@/lib/types'
import { USER_ROLE_CONFIG } from '@/lib/types'
import { NotificationCenter } from '@/components/dashboard/notification-center'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  badge?: string
  /** When false, the item only highlights on its exact href, not child routes. */
  matchDescendants?: boolean
}

/** Maps a nav href to the data-tour attribute used by the product tour. */
const NAV_TOUR_ATTR: Record<string, string> = {
  '/dashboard': 'nav-dashboard',
  '/dashboard/customer-onboarding': 'nav-customer-onboarding',
  '/dashboard/projects': 'nav-projects',
  '/dashboard/modules': 'nav-modules',
  '/dashboard/tickets': 'nav-tickets',
  '/dashboard/tickets/new': 'nav-new-ticket',
  '/dashboard/assignments': 'nav-assignments',
  '/dashboard/review-queue': 'nav-review-queue',
  '/dashboard/team': 'nav-team',
  '/dashboard/time-tracking': 'nav-time-tracking',
  '/dashboard/resources': 'nav-resources',
  '/dashboard/worklogs': 'nav-worklogs',
  '/dashboard/wallets': 'nav-wallets',
  '/dashboard/support-wallet': 'nav-support-wallet',
  '/dashboard/analytics': 'nav-analytics',
  '/dashboard/reports/view': 'nav-reports',
  '/dashboard/reports/customer-reviews': 'nav-customer-reviews',
  '/dashboard/reviews': 'nav-reviews',
  '/dashboard/notifications': 'nav-notifications',
  '/dashboard/admin/users': 'nav-users',
  '/dashboard/admin/teams': 'nav-teams',
  '/dashboard/admin': 'nav-settings',
  '/dashboard/profile': 'nav-profile',
  '/dashboard/help': 'nav-help',
}

const adminNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard /> },
  { href: '/dashboard/customer-onboarding', label: 'Customer Onboarding', icon: <UserPlus /> },
  { href: '/dashboard/projects', label: 'Projects', icon: <FolderKanban /> },
  { href: '/dashboard/modules', label: 'Modules', icon: <Layers /> },
  { href: '/dashboard/tickets', label: 'Tickets', icon: <Ticket /> },
  { href: '/dashboard/worklogs', label: 'Worklogs', icon: <ClipboardList /> },
  { href: '/dashboard/wallets', label: 'Support Wallets', icon: <Wallet /> },
  { href: '/dashboard/analytics', label: 'Analytics', icon: <BarChart2 /> },
  { href: '/dashboard/reports/view', label: 'Report Center', icon: <FileText /> },
  { href: '/dashboard/reports/customer-reviews', label: 'Customer Reviews', icon: <CheckSquare /> },
  { href: '/dashboard/reviews', label: 'Reviews', icon: <CheckSquare /> },
  { href: '/dashboard/notifications', label: 'Notifications', icon: <Bell /> },
  { href: '/dashboard/admin/users', label: 'Users', icon: <UserCog /> },
  { href: '/dashboard/admin/teams', label: 'Teams', icon: <MessageSquare /> },
  { href: '/dashboard/admin', label: 'Settings', icon: <Settings />, matchDescendants: false },
  { href: '/dashboard/help', label: 'Help & Support', icon: <CircleHelp /> },
]

const managerNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard /> },
  { href: '/dashboard/customer-onboarding', label: 'Customer Onboarding', icon: <UserPlus /> },
  { href: '/dashboard/projects', label: 'Projects', icon: <FolderKanban /> },
  { href: '/dashboard/modules', label: 'Modules', icon: <Layers /> },
  { href: '/dashboard/tickets', label: 'Tickets', icon: <Ticket /> },
  { href: '/dashboard/assignments', label: 'Assignments', icon: <ListChecks /> },
  { href: '/dashboard/review-queue', label: 'Review Queue', icon: <CheckSquare /> },
  { href: '/dashboard/team', label: 'Team', icon: <Activity /> },
  { href: '/dashboard/wallets', label: 'Support Wallets', icon: <Wallet /> },
  { href: '/dashboard/reports/view', label: 'Report Center', icon: <FileText /> },
  { href: '/dashboard/reports/customer-reviews', label: 'Customer Reviews', icon: <CheckSquare /> },
  { href: '/dashboard/reviews', label: 'Reviews', icon: <CheckSquare /> },
  { href: '/dashboard/notifications', label: 'Notifications', icon: <Bell /> },
  { href: '/dashboard/help', label: 'Help & Support', icon: <CircleHelp /> },
]

const developerNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard /> },
  { href: '/dashboard/tickets', label: 'My Tickets', icon: <Ticket /> },
  { href: '/dashboard/time-tracking', label: 'Time Tracking', icon: <Clock /> },
  { href: '/dashboard/notifications', label: 'Notifications', icon: <Bell /> },
  { href: '/dashboard/resources', label: 'Resource Dashboard', icon: <TrendingUp /> },
  { href: '/dashboard/profile', label: 'Profile', icon: <User /> },
  { href: '/dashboard/help', label: 'Help & Support', icon: <CircleHelp /> },
]

const clientNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard /> },
  { href: '/dashboard/projects', label: 'My Projects', icon: <FolderKanban /> },
  { href: '/dashboard/tickets/new', label: 'Create Ticket', icon: <Plus /> },
  { href: '/dashboard/tickets', label: 'My Tickets', icon: <Ticket /> },
  { href: '/dashboard/support-wallet', label: 'Support Wallet', icon: <Wallet /> },
  { href: '/dashboard/notifications', label: 'Notifications', icon: <Bell /> },
  { href: '/dashboard/profile', label: 'Profile', icon: <User /> },
  { href: '/dashboard/help', label: 'Help & Support', icon: <CircleHelp /> },
]

const navItemsByRole: Record<UserRole, NavItem[]> = {
  admin: adminNavItems,
  project_manager: managerNavItems,
  developer: developerNavItems,
  client: clientNavItems,
}

interface DashboardSidebarProps {
  userRole: UserRole
  userName: string
  userEmail: string
  userAvatarUrl?: string | null
}

export function DashboardSidebar({ userRole, userName, userEmail, userAvatarUrl }: DashboardSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { branding } = useBranding()
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useSidebar()
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const isDark = theme === 'dark'
  const navItems = navItemsByRole[userRole] ?? []
  const isClientRole = userRole === 'client'

  // Single-winner active state: resolve the highlight against the full nav
  // list so the most specific route wins — a dedicated child item (e.g.
  // "Create Ticket" at /dashboard/tickets/new) is highlighted over its parent
  // module, while unknown dynamic routes (e.g. /dashboard/tickets/42) fall
  // back to the parent module ("My Tickets").
  const activeHrefs = resolveActiveNav(pathname, navItems)

  const brandTile = branding.logoUrl ? (
    <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm shrink-0">
      <Image src={branding.logoUrl} alt={branding.companyName} width={36} height={36} className="w-9 h-9 object-contain" />
    </div>
  ) : (
    <div
      className={cn(
        'w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-sm transition-transform group-hover:scale-105 font-mono text-base shrink-0',
        isDark ? 'bg-emerald-500 text-slate-950' : 'bg-slate-950'
      )}
    >
      {isClientRole ? 'N' : 'S'}
    </div>
  )

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden animate-fadeIn"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-screen z-50 flex flex-col border-r transition-all duration-300 font-inter',
          isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-[#f4f7f9] border-slate-200 text-slate-900',
          collapsed ? 'w-20 max-lg:w-64 p-3 max-lg:p-4' : 'w-64 p-4',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between mb-6 px-1">
          <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 cursor-pointer group">
            {brandTile}
            {!collapsed && (
              <span className="font-bold text-lg leading-none tracking-tight flex items-center gap-1">
                {branding.companyName || (isClientRole ? 'Nirka' : 'Support Hero')}
              </span>
            )}
          </Link>
          <button
            onClick={toggleCollapsed}
            className={cn(
              'hidden lg:flex p-1.5 rounded-lg transition-colors border',
              isDark ? 'hover:bg-slate-800 border-slate-800 text-slate-400' : 'hover:bg-slate-200 border-slate-200 text-slate-600'
            )}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
          {navItems.map((item) => {
            const active = activeHrefs.includes(item.href)
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link href={item.href} onClick={() => setMobileOpen(false)}>
                    <div
                      data-tour={NAV_TOUR_ATTR[item.href]}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 cursor-pointer [&_svg]:h-[18px] [&_svg]:w-[18px]',
                        active
                          ? isDark
                            ? 'bg-slate-800 text-slate-100 font-semibold shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-800 shadow-xs font-semibold'
                          : isDark
                          ? 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 hover:text-slate-900 dark:hover:text-slate-100',
                        collapsed ? 'justify-center px-0' : ''
                      )}
                    >
                      <span className={cn('shrink-0', active ? (isDark ? 'text-emerald-400' : 'text-slate-900') : 'text-slate-400')}>
                        {item.icon}
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.badge !== undefined && (
                        <span className="ml-auto bg-amber-500 text-white text-[11px] px-1.5 py-0.5 rounded-full font-bold">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </Link>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" className="font-inter">
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            )
          })}
        </nav>

        {/* Bottom Footer Actions */}
        <div className={cn('pt-4 border-t space-y-1', isDark ? 'border-slate-800' : 'border-slate-200')}>
          {/* Dark Mode Toggle */}
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors',
              isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-700',
              collapsed ? 'justify-center' : ''
            )}
            title="Toggle color theme"
          >
            {isDark ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-slate-600" />}
            {!collapsed && <span>Dark Mode</span>}
          </button>

          {/* Notifications */}
          <div
            data-tour="nav-notifications-row"
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors',
              isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-700',
              collapsed ? 'justify-center' : ''
            )}
          >
            <NotificationCenter collapsed={collapsed} />
            {!collapsed && (
              <Link
                href="/dashboard/notifications"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'text-xs font-medium transition-colors',
                  isRouteActive(pathname, '/dashboard/notifications')
                    ? isDark ? 'text-slate-100' : 'text-slate-900'
                    : isDark ? 'text-slate-300' : 'text-slate-700'
                )}
              >
                Notifications
              </Link>
            )}
          </div>

          {/* User Profile Card */}
          <div className={cn('mt-3 p-2.5 rounded-2xl border transition-all relative', isDark ? 'bg-slate-800/60 border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200/80 hover:border-slate-300')}>
            <div className="flex items-center gap-3">
              <div
                onClick={() => {
                  setUserMenuOpen(false)
                  setMobileOpen(false)
                  router.push('/dashboard/profile')
                }}
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-sm font-mono cursor-pointer overflow-hidden',
                  isDark ? 'bg-emerald-500 text-slate-950' : 'bg-slate-950 text-white'
                )}
              >
                {userAvatarUrl ? (
                  <Image src={userAvatarUrl} alt={userName} width={36} height={36} className="w-full h-full object-cover" />
                ) : (
                  userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
                )}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate text-slate-900 dark:text-slate-100">{userName}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-0.5">
                    <span className="truncate">{USER_ROLE_CONFIG[userRole]?.label || userRole}</span>
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
                      aria-label="User menu"
                    >
                      <ChevronDown size={14} className="text-slate-400" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User Dropdown */}
            <AnimatePresence>
              {userMenuOpen && !collapsed && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    'absolute bottom-full left-0 right-0 mb-2 rounded-2xl border shadow-xl p-2 text-xs z-50',
                    isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
                  )}
                >
                  <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="font-bold truncate">{userName}</p>
                    <p className="text-[11px] text-slate-400 truncate">{userEmail}</p>
                  </div>
                  <div className="py-1 space-y-0.5">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false)
                        setMobileOpen(false)
                        router.push('/dashboard/profile')
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <User size={14} className="text-emerald-500 dark:text-emerald-400" />
                      <span>My Profile</span>
                    </button>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false)
                        signOutAndRedirect()
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/100/10 text-rose-500 dark:text-rose-400 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <LogOut size={14} />
                      <span>Sign out</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </aside>

      {/* Desktop spacer — pushes content, hidden on mobile (drawer overlays) */}
      <div
        className={cn('hidden lg:block shrink-0 transition-all duration-300', collapsed ? 'w-20' : 'w-64')}
        aria-hidden="true"
      />
    </>
  )
}
