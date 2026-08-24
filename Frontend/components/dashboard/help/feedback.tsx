'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ThumbsUp, ThumbsDown } from 'lucide-react'

export function HelpFeedback() {
  const [feedback, setFeedback] = useState<'helpful' | 'not-helpful' | null>(null)
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 p-5 text-center"
      >
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Thank you for your feedback!</p>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Your response helps us improve the Help & Support Center.</p>
      </motion.div>
    )
  }

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 text-center">
      <p className="text-sm font-medium text-foreground mb-3">Was this page helpful?</p>
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setFeedback('helpful'); setSubmitted(true) }}
          className={cn(
            'gap-2 rounded-lg transition-all',
            feedback === 'helpful' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : ''
          )}
          aria-label="Yes, this page was helpful"
        >
          <ThumbsUp className="h-4 w-4" />
          Yes
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setFeedback('not-helpful'); setSubmitted(true) }}
          className={cn(
            'gap-2 rounded-lg transition-all',
            feedback === 'not-helpful' ? 'border-red-400 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300' : ''
          )}
          aria-label="No, this page was not helpful"
        >
          <ThumbsDown className="h-4 w-4" />
          No
        </Button>
      </div>
    </div>
  )
}
