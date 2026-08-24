'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Star, Clock, User, AlertTriangle, Hash, FileText } from 'lucide-react'
import { getCustomerReviewDetail } from '@/app/actions/reports'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { TICKET_PRIORITY_CONFIG } from '@/lib/types'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ReviewDetailProps {
  ticketId: number
  open: boolean
  onClose: () => void
}

interface DetailData {
  ticketNumber: string
  title: string
  priority: string
  category: string
  clientName: string
  projectName: string
  moduleName: string
  assignedToName: string
  managerName: string
  overallRating: number
  communicationRating: number | null
  resolutionRating: number | null
  responseTimeRating: number | null
  technicalRating: number | null
  reviewComment: string
  reviewCreatedAt: Date | null
  closedAt: Date | null
  estimatedHours: number
  actualHours: number
  additionalHoursRequested: number
  consumedHours: number
}

export function ReviewDetailModal({ ticketId, open, onClose }: ReviewDetailProps) {
  const [detail, setDetail] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !ticketId) return

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await getCustomerReviewDetail(ticketId)
        setDetail(data as any)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load details')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [ticketId, open])

  const priorityColor = TICKET_PRIORITY_CONFIG[detail?.priority as keyof typeof TICKET_PRIORITY_CONFIG]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-border w-full max-w-2xl max-h-[85vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Review Details</h2>
                  <p className="text-xs text-muted-foreground">Ticket #{detail?.ticketNumber || '...'}</p>
                </div>
              </div>
              <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <ScrollArea className="overflow-y-auto p-6 max-h-[calc(85vh-73px)]">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading details...</p>
                  </div>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center py-16">
                  <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">Failed to load</p>
                  <p className="text-xs text-muted-foreground">{error}</p>
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="mt-4 rounded-xl">
                    Try Again
                  </Button>
                </div>
              ) : detail ? (
                <div className="space-y-6">
                  {/* Ticket Information */}
                  <Section title="Ticket Information" icon={<Hash className="h-4 w-4 text-blue-500 dark:text-blue-400" />}>
                    <div className="grid grid-cols-2 gap-4">
                      <InfoRow label="Ticket Number" value={`#${detail.ticketNumber}`} />
                      <InfoRow label="Title" value={detail.title} colSpan />
                      <InfoRow label="Client" value={detail.clientName} />
                      <InfoRow label="Project" value={detail.projectName} />
                      <InfoRow label="Module" value={detail.moduleName} />
                      <InfoRow
                        label="Priority"
                        value={
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium', priorityColor?.color)}>
                            {priorityColor?.label || detail.priority}
                          </span>
                        }
                      />
                      <InfoRow label="Category" value={detail.category} />
                    </div>
                  </Section>

                  {/* Assignment Information */}
                  <Section title="Assignment Information" icon={<User className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />}>
                    <div className="grid grid-cols-2 gap-4">
                      <InfoRow label="Assigned Resource" value={detail.assignedToName} />
                      <InfoRow label="Manager" value={detail.managerName} />
                    </div>
                  </Section>

                  {/* Customer Feedback */}
                  <Section title="Customer Feedback" icon={<Star className="h-4 w-4 text-amber-500 dark:text-amber-400" />}>
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={cn(
                                'h-5 w-5',
                                star <= detail.overallRating ? 'text-amber-400 fill-amber-400' : 'text-gray-200',
                              )}
                            />
                          ))}
                        </div>
                        <span className="text-sm font-semibold text-foreground">{detail.overallRating}/5</span>
                      </div>

                      {detail.reviewCreatedAt && (
                        <InfoRow
                          label="Review Date"
                          value={format(new Date(detail.reviewCreatedAt), 'MMMM d, yyyy')}
                        />
                      )}

                      {detail.reviewComment && detail.reviewComment !== '—' && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">Customer Comment</p>
                          <p className="text-sm text-foreground bg-muted/30 rounded-xl p-3 border border-border/50">{detail.reviewComment}</p>
                        </div>
                      )}

                      {/* Category ratings */}
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <CategoryRating label="Communication" value={detail.communicationRating} />
                        <CategoryRating label="Resolution Quality" value={detail.resolutionRating} />
                        <CategoryRating label="Response Time" value={detail.responseTimeRating} />
                        <CategoryRating label="Technical Knowledge" value={detail.technicalRating} />
                      </div>
                    </div>
                  </Section>

                  {/* Resolution Information */}
                  <Section title="Resolution Information" icon={<Clock className="h-4 w-4 text-purple-500 dark:text-purple-400" />}>
                    <div className="grid grid-cols-2 gap-4">
                      {detail.closedAt && (
                        <InfoRow label="Resolution Date" value={format(new Date(detail.closedAt), 'MMMM d, yyyy')} />
                      )}
                      <InfoRow label="Estimated Hours" value={`${detail.estimatedHours}h`} />
                      <InfoRow label="Actual Hours" value={`${detail.actualHours}h`} />
                      <InfoRow label="Additional Hours" value={`${detail.additionalHoursRequested}h`} />
                      <InfoRow label="Total Consumed Hours" value={`${detail.consumedHours}h`} />
                    </div>
                  </Section>
                </div>
              ) : null}
            </ScrollArea>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-muted/50">{icon}</div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="bg-muted/10 border border-border/50 rounded-xl p-4">{children}</div>
    </div>
  )
}

function InfoRow({ label, value, colSpan }: { label: string; value: React.ReactNode; colSpan?: boolean }) {
  return (
    <div className={colSpan ? 'col-span-2' : ''}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

function CategoryRating({ label, value }: { label: string; value: number | null }) {
  if (value === null || value === undefined) return null
  return (
    <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-border/50 rounded-lg px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className="flex">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={cn('h-3 w-3', star <= value ? 'text-amber-400 fill-amber-400' : 'text-gray-200')}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-foreground">{value}</span>
      </div>
    </div>
  )
}
