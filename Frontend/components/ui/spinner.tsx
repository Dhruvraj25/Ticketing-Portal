'use client'

import { LoadingScreen } from '@/components/ui/loading-screen'

/**
 * @deprecated Use `LoadingScreen` directly for full-screen loading states.
 * This component now renders the LoadingScreen as an inline overlay.
 *
 * For button-level loading, continue using `Loader2` from lucide-react
 * with `animate-spin`.
 */
function Spinner({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={className} {...props}>
      <LoadingScreen visible />
    </div>
  )
}

export { Spinner }
