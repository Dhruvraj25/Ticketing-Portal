'use client'

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

interface LoadingContextType {
  /** Show the full-screen loading screen */
  showLoading: (message?: string) => void
  /** Hide the full-screen loading screen */
  hideLoading: () => void
  /** Whether the loading screen is currently visible */
  isVisible: boolean
}

const LoadingContext = createContext<LoadingContextType>({
  showLoading: () => {},
  hideLoading: () => {},
  isVisible: false,
})

export function useLoading() {
  return useContext(LoadingContext)
}

interface LoadingProviderProps {
  children: ReactNode
}

/**
 * Global loading context provider.
 *
 * Provides `showLoading` / `hideLoading` hooks for triggering the
 * LoadingScreen from any component. Route transitions are handled
 * by Next.js `loading.tsx` files instead.
 */
export function LoadingProvider({ children }: LoadingProviderProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [message, setMessage] = useState<string | undefined>(undefined)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showLoading = useCallback((msg?: string) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setMessage(msg)
    setIsVisible(true)
  }, [])

  const hideLoading = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false)
      setMessage(undefined)
    }, 200)
  }, [])

  return (
    <LoadingContext.Provider value={{ showLoading, hideLoading, isVisible }}>
      {children}
    </LoadingContext.Provider>
  )
}
