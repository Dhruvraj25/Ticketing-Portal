'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { PlusCircle, ClipboardCheck, UserPlus, Code2, FileText, Clock, RefreshCw, CheckCircle2, CheckSquare } from 'lucide-react'

interface LifecycleStage {
  icon: string
  title: string
  description: string
  color: string
}

const iconMap: Record<string, React.ReactNode> = {
  PlusCircle: <PlusCircle className="h-5 w-5" />,
  ClipboardCheck: <ClipboardCheck className="h-5 w-5" />,
  UserPlus: <UserPlus className="h-5 w-5" />,
  Code2: <Code2 className="h-5 w-5" />,
  FileText: <FileText className="h-5 w-5" />,
  Clock: <Clock className="h-5 w-5" />,
  RefreshCw: <RefreshCw className="h-5 w-5" />,
  CheckCircle2: <CheckCircle2 className="h-5 w-5" />,
  CheckSquare: <CheckSquare className="h-5 w-5" />,
}

interface TicketLifecycleProps {
  stages: LifecycleStage[]
}

/**
 * Ticket Lifecycle — alternating left/right timeline.
 *
 * Desktop: cards are substantial (up to 540px wide) and sit close together
 * (~40px apart) so the flow reads as one connected workflow. The central line
 * is continuous and each circular step icon is vertically centered on its
 * card. Mobile: cards stack and the step icon sits centered between cards.
 */
export function TicketLifecycle({ stages }: TicketLifecycleProps) {
  return (
    <div className="relative">
      {/* Continuous central timeline line */}
      <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-800 -translate-x-1/2" />

      <div className="space-y-5 lg:space-y-10">
        {stages.map((stage, i) => {
          const isEven = i % 2 === 0
          return (
            <motion.div
              key={stage.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
              className={cn(
                'relative flex flex-col items-center gap-2',
                'lg:flex-row lg:items-center lg:gap-0',
                isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'
              )}
            >
              {/* Content card */}
              <div className={cn(
                'w-full lg:w-1/2 lg:flex',
                isEven ? 'lg:justify-end lg:pr-14' : 'lg:justify-start lg:pl-14'
              )}>
                <div className="w-full max-w-[540px] mx-auto lg:mx-0 rounded-xl bg-white dark:bg-slate-900 border border-border p-5 sm:p-6 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-border/60 flex items-center justify-center shrink-0">
                      <span className={stage.color}>{iconMap[stage.icon]}</span>
                    </div>
                    <h4 className="font-semibold text-foreground text-base leading-snug">{stage.title}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{stage.description}</p>
                </div>
              </div>

              {/* Center step icon — vertically centered on its card */}
              <div className="relative z-10 flex items-center justify-center shrink-0">
                <div className={cn(
                  'h-12 w-12 rounded-full flex items-center justify-center border-2 bg-white dark:bg-slate-900 shadow-sm',
                  stage.color.replace('text-', 'border-').replace('500', '300')
                )}>
                  <span className={stage.color}>{iconMap[stage.icon]}</span>
                </div>
              </div>

              {/* Spacer for the alternating layout */}
              <div className="hidden lg:block flex-1" />
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
