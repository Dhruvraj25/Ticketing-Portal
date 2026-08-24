'use client'

import { useState, useEffect } from 'react'

/**
 * Debounce a value by the specified delay in milliseconds.
 * Returns the debounced value which updates only after the delay has elapsed
 * since the last change to the input value.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}
