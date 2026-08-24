'use client'

import { useState, useEffect, useRef } from 'react'
import { ReviewForm } from '@/components/dashboard/review-form'
import { ReviewDisplay } from '@/components/dashboard/review-display'
import { getReviewByTicketId } from '@/app/actions/reviews'
import { Loader2, Star } from 'lucide-react'

interface TicketReviewSectionProps {
  ticketId: number
  ticketStatus: string
  currentUserRole: string
  currentUserId: string
}

export function TicketReviewSection({
  ticketId,
  ticketStatus,
  currentUserRole,
  currentUserId,
}: TicketReviewSectionProps) {
  const [review, setReview] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const prevStatusRef = useRef(ticketStatus)

  // Only show for closed tickets
  const isClosed = ticketStatus === 'closed'

  // Reset state whenever ticket transitions to 'closed' — this handles the
  // case where the client just approved the ticket on this page.
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = ticketStatus

    if (ticketStatus === 'closed' && prev !== 'closed') {
      // Ticket was just closed — reset state and re-fetch
      setReview(null)
      setShowForm(false)
      setLoading(true)
    }
  }, [ticketStatus])

  useEffect(() => {
    if (!isClosed) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchReview() {
      try {
        const existing = await getReviewByTicketId(ticketId)
        if (!cancelled) {
          setReview(existing)
          if (existing) {
            // Review exists — show the display
            setShowForm(false)
          } else if (currentUserRole === 'client') {
            // No review yet and user is the client — auto-show the form
            setShowForm(true)
          }
        }
      } catch {
        // Fetch failed (network / DB error). For clients, still show the
        // review form so they can submit even if fetching existing review
        // failed. For other roles, just show nothing (error is non-fatal).
        if (!cancelled && currentUserRole === 'client') {
          setShowForm(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchReview()
    return () => { cancelled = true }
  }, [ticketId, isClosed, currentUserRole])

  if (!isClosed || loading) {
    if (loading && isClosed) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )
    }
    return null
  }

  // Show form for client without review — persists until they submit.
  // No onCancel prop, so the Cancel button is not rendered. The client must
  // either submit the review to dismiss the form.
  if (currentUserRole === 'client' && showForm && !review) {
    return (
      <ReviewForm
        ticketId={ticketId}
        onComplete={() => {
          setShowForm(false)
          // Re-fetch to show the display; if it fails keep the form visible
          getReviewByTicketId(ticketId)
            .then((existing) => {
              if (existing) setReview(existing)
              else setShowForm(true) // review not found — show form again
            })
            .catch(() => setShowForm(true)) // error — show form so client can retry
        }}
      />
    )
  }

  // Show review display if it exists
  if (review) {
    const isOwner = review.clientId === currentUserId
    return <ReviewDisplay review={review} isOwner={isOwner} />
  }

  // For non-client users with no review, show minimal info
  if (currentUserRole !== 'client') {
    return (
      <div className="rounded-xl bg-muted/20 border border-border/50 p-4 text-center">
        <Star className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
        <p className="text-xs text-muted-foreground">No review submitted for this ticket</p>
      </div>
    )
  }

  return null
}
