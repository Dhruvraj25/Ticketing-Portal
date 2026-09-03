'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  BookOpen,
  ChevronRight,
  Compass,
  FileText,
  HelpCircle,
  KeyRound,
  Mail,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Kbd } from '@/components/ui/kbd'
import { useTheme } from '@/components/theme-provider'
import { useTour } from '@/components/tour/tour-provider'
import { PAGE_TOURS, resolvePageTourKey } from '@/lib/tour/config'
import type { UserRole } from '@/lib/types'
import { useKeyboardShortcuts } from './keyboard-shortcuts-provider'

/** Role-aware guide names — mirrors the Help Center's role-based guides. */
const ROLE_GUIDE_LABELS: Record<UserRole, string> = {
  client: 'Client Guide',
  project_manager: 'Manager Guide',
  developer: 'Resource Guide',
  admin: 'Administrator Guide',
}

interface HelpHubProps {
  userRole: UserRole
}

interface HubMenuItem {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  iconClass: string
  disabled?: boolean
  disabledReason?: string
  onSelect: () => void
}

/**
 * Enterprise Help Hub — the single entry point for tours, help docs, keyboard
 * shortcuts, release notes and support. Opens beside the header Help icon and
 * never navigates away from the current page by itself.
 */
export function HelpHub({ userRole }: HelpHubProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const { startPageTour, startRoleTour, isActive, getRoleTourProgress } = useTour()

  const [open, setOpen] = useState(false)
  const [tourProgress, setTourProgress] = useState({ completed: false, lastStepIndex: 0 })
  const { openShortcuts: openShortcutsDialog } = useKeyboardShortcuts()

  // Page awareness — resolve the current route's tour (dynamic routes like
  // /dashboard/tickets/42 resolve to their template config).
  const pageTourKey = resolvePageTourKey(pathname)
  const pageTourAvailable = !!pageTourKey && (PAGE_TOURS[pageTourKey]?.length ?? 0) > 0
  const isOnHelpPage = pathname === '/dashboard/help'

  // Refresh the persisted product-tour progress every time the menu opens so
  // the label (Start / Continue / Replay) is always accurate.
  useEffect(() => {
    if (open) setTourProgress(getRoleTourProgress())
  }, [open, getRoleTourProgress])

  const close = useCallback(() => setOpen(false), [])

  // ── Actions ────────────────────────────────────────────────────────────────

  const startExplorePageTour = () => {
    if (!pageTourAvailable || isActive) return
    close()
    // Let the popover unmount before the tour overlay mounts.
    window.setTimeout(() => void startPageTour(), 180)
  }

  const startProductTour = () => {
    close()
    const resumeFrom = !tourProgress.completed && tourProgress.lastStepIndex > 0 ? tourProgress.lastStepIndex : 0
    window.setTimeout(() => void startRoleTour(undefined, resumeFrom), 180)
  }

  const goToHelpSection = (section?: 'roleGuides' | 'releaseNotes' | 'contact') => {
    close()
    router.push(section ? `/dashboard/help?section=${section}` : '/dashboard/help')
  }

  const openShortcuts = () => {
    close()
    openShortcutsDialog()
  }

  // ── Product tour label — state-aware ───────────────────────────────────────

  const productTourLabel = tourProgress.completed
    ? 'Replay Product Tour'
    : tourProgress.lastStepIndex > 0
      ? 'Continue Product Tour'
      : 'Product Tour'

  const productTourDescription = tourProgress.completed
    ? 'Walk through the entire portal again from the start.'
    : tourProgress.lastStepIndex > 0
      ? 'Resume from where you left off.'
      : 'Complete walkthrough of the entire portal.'

  const menuItems: HubMenuItem[] = [
    {
      id: 'explore-page',
      label: 'Explore This Page',
      description: 'Interactive walkthrough of the current page.',
      icon: <Compass className="h-4 w-4" />,
      iconClass: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      disabled: !pageTourAvailable || isActive,
      disabledReason: !pageTourAvailable ? 'No interactive tour available for this page.' : 'A tour is already running.',
      onSelect: startExplorePageTour,
    },
    {
      id: 'help-center',
      label: 'Help Center',
      description: 'User documentation, FAQs and guides.',
      icon: <BookOpen className="h-4 w-4" />,
      iconClass: 'bg-gradient-to-br from-sky-500 to-blue-600',
      onSelect: () => goToHelpSection(),
    },
    {
      id: 'product-tour',
      label: productTourLabel,
      description: productTourDescription,
      icon:
        tourProgress.completed ? (
          <RefreshCw className="h-4 w-4" />
        ) : tourProgress.lastStepIndex > 0 ? (
          <PlayCircle className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        ),
      iconClass: 'bg-gradient-to-br from-violet-500 to-purple-600',
      disabled: isActive,
      onSelect: startProductTour,
    },
    {
      id: 'shortcuts',
      label: 'Keyboard Shortcuts',
      description: 'View all available shortcuts.',
      icon: <KeyRound className="h-4 w-4" />,
      iconClass: 'bg-gradient-to-br from-amber-500 to-orange-600',
      onSelect: openShortcuts,
    },
    {
      id: 'release-notes',
      label: 'Release Notes',
      description: 'Latest improvements and new features.',
      icon: <FileText className="h-4 w-4" />,
      iconClass: 'bg-gradient-to-br from-rose-500 to-pink-600',
      onSelect: () => goToHelpSection('releaseNotes'),
    },
    {
      id: 'contact',
      label: 'Contact Support',
      description: 'Get help from the Support Hero team.', 
      icon: <Mail className="h-4 w-4" />,
      iconClass: 'bg-gradient-to-br from-slate-600 to-slate-800',
      onSelect: () => goToHelpSection('contact'),
    },
  ]

  // Lightweight roving focus: ArrowUp / ArrowDown / Home / End move between the
  // enabled menu items (works alongside Tab for linear navigation).
  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const items = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-help-hub-item]'),
    ).filter((b) => !b.disabled)
    if (!items.length) return
    const currentIdx = items.indexOf(document.activeElement as HTMLButtonElement)
    e.preventDefault()
    let nextIdx = currentIdx
    if (e.key === 'ArrowDown') nextIdx = currentIdx < 0 ? 0 : Math.min(currentIdx + 1, items.length - 1)
    else if (e.key === 'ArrowUp') nextIdx = currentIdx < 0 ? items.length - 1 : Math.max(currentIdx - 1, 0)
    else if (e.key === 'Home') nextIdx = 0
    else if (e.key === 'End') nextIdx = items.length - 1
    items[nextIdx]?.focus()
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-tour="top-help"
            title="Help & Support"
            aria-label="Help & Support"
            aria-haspopup="dialog"
            aria-expanded={open}
            className={cn(
              'p-2 rounded-full transition-colors cursor-pointer',
              isOnHelpPage || open
                ? isDark
                  ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                  : 'bg-slate-200 text-slate-900 dark:text-slate-100 font-bold'
                : isDark
                  ? 'hover:bg-slate-800 text-slate-400'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400',
            )}
          >
            <HelpCircle size={20} />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={10}
          onKeyDown={handleMenuKeyDown}
          className="w-[22.5rem] max-w-[calc(100vw-2rem)] rounded-2xl p-1.5 shadow-2xl shadow-slate-950/20"
        >
          {/* ── Header ── */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-900 p-4">
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-emerald-400/20 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-sky-400/10 blur-2xl" />
            <div className="relative flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 dark:bg-slate-900 ring-1 ring-white/15">
                <HelpCircle className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">Help &amp; Support</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-300">
                  Everything you need to use Support Hero.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => goToHelpSection('roleGuides')}
              className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/15 transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
            >
              <Users className="h-3 w-3 text-emerald-300" />
              {ROLE_GUIDE_LABELS[userRole] ?? 'User Guide'}
              <ChevronRight className="h-3 w-3 opacity-70" />
            </button>
          </div>

          {/* ── Menu items ── */}
          <div className="mt-1.5 space-y-0.5 p-0.5">
            {menuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                data-help-hub-item
                onClick={item.onSelect}
                disabled={item.disabled}
                aria-disabled={item.disabled}
                className={cn(
                  'group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150',
                  item.disabled
                    ? 'cursor-not-allowed opacity-55'
                    : 'hover:bg-slate-100 hover:translate-x-0.5 dark:hover:bg-slate-800/70 focus-visible:outline-2 focus-visible:outline-emerald-500',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm transition-transform duration-150 group-hover:scale-110',
                    item.iconClass,
                  )}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{item.label}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </span>
                  {item.disabled && item.disabledReason && (
                    <span className="mt-0.5 block text-[11px] italic text-muted-foreground/80">
                      {item.disabledReason}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {/* ── Footer ── */}
          <div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="h-3 w-3" />
              Press <Kbd>?</Kbd> to open anytime
            </span>
            <button
              type="button"
              onClick={openShortcuts}
              className="font-semibold text-emerald-600 transition-colors hover:underline dark:text-emerald-400"
            >
              All shortcuts
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
