'use client'

interface LoadingScreenProps {
  /** Whether the loading screen is visible */
  visible?: boolean
  /** Optional custom message below the animation */
  message?: string
  /** Optional: skip the fade-out transition (for immediate unmount) */
  instant?: boolean
}

/**
 * Full-screen loading overlay with three balls that continuously swap positions.
 *
 * Uses CSS-only animations for smooth 60fps performance.
 * Theme-aware: adapts colors for light and dark modes via CSS class toggling.
 */
export function LoadingScreen({ visible = true, instant = false }: LoadingScreenProps) {
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
        {/* Three dots that swap positions in a continuous loop */}
        <div className="loading-screen__dots">
          <span className="loading-screen__dot loading-screen__dot--1" />
          <span className="loading-screen__dot loading-screen__dot--2" />
          <span className="loading-screen__dot loading-screen__dot--3" />
        </div>
      </div>
    </div>
  )
}
