'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Search, User, LogOut, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/components/theme-provider'
import { useSidebar } from '@/components/dashboard/sidebar-provider'
import { HelpHub } from '@/components/dashboard/help-hub'
import { signOutAndRedirect } from '@/lib/client-sign-out'
import { USER_ROLE_CONFIG } from '@/lib/types'
import type { UserRole } from '@/lib/types'

interface TopHeaderProps {
  userName: string
  userEmail: string
  userAvatarUrl?: string | null
  userRole: UserRole
}

const NAV_SHORTCUTS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/tickets', label: 'Tickets' },
  { href: '/dashboard/analytics', label: 'Analytics' },
]

export function TopHeader({ userName, userEmail, userAvatarUrl, userRole }: TopHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme } = useTheme()
  const { setMobileOpen } = useSidebar()
  const [searchQuery, setSearchQuery] = useState('')
  const [showUserMenu, setShowUserMenu] = useState(false)

  const isDark = theme === 'dark'

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    setMobileOpen(false)
    if (q) {
      router.push(`/dashboard/tickets?q=${encodeURIComponent(q)}`)
    } else {
      router.push('/dashboard/tickets')
    }
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-40 h-16 border-b flex items-center justify-between gap-4 px-4 sm:px-6 transition-all duration-300',
        isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
      )}
    >
      {/* Left: mobile menu + search */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          onClick={() => setMobileOpen(true)}
          className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu size={18} />
        </button>

        <form onSubmit={handleSearchSubmit} className="relative w-full max-w-md" data-tour="top-search">
          <Search size={18} className={cn('absolute left-3 top-1/2 -translate-y-1/2', isDark ? 'text-slate-500' : 'text-slate-400')} />
          <input
            id="top-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets, customers, projects..."
            aria-label="Search tickets"
            className={cn(
              'w-full pl-9 pr-10 py-1.5 rounded-lg text-sm border outline-none transition-all',
              isDark
                ? 'bg-slate-800/80 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-emerald-500'
                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900'
            )}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-400 flex items-center gap-1"
            >
              <X size={13} />
            </button>
          )}
        </form>
      </div>

      {/* Right: shortcuts + help + user */}
      <div className="flex items-center gap-6">
        <nav className="hidden md:flex items-center gap-1">
          {NAV_SHORTCUTS.map((tab) => {
            const isActiveTab = pathname === tab.href
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  isActiveTab
                    ? isDark
                      ? 'text-emerald-400 font-bold bg-emerald-500/10'
                      : 'text-black dark:text-slate-100 font-bold border-b-2 border-black rounded-none'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>

        <div className={`flex items-center gap-3 border-l pl-5 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <HelpHub userRole={userRole} />

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowUserMenu(!showUserMenu)}
              data-tour="top-user-menu"
              className="w-8 h-8 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all"
              title={`${userName} (${USER_ROLE_CONFIG[userRole]?.label || userRole})`}
              aria-label="User menu"
            >
              <div className="w-full h-full bg-slate-950 dark:bg-emerald-500 text-white dark:text-slate-950 flex items-center justify-center font-bold text-xs font-mono">
                {userAvatarUrl ? (
                  <Image src={userAvatarUrl} alt={userName} width={32} height={32} className="w-full h-full object-cover" />
                ) : (
                  userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
                )}
              </div>
            </button>

            {/* User Dropdown */}
            {showUserMenu && (
              <div
                className={cn(
                  'absolute right-0 mt-2 w-56 rounded-2xl border shadow-xl p-2 font-mono text-xs z-50 animate-fadeIn',
                  isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
                )}
              >
                <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="font-bold truncate">{userName}</p>
                  <p className="text-[11px] text-slate-400 truncate">{userEmail}</p>
                  <span className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 font-bold">
                    {USER_ROLE_CONFIG[userRole]?.label || userRole}
                  </span>
                </div>

                <div className="py-1 space-y-0.5">
                  <Link
                    href="/dashboard/profile"
                    onClick={() => setShowUserMenu(false)}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <User size={14} className="text-emerald-500 dark:text-emerald-400" />
                    <span>My Profile</span>
                  </Link>
                  <button
                    onClick={() => {
                      setShowUserMenu(false)
                      signOutAndRedirect()
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/100/10 text-rose-500 dark:text-rose-400 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <LogOut size={14} />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

