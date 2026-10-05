'use client'

import { useState } from 'react'
import Image from 'next/image'

export function getUserInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * The signed-in user's profile photo, or their initials when there is no
 * photo or it fails to load. Renders only the contents — the caller supplies
 * the circular container (size, colours, overflow-hidden).
 *
 * Shared by the sidebar profile card and the top-header menu so both always
 * show the same image from the same source (the session user's avatarUrl).
 */
export function UserAvatar({ name, src, size }: { name: string; src?: string | null; size: number }) {
  // Remember which URL failed, so a newly uploaded photo gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (src && failedSrc !== src) {
    return (
      <Image
        src={src}
        alt={name}
        width={size}
        height={size}
        className="w-full h-full object-cover"
        onError={() => setFailedSrc(src)}
      />
    )
  }

  return <>{getUserInitials(name)}</>
}
