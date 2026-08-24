'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StarRatingDisplay } from '@/components/ui/star-rating'
import { ReviewForm } from '@/components/dashboard/review-form'
import { format } from 'date-fns'
import { Star, MessageSquare, Lightbulb, Edit2, CheckCircle2 } from 'lucide-react'

interface ReviewDisplayProps {
  review: {
    id: number
    ticketId: number
    overallRating: number
    communicationRating: number | null
    resolutionRating: number | null
    responseTimeRating: number | null
    technicalRating: number | null
    reviewComment: string | null
    suggestions: string | null
    createdAt: Date
    updatedAt: Date
    isEditable?: boolean
  }
  isOwner?: boolean
}

export function ReviewDisplay({ review, isOwner = false }: ReviewDisplayProps) {
  const [isEditing, setIsEditing] = useState(false)

  if (isEditing) {
    return (
      <ReviewForm
        ticketId={review.ticketId}
        existingReview={review}
        onComplete={() => setIsEditing(false)}
        onCancel={() => setIsEditing(false)}
      />
    )
  }

  const CATEGORIES = [
    { key: 'communication', label: 'Communication', value: review.communicationRating },
    { key: 'resolution', label: 'Resolution Quality', value: review.resolutionRating },
    { key: 'responseTime', label: 'Response Time', value: review.responseTimeRating },
    { key: 'technical', label: 'Technical Knowledge', value: review.technicalRating },
  ]

  const hasCategoryRatings = CATEGORIES.some((c) => c.value !== null && c.value > 0)

  return (
    <Card data-tour="ticket-review-display" className="p-5 bg-white dark:bg-slate-900 border-emerald-500/30">
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
          <h3 className="font-semibold text-foreground">Review</h3>
        </div>
        {isOwner && review.isEditable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Edit2 className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Submitted {format(new Date(review.createdAt), 'MMMM d, yyyy')}
        {review.updatedAt > review.createdAt && (
          <span className="ml-1">(edited {format(new Date(review.updatedAt), 'MMM d, yyyy')})</span>
        )}
      </p>

      <div className="space-y-4">
        {/* Overall Rating */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-1.5">
            <StarRatingDisplay value={review.overallRating} size="md" />
            <span className="text-sm font-bold text-amber-700 dark:text-amber-300">{review.overallRating}/5</span>
          </div>
        </div>

        {/* Category Ratings */}
        {hasCategoryRatings && (
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((cat) =>
              cat.value !== null && cat.value > 0 ? (
                <div
                  key={cat.key}
                  className="flex items-center justify-between rounded-lg bg-muted/30 border border-border/40 px-3 py-2"
                >
                  <span className="text-xs text-muted-foreground">{cat.label}</span>
                  <StarRatingDisplay value={cat.value} size="sm" />
                </div>
              ) : null,
            )}
          </div>
        )}

        {/* Review Comment */}
        {review.reviewComment && (
          <div className="rounded-lg bg-muted/20 border border-border/40 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Comment</span>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              &ldquo;{review.reviewComment}&rdquo;
            </p>
          </div>
        )}

        {/* Suggestions */}
        {review.suggestions && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-500/15/40 border border-amber-200 dark:border-amber-500/30 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Suggestion</span>
            </div>
            <p className="text-sm text-amber-800 whitespace-pre-wrap leading-relaxed">
              {review.suggestions}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
