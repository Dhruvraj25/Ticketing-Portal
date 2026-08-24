import { memo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { TicketHistoryWithUser } from '@/lib/types'
import { cn } from '@/lib/utils'

// ────────────────────────────────────────────────────────────────────────────
// TicketActivityTimeline — displays the full activity history for a ticket
// Component is scroll-container-agnostic; the parent controls height & scroll.
// When 
// isClient=true, internal time tracking entries (timer_started, timer_stopped,
// timer_paused, timer_resumed, internal_comment_added) are hidden.
// No 'use client' needed — this component has no hooks, events, or client state.
// ────────────────────────────────────────────────────────────────────────────

interface TicketActivityTimelineProps {
  history: TicketHistoryWithUser[]
  isClient?: boolean
}

const actionConfig: Record<string, { label: string; color: string }> = {
  created: { label: 'New support request created.', color: 'bg-emerald-500' },
  status_changed: { label: 'Changed status', color: 'bg-blue-500' },
  assigned: { label: 'Resource assigned to work on this request.', color: 'bg-purple-500' },
  comment_added: { label: 'Added comment', color: 'bg-gray-50 dark:bg-slate-800/500' },
  internal_comment_added: { label: 'Added internal note', color: 'bg-amber-500' },
  timer_started: { label: 'Work has started.', color: 'bg-primary' },
  timer_stopped: { label: 'Finished work', color: 'bg-primary' },
  timer_paused: { label: 'Paused timer', color: 'bg-amber-500' },
  timer_resumed: { label: 'Resumed timer', color: 'bg-primary' },
  estimate_created: { label: 'Estimated work hours sent for approval.', color: 'bg-emerald-500' },
  estimate_approved: { label: 'Estimated work hours approved.', color: 'bg-emerald-500' },
  estimate_modified: { label: 'Estimate updated', color: 'bg-amber-500' },
  clarification_requested: { label: 'Requested clarification', color: 'bg-sky-500' },
  auto_approved: { label: 'Auto-approved', color: 'bg-gray-50 dark:bg-slate-800/500' },
  revision_requested: { label: 'requested revision to estimate', color: 'bg-orange-500' },
  estimate_sent: { label: 'Estimate sent to client', color: 'bg-sky-500' },
  assigned_directly: { label: 'Assigned directly', color: 'bg-indigo-500' },
  additional_hours_requested: { label: 'Additional support hours requested.', color: 'bg-amber-500' },
  additional_hours_approved: { label: 'Additional hours approved', color: 'bg-emerald-500' },
  additional_hours_auto_approved: { label: 'Additional hours auto-approved', color: 'bg-gray-50 dark:bg-slate-800/500' },
  override_created: { label: 'Override ticket created', color: 'bg-red-500' },
  forwarded_to_client: { label: 'Forwarded to client', color: 'bg-sky-500' },
  reassigned: { label: 'Reassigned ticket', color: 'bg-purple-500' },
  client_approved: { label: 'Support request completed.', color: 'bg-emerald-500' },
  client_rejected: { label: 'Client requested changes', color: 'bg-orange-500' },
  reopened_by_client: { label: 'Reopened by client', color: 'bg-red-500' },
  revision_requested_resolution: { label: 'Client requested a revision.', color: 'bg-orange-500' },
  revision_approved: { label: 'approved revision', color: 'bg-emerald-500' },
  revision_rejected: { label: 'rejected revision', color: 'bg-red-500' },
  attachment_uploaded: { label: 'Uploaded file', color: 'bg-sky-500' },
  review_submitted: { label: 'Submitted a review.', color: 'bg-amber-500' },
  review_updated: { label: 'Updated review.', color: 'bg-amber-400' },
}

export const TicketActivityTimeline = memo(function TicketActivityTimeline({ history, isClient }: TicketActivityTimelineProps) {
  // Filter out internal time tracking entries and internal notes for client view
  const filteredHistory = isClient
    ? history.filter(item => !['timer_started', 'timer_stopped', 'timer_paused', 'timer_resumed', 'internal_comment_added'].includes(item.action))
    : history

  if (filteredHistory.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-2">
        No activity yet
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {filteredHistory.map((item, index) => {
        const config = actionConfig[item.action] || { label: item.action.replace(/_/g, ' '), color: 'bg-gray-50 dark:bg-slate-800/500' }
        
        return (
          <div key={item.id} className="flex gap-3">
            <div className="relative">
              <div className={cn('w-2 h-2 rounded-full mt-2', config.color)} />
              {index < history.length - 1 && (
                <div className="absolute top-4 left-0.5 w-0.5 h-full bg-border" />
              )}
            </div>
            <div className="flex-1 pb-3">
              <p className="text-sm text-foreground">
                <span className="font-medium">{item.userName}</span>{' '}
                <span className="text-muted-foreground">{config.label.toLowerCase()}</span>
              </p>
              {(item.action === 'status_changed' ||
                item.action === 'estimate_created' ||
                item.action === 'estimate_approved' ||
                item.action === 'estimate_rejected' ||
                item.action === 'estimate_modified' ||
                item.action === 'auto_approved' ||
                item.action === 'additional_hours_requested' ||
                item.action === 'additional_hours_approved' ||
                item.action === 'additional_hours_auto_approved' ||
                item.action === 'clarification_requested' ||
                item.action === 'override_created' ||
                item.action === 'client_rejected' ||
                item.action === 'reopened_by_client' ||
                item.action === 'revision_requested' ||
                item.action === 'revision_approved' ||
                item.action === 'revision_rejected') && item.newValue && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.newValue.substring(0, 150)}{item.newValue.length > 150 ? '...' : ''}
                </p>
              )}
              {item.newValue && item.action === 'assigned' && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  to {item.newValue}
                </p>
              )}
              {item.newValue && item.action === 'reassigned' && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  to {item.newValue}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
})
