'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { G_NAV_BY_ROLE } from '@/lib/keyboard-shortcuts'
import type { UserRole } from '@/lib/types'

interface ShortcutRow {
  keys: string[]
  label: string
}

interface ShortcutGroup {
  title: string
  shortcuts: ShortcutRow[]
}

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userRole: UserRole
}

export function KeyboardShortcutsDialog({ open, onOpenChange, userRole }: KeyboardShortcutsDialogProps) {
  const gTargets = G_NAV_BY_ROLE[userRole] ?? {}

  const groups: ShortcutGroup[] = [
    {
      title: 'Global',
      shortcuts: [
        { keys: ['Ctrl', 'K'], label: 'Global Search' },
        { keys: ['/'], label: 'Focus Search' },
        { keys: ['?'], label: 'Keyboard Shortcuts' },
        { keys: ['Esc'], label: 'Close dialogs, menus & tours' },
      ],
    },
    {
      title: 'Navigate (press G, then a key)',
      shortcuts: Object.entries(gTargets).map(([key, dest]) => ({
        keys: ['G', key.toUpperCase()],
        label: dest.label,
      })),
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Move faster around Support Hero with these shortcuts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-1 max-h-[min(60vh,26rem)] overflow-y-auto pr-1">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group.title}
              </p>
              <div className="rounded-xl border border-border divide-y divide-border bg-muted/20">
                {group.shortcuts.length === 0 && (
                  <p className="px-3.5 py-2.5 text-sm text-muted-foreground">
                    No shortcuts available for your role.
                  </p>
                )}
                {group.shortcuts.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-4 px-3.5 py-2.5"
                  >
                    <span className="text-sm text-foreground">{row.label}</span>
                    <KbdGroup>
                      {row.keys.map((key) => (
                        <Kbd key={key} className="shadow-[0_1px_0_rgba(0,0,0,0.12)] dark:shadow-none">
                          {key}
                        </Kbd>
                      ))}
                    </KbdGroup>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Tip: press <Kbd>?</Kbd> anywhere in the portal to reopen this menu.
        </p>
      </DialogContent>
    </Dialog>
  )
}
