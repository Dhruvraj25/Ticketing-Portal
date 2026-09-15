import { memo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { TicketHistoryWithUser } from '@/lib/types'
import { formatActivityEntry, DETAIL_LINE_ACTIONS } from '@/lib/ticket-activity-format'
import { cn } from '@/lib/utils'

// ────────────────────────────────────────────────────────────────────────────
// TicketActivityTimeline — displays the full activity history for a ticket
// Component is scroll-container-agnostic; the parent controls height & scroll.
// Client view (isClient=true) only ever shows client-permitted events — the
// server (getTicketHistory) already strips internal activity for clients, and
// this whitelist is the DEFENSIVE second layer so accidental internal data can
// never render. Internal employee names are suppressed for client views too
// (falling back to a role label — see lib/ticket-activity-format.ts).
// No 'use client' needed — this component has no hooks, events, or client state.
// ────────────────────────────────────────────────────────────────────────────

interface TicketActivityTimelineProps {
  history: TicketHistoryWithUser[]
  isClient?: boolean
}

/** Client-safe activity actions (mirror of CLIENT_VISIBLE_HISTORY_ACTIONS). */
const CLIENT_VISIBLE_ACTIONS = new Set([
  'created',
  'client_approved',
  'client_rejected',
  'reopened_by_client',
  'estimate_created',
  'estimate_sent',
  'estimate_approved',
  'estimate_modified',
  'estimate_rejected',
  'clarification_requested',
  'auto_approved',
  'additional_hours_requested',
  'additional_hours_approved',
  'additional_hours_auto_approved',
  'override_created',
  'attachment_uploaded',
  'review_submitted',
  'review_updated',
  'forwarded_to_client',
  'revision_requested',
  'revision_approved',
  'revision_rejected',
])

export const TicketActivityTimeline = memo(function TicketActivityTimeline({ history, isClient }: TicketActivityTimelineProps) {
  // Defensive filter: clients only ever see whitelisted, client-permitted events.
  const filteredHistory = isClient
    ? history.filter(item => CLIENT_VISIBLE_ACTIONS.has(item.action))
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
        const display = formatActivityEntry(item)

        return (
          <div key={item.id} className="flex gap-3">
            <div className="relative">
              <div className={cn('w-2 h-2 rounded-full mt-2', display.color)} />
              {index < filteredHistory.length - 1 && (
                <div className="absolute top-4 left-0.5 w-0.5 h-full bg-border" />
              )}
            </div>
            <div className="flex-1 pb-3">
              <p className="text-sm text-foreground">{display.text}</p>
              {DETAIL_LINE_ACTIONS.has(item.action) && item.newValue && (
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
