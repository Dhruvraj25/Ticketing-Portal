'use client'

import { motion } from 'framer-motion'
import { Sparkles, X, ArrowRight, MessageSquare } from 'lucide-react'
import type { FeatureTourConfig } from '@/lib/tour/types'
import { Button } from '@/components/ui/button'

const ICONS: Record<string, React.ReactNode> = {
  MessageSquare: <MessageSquare className="h-5 w-5" />,
  Sparkles: <Sparkles className="h-5 w-5" />,
}

interface FeatureTourBannerProps {
  feature: FeatureTourConfig
  onShow: () => void
  onDismiss: () => void
}

export function FeatureTourBanner({ feature, onShow, onDismiss }: FeatureTourBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className="pointer-events-auto relative w-[340px] max-w-[calc(100vw-2.5rem)] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-950/10 overflow-hidden"
    >
      {/* Accent strip */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-slate-900" />

      <div className="p-5 pt-6">
        <div className="flex items-start gap-3">
          <div className="shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/30">
            {ICONS[feature.icon] ?? <Sparkles className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-full px-2 py-0.5">
              <Sparkles className="h-3 w-3" /> New Feature
            </span>
            <h3 className="mt-1.5 text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
              {feature.title}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {feature.description}
            </p>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="shrink-0 p-1 rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="h-8 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg"
          >
            Dismiss
          </Button>
          <Button
            size="sm"
            onClick={onShow}
            className="h-8 rounded-lg text-xs font-semibold shadow-sm"
          >
            Show Me
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
