'use client'

import { useEffect, type RefObject } from 'react'
import { createDismissHandlers } from '../lib/dismiss-on-outside.ts'

/**
 * Close a popup when the user presses outside it (or hits Escape).
 *
 * `containerRef` should wrap BOTH the trigger and the popup, so pressing the
 * trigger is "inside" (it keeps toggling normally) and pressing a menu item
 * runs that item's own action. The listeners exist only while `open` and are
 * removed when it closes or the component unmounts. `pointerdown` covers
 * mouse, touch and pen, and fires before the outside element's click.
 */
export function useDismissOnOutside(
  containerRef: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!open) return
    const { onPointerDown, onKeyDown } = createDismissHandlers(() => containerRef.current, onDismiss)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, containerRef, onDismiss])
}
