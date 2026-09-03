'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Clock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WelcomeModalProps {
  open: boolean
  userName: string
  roleLabel: string
  onStart: () => void
  onSkip: () => void
  onDismissForever: () => void
}

export function WelcomeModal({
  open,
  userName,
  roleLabel,
  onStart,
  onSkip,
  onDismissForever,
}: WelcomeModalProps) {
  // ESC / backdrop click = skip for this session
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onSkip])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="welcome-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to Support Hero"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={onSkip}
            aria-hidden="true"
          />

          {/* Card */}
          <motion.div
            key="welcome-card"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            {/* Decorative gradient */}
            <div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-slate-900/5 dark:bg-slate-500/10 blur-3xl pointer-events-none" />

            {/* Close */}
            <button
              onClick={onSkip}
              aria-label="Skip"
              className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative p-7">
              {/* Brand tile */}
              <div className="flex items-center gap-4 mb-6">
                <div className="h-14 w-14 rounded-2xl bg-slate-950 dark:bg-emerald-500 flex items-center justify-center shadow-lg shadow-slate-950/20">
                  <span className="text-xl font-bold text-white dark:text-slate-950 font-mono">S</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                    Welcome to Support Hero
                  </h2>
                  <span className="inline-flex items-center gap-1.5 mt-1 text-[11px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                    {roleLabel}
                  </span>
                </div>
              </div>

              {/* Copy */}
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Hi {userName.split(' ')[0]}, let&apos;s take a quick guided tour to help you
                understand the portal. You&apos;ll see how to work with tickets, projects and
                notifications in about two minutes.
              </p>

              {/* Estimated time */}
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5">
                <Clock className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                <span>
                  Estimated time: <span className="font-semibold text-slate-700 dark:text-slate-200">2–3 minutes</span>
                </span>
              </div>

              {/* Actions */}
              <div className="mt-6 space-y-2">
                <Button
                  onClick={onStart}
                  className="w-full h-11 rounded-xl font-semibold text-sm shadow-sm shadow-slate-950/10"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Start Tour
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={onSkip}
                    variant="outline"
                    className="flex-1 h-10 rounded-xl text-sm"
                  >
                    Skip
                  </Button>
                  <button
                    onClick={onDismissForever}
                    className="flex-1 h-10 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    Don&apos;t show again
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
