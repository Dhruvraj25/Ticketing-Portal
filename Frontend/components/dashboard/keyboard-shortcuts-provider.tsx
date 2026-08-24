'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { G_NAV_BY_ROLE } from '@/lib/keyboard-shortcuts'
import { useTour } from '@/components/tour/tour-provider'
import type { UserRole } from '@/lib/types'
import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog'
import { GlobalSearchDialog } from './global-search'

interface KeyboardShortcutsContextValue {
  /** Opens the Keyboard Shortcuts dialog (used by the Help Hub menu item). */
  openShortcuts: () => void
  /** Opens the Global Search command palette. */
  openGlobalSearch: () => void
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null)

export function useKeyboardShortcuts(): KeyboardShortcutsContextValue {
  const ctx = useContext(KeyboardShortcutsContext)
  if (!ctx) throw new Error('useKeyboardShortcuts must be used within KeyboardShortcutsProvider')
  return ctx
}

/** How long the G-navigation sequence stays active after pressing G. */
const G_SEQUENCE_TIMEOUT_MS = 1800

interface KeyboardShortcutsProviderProps {
  userRole: UserRole
  children: React.ReactNode
}

export function KeyboardShortcutsProvider({ userRole, children }: KeyboardShortcutsProviderProps) {
  const router = useRouter()
  const { isActive: tourActive } = useTour()

  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // gActive drives the transient hint pill; gActiveRef is the source of truth
  // read by the keydown handler so it never goes stale (the listener is only
  // registered once per deps change).
  const [gActive, setGActive] = useState(false)
  const gActiveRef = useRef(false)

  const openShortcuts = useCallback(() => setShortcutsOpen(true), [])
  const openGlobalSearch = useCallback(() => setSearchOpen(true), [])

  const gTargets = G_NAV_BY_ROLE[userRole] ?? {}

  useEffect(() => {
    let gTimeout: number | null = null

    const cancelG = () => {
      gActiveRef.current = false
      setGActive(false)
      if (gTimeout !== null) {
        window.clearTimeout(gTimeout)
        gTimeout = null
      }
    }

    const isEditable = (e: KeyboardEvent): boolean => {
      const t = e.target as HTMLElement | null
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    }

    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      // ── Ctrl/Cmd + K — Global Search (works even while typing) ──
      if (mod && key === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
        return
      }

      // Single-key shortcuts below are ignored while typing, when a tour is
      // running, or when one of our dialogs is already open.
      if (isEditable(e) || tourActive || shortcutsOpen || searchOpen) {
        if (e.key === 'Escape') cancelG()
        return
      }
      if (e.altKey) return

      // ── ? — Keyboard Shortcuts ──
      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }

      // ── / — Focus the header search box ──
      if (key === '/') {
        e.preventDefault()
        const input = document.getElementById('top-search-input') as HTMLInputElement | null
        if (input) {
          input.focus()
          input.select()
        }
        return
      }

      // ── Esc — cancel a pending G sequence (dialogs close natively) ──
      if (e.key === 'Escape') {
        cancelG()
        return
      }

      // ── G sequence — first key ──
      if (key === 'g') {
        e.preventDefault()
        cancelG()
        gActiveRef.current = true
        setGActive(true)
        gTimeout = window.setTimeout(cancelG, G_SEQUENCE_TIMEOUT_MS)
        return
      }

      // ── G sequence — second key (role-gated) ──
      if (gActiveRef.current) {
        cancelG()
        const dest = gTargets[key]
        if (dest) {
          e.preventDefault()
          router.push(dest.href)
        }
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      if (gTimeout !== null) window.clearTimeout(gTimeout)
      // Reset g-mode even if a deps change interrupted the sequence.
      gActiveRef.current = false
      setGActive(false)
    }
  }, [router, userRole, gTargets, tourActive, shortcutsOpen, searchOpen])

  const value = useMemo<KeyboardShortcutsContextValue>(
    () => ({ openShortcuts, openGlobalSearch }),
    [openShortcuts, openGlobalSearch],
  )

  const gHintKeys = Object.keys(gTargets)

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}

      {/* Transient G-navigation hint */}
      {gActive && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[70] animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="flex items-center gap-2 rounded-full border border-emerald-200 dark:border-emerald-500/30 bg-white dark:bg-slate-900 shadow-lg shadow-emerald-500/10 px-4 py-2">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">G</span>
            <span className="text-xs text-muted-foreground">press a key to jump —</span>
            <span className="flex items-center gap-1">
              {gHintKeys.map((k) => (
                <kbd
                  key={k}
                  className="px-1.5 py-0.5 rounded border border-border bg-muted/40 font-mono text-[10px] uppercase"
                >
                  {k}
                </kbd>
              ))}
            </span>
          </div>
        </div>
      )}

      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} userRole={userRole} />
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} userRole={userRole} />
    </KeyboardShortcutsContext.Provider>
  )
}
