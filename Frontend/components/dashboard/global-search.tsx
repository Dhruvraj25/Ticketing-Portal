'use client'

import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { SHORTCUT_PAGES_BY_ROLE } from '@/lib/keyboard-shortcuts'
import type { UserRole } from '@/lib/types'
import {
  Activity,
  BarChart2,
  Bell,
  CheckSquare,
  CircleHelp,
  ClipboardList,
  Clock,
  FileText,
  FolderKanban,
  Layers,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Plus,
  Settings,
  Ticket,
  TrendingUp,
  User,
  UserCog,
  UserPlus,
  Wallet,
} from 'lucide-react'

/** Icon lookup for the shortcut-page registry (mirrors sidebar icons). */
const PAGE_ICONS: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  onboarding: UserPlus,
  projects: FolderKanban,
  modules: Layers,
  tickets: Ticket,
  'create-ticket': Plus,
  worklogs: ClipboardList,
  wallets: Wallet,
  'support-wallet': Wallet,
  analytics: BarChart2,
  reports: FileText,
  reviews: CheckSquare,
  'customer-reviews': CheckSquare,
  notifications: Bell,
  users: UserCog,
  teams: MessageSquare,
  settings: Settings,
  assignments: ListChecks,
  'review-queue': CheckSquare,
  team: Activity,
  'time-tracking': Clock,
  resources: TrendingUp,
  profile: User,
  help: CircleHelp,
}

interface GlobalSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userRole: UserRole
}

export function GlobalSearchDialog({ open, onOpenChange, userRole }: GlobalSearchDialogProps) {
  const router = useRouter()
  const pages = SHORTCUT_PAGES_BY_ROLE[userRole] ?? []

  const go = (href: string) => {
    router.push(href)
    onOpenChange(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Global Search"
      description="Jump to any page you have access to."
      className="sm:max-w-lg"
      showCloseButton={false}
    >
      <CommandInput placeholder="Search pages… (tickets, projects, reports…)" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {pages.map((page) => {
            const Icon = PAGE_ICONS[page.key] ?? CircleHelp
            return (
              <CommandItem
                key={page.href}
                value={`${page.label} ${page.keywords ?? ''} ${page.href}`}
                onSelect={() => go(page.href)}
              >
                <Icon />
                <span>{page.label}</span>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
      <div className="border-t border-border/60 px-3 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/40 font-mono text-[10px]">↑↓</kbd>
          navigate
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/40 font-mono text-[10px]">↵</kbd>
          open
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/40 font-mono text-[10px]">esc</kbd>
          close
        </span>
      </div>
    </CommandDialog>
  )
}
