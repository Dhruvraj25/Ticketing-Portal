'use client'

import { PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTour } from './tour-provider'
import { cn } from '@/lib/utils'

interface RestartTourButtonProps {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  className?: string
  label?: string
  showIcon?: boolean
}

/**
 * "Restart Product Tour" — used in the Help Center and user Profile.
 * Immediately launches the correct role-based tour for the signed-in user.
 */
export function RestartTourButton({
  variant = 'default',
  size = 'default',
  className,
  label = 'Restart Product Tour',
  showIcon = true,
}: RestartTourButtonProps) {
  const { startRoleTour, isActive } = useTour()

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => void startRoleTour()}
      disabled={isActive}
      className={cn('gap-2', className)}
      aria-label={label}
    >
      {showIcon && <PlayCircle className="h-4 w-4" />}
      {label}
    </Button>
  )
}
