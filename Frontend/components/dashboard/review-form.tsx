'use client'

import { useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { StarRating } from '@/components/ui/star-rating'
import { submitReview, updateReview } from '@/app/actions/reviews'
import { toast } from 'sonner'
import { Loader2, Star, MessageSquare, Lightbulb } from 'lucide-react'

interface ReviewFormProps {
  ticketId: number
  existingReview?: {
    overallRating: number
    communicationRating: number | null
    resolutionRating: number | null
    responseTimeRating: number | null
    technicalRating: number | null
    reviewComment: string | null
    suggestions: string | null
  } | null
  onComplete?: () => void
  onCancel?: () => void
}

export function ReviewForm({ ticketId, existingReview, onComplete, onCancel }: ReviewFormProps) {
  const [overallRating, setOverallRating] = useState(existingReview?.overallRating || 0)
  const [communicationRating, setCommunicationRating] = useState(existingReview?.communicationRating || 0)
  const [resolutionRating, setResolutionRating] = useState(existingReview?.resolutionRating || 0)
  const [responseTimeRating, setResponseTimeRating] = useState(existingReview?.responseTimeRating || 0)
  const [technicalRating, setTechnicalRating] = useState(existingReview?.technicalRating || 0)
  const [reviewComment, setReviewComment] = useState(existingReview?.reviewComment || '')
  const [suggestions, setSuggestions] = useState(existingReview?.suggestions || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!existingReview

  const CATEGORIES = [
    { key: 'communication', label: 'Communication', value: communicationRating, setter: setCommunicationRating },
    { key: 'resolution', label: 'Resolution Quality', value: resolutionRating, setter: setResolutionRating },
    { key: 'responseTime', label: 'Response Time', value: responseTimeRating, setter: setResponseTimeRating },
    { key: 'technical', label: 'Technical Knowledge', value: technicalRating, setter: setTechnicalRating },
  ]

  const handleSubmit = useCallback(async () => {
    if (overallRating === 0) {
      setError('Please select an overall rating')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = {
        ticketId,
        overallRating,
        communicationRating: communicationRating > 0 ? communicationRating : null,
        resolutionRating: resolutionRating > 0 ? resolutionRating : null,
        responseTimeRating: responseTimeRating > 0 ? responseTimeRating : null,
        technicalRating: technicalRating > 0 ? technicalRating : null,
        reviewComment: reviewComment.trim() || null,
        suggestions: suggestions.trim() || null,
      }

      if (isEditing) {
        await updateReview(data)
        toast.success('Review updated successfully')
      } else {
        await submitReview(data)
        toast.success('Review submitted! Thank you for your feedback.')
      }

      onComplete?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit review')
      toast.error(err instanceof Error ? err.message : 'Failed to submit review')
    } finally {
      setLoading(false)
    }
  }, [ticketId, overallRating, communicationRating, resolutionRating, responseTimeRating, technicalRating, reviewComment, suggestions, isEditing, onComplete])

  return (
    <Card data-tour="ticket-review-form" className="p-5 bg-white dark:bg-slate-900 border-amber-500/30">
      <div className="flex items-center gap-2 mb-1">
        <Star className="h-4 w-4 text-amber-400" />
        <h3 className="font-semibold text-foreground">
          {isEditing ? 'Edit Your Review' : 'Rate Your Experience'}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        {isEditing
          ? 'You can edit your review within 7 days of submission.'
          : 'How was your experience with this ticket resolution? Your feedback helps us improve.'}
      </p>

      <div className="space-y-5">
        {/* Overall Rating */}
        <div>
          <Label className="text-sm font-medium text-foreground">
            Overall Rating <span className="text-destructive">*</span>
          </Label>
          <div className="mt-1.5">
            <StarRating
              value={overallRating}
              onChange={setOverallRating}
              size="lg"
              showValue
            />
          </div>
        </div>

        {/* Category Ratings */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-foreground">
            Category Ratings <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CATEGORIES.map((cat) => (
              <div
                key={cat.key}
                className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {cat.label}
                </span>
                <StarRating
                  value={cat.value}
                  onChange={cat.setter}
                  size="sm"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Review Comment */}
        <div className="space-y-1.5">
          <Label htmlFor="review-comment" className="flex items-center gap-1.5 text-sm font-medium">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            Review Comment <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="review-comment"
            placeholder="Share your experience with this ticket resolution..."
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            rows={3}
            maxLength={1000}
            className="bg-input/50 border-border/50 resize-none"
          />
          <p className="text-[11px] text-muted-foreground text-right">
            {reviewComment.length}/1000
          </p>
        </div>

        {/* Suggestions */}
        <div className="space-y-1.5">
          <Label htmlFor="review-suggestions" className="flex items-center gap-1.5 text-sm font-medium">
            <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" />
            Suggestions <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="review-suggestions"
            placeholder="How can we improve our support?"
            value={suggestions}
            onChange={(e) => setSuggestions(e.target.value)}
            rows={2}
            maxLength={1000}
            className="bg-input/50 border-border/50 resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleSubmit}
            disabled={loading || overallRating === 0}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? 'Update Review' : 'Submit Review'}
          </Button>
          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
