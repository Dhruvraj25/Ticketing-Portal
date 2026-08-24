'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  size?: 'sm' | 'md' | 'lg'
  maxStars?: number
  showValue?: boolean
  disabled?: boolean
}

export function StarRating({
  value,
  onChange,
  size = 'md',
  maxStars = 5,
  showValue = false,
  disabled = false,
}: StarRatingProps) {
  const [hovered, setHovered] = useState(0)
  const isInteractive = !!onChange && !disabled

  const sizeClasses = {
    sm: 'h-3.5 w-3.5',
    md: 'h-5 w-5',
    lg: 'h-7 w-7',
  }

  const starSize = sizeClasses[size]

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: maxStars }, (_, i) => i + 1).map((star) => {
        const filled = hovered ? star <= hovered : star <= value
        return (
          <button
            key={star}
            type="button"
            disabled={!isInteractive}
            onMouseEnter={() => isInteractive && setHovered(star)}
            onMouseLeave={() => isInteractive && setHovered(0)}
            onClick={() => isInteractive && onChange?.(star)}
            className={cn(
              'transition-all duration-150',
              isInteractive && 'cursor-pointer hover:scale-110',
              !isInteractive && 'cursor-default',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm',
            )}
            aria-label={`${star} star${star !== 1 ? 's' : ''}`}
          >
            <svg
              className={cn(
                starSize,
                'transition-colors duration-150',
                filled
                  ? 'text-amber-400'
                  : 'text-gray-200 dark:text-gray-600',
              )}
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        )
      })}
      {showValue && (
        <span className="ml-1.5 text-xs font-medium text-muted-foreground">
          {value}/{maxStars}
        </span>
      )}
    </div>
  )
}

// ─── Display Only (no interaction) ──────────────────────────────────────────

export function StarRatingDisplay({
  value,
  size = 'sm',
  maxStars = 5,
}: {
  value: number
  size?: 'sm' | 'md' | 'lg'
  maxStars?: number
}) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  }

  return (
    <div className="inline-flex items-center gap-0.5">
      {Array.from({ length: maxStars }, (_, i) => i + 1).map((star) => (
        <svg
          key={star}
          className={cn(
            sizeClasses[size],
            'transition-colors',
            star <= value
              ? 'text-amber-400'
              : 'text-gray-200 dark:text-gray-600',
          )}
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  )
}

// ─── Numeric Star Display (e.g. "4.2 ★") ────────────────────────────────────

export function StarRatingNumeric({
  value,
  size = 'sm',
  showStar = true,
}: {
  value: number
  size?: 'sm' | 'md' | 'lg'
  showStar?: boolean
}) {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  return (
    <span className={cn('inline-flex items-center gap-0.5 font-semibold', sizeClasses[size])}>
      {value.toFixed(1)}
      {showStar && <span className="text-amber-400 ml-0.5">★</span>}
    </span>
  )
}
