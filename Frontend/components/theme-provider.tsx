'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme | undefined
  setTheme: (theme: Theme) => void
  resolvedTheme: Theme | undefined
}

const ThemeCtx = createContext<ThemeContextType>({
  theme: undefined,
  setTheme: () => {},
  resolvedTheme: undefined,
})

export function useTheme() {
  return useContext(ThemeCtx)
}

export function ThemeProvider({
  children,
  defaultTheme = 'light',
}: {
  children: React.ReactNode
  defaultTheme?: Theme
}) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme)

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    const initial = stored || defaultTheme
    setThemeState(initial)
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(initial)
  }, [defaultTheme])

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme)
      localStorage.setItem('theme', newTheme)
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(newTheme)
    },
    [],
  )

  return (
    <ThemeCtx.Provider
      value={{ theme, setTheme, resolvedTheme: theme }}
    >
      {children}
    </ThemeCtx.Provider>
  )
}
