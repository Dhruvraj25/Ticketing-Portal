'use client'

import { useBranding } from '@/components/dashboard/branding-provider'

interface LoadingScreenProps {
  /** Whether the loading screen is visible */
  visible?: boolean
  /** Optional custom message below the animation */
  message?: string
  /** Optional: skip the fade-out transition (for immediate unmount) */
  instant?: boolean
}

/**
 * Full-screen loading overlay inspired by Ryan Roehl's "Loading Screen" on Dribbble.
 *
 * Features two animated dots that bounce in sequence on a solid background,
 * with the SupportHub brand name displayed below. Uses CSS-only animations
 * for smooth 60fps performance.
 *
 * @see https://dribbble.com/shots/1745129-Loading-Screen
 */
export function LoadingScreen({ visible = true, message, instant = false }: LoadingScreenProps) {
  const { branding } = useBranding()
  const companyName = branding?.companyName || 'SupportHub'

  return (
    <div
      className={`loading-screen ${visible ? 'loading-screen--visible' : 'loading-screen--hidden'} ${instant ? 'loading-screen--instant' : ''}`}
      role="status"
      aria-label="Loading"
    >
      {/* Background */}
      <div className="loading-screen__backdrop" />

      {/* Content */}
      <div className="loading-screen__content">
        {/* Animated dots — two dots bouncing in sequence */}
        <div className="loading-screen__dots">
          <span className="loading-screen__dot loading-screen__dot--1" />
          <span className="loading-screen__dot loading-screen__dot--2" />
        </div>

        {/* Brand name */}
        <div className="loading-screen__brand">{companyName}</div>

        {/* Optional message */}
        {message && <div className="loading-screen__message">{message}</div>}
      </div>
    </div>
  )
}
