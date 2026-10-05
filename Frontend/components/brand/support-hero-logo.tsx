import Image from 'next/image'
import { cn } from '@/lib/utils'

// Intrinsic sizes of the files in /public. Passed to next/image so the browser
// reserves the right aspect ratio before the file loads (no layout shift).
const LOGO_WIDTH = 1200
const LOGO_HEIGHT = 469
const MARK_SIZE = 512

const LOGO_SRC = '/support-hero-logo.png'
// Same artwork with the navy "Support" wordmark lightened for dark surfaces.
const LOGO_DARK_SRC = '/support-hero-logo-dark.png'
const MARK_SRC = '/support-hero-mark.png'

interface SupportHeroLogoProps {
  /** Size by height only (e.g. `h-9`); width follows the aspect ratio. */
  className?: string
  /**
   * Background the logo sits on. `auto` follows the `.dark` theme class;
   * `light`/`dark` force one variant (e.g. a surface that never changes).
   */
  surface?: 'auto' | 'light' | 'dark'
  /** Rendered-width hint for the srcset; raise it if the logo is shown wider. */
  sizes?: string
}

/** Full Support Hero logo — mascot plus "Support Hero" wordmark. */
export function SupportHeroLogo({ className, surface = 'auto', sizes = '128px' }: SupportHeroLogoProps) {
  const imgClass = cn('w-auto max-w-full object-contain select-none', className)
  const common = { alt: 'Support Hero', width: LOGO_WIDTH, height: LOGO_HEIGHT, sizes }

  if (surface !== 'auto') {
    return <Image {...common} src={surface === 'dark' ? LOGO_DARK_SRC : LOGO_SRC} className={imgClass} />
  }

  return (
    <>
      <Image {...common} src={LOGO_SRC} className={cn(imgClass, 'dark:hidden')} />
      <Image {...common} src={LOGO_DARK_SRC} className={cn(imgClass, 'hidden dark:block')} />
    </>
  )
}

/** Square mascot-only mark for compact spots (collapsed sidebar, icon tiles). */
export function SupportHeroMark({
  className,
  alt = 'Support Hero',
  sizes = '48px',
}: {
  className?: string
  alt?: string
  sizes?: string
}) {
  return (
    <Image
      src={MARK_SRC}
      alt={alt}
      width={MARK_SIZE}
      height={MARK_SIZE}
      sizes={sizes}
      className={cn('object-contain select-none', className)}
    />
  )
}
