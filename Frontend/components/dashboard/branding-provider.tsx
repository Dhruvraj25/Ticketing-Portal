'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { getBranding } from '@/app/actions/branding'

export interface BrandingData {
  companyName: string
  logoUrl: string | null
  faviconUrl: string | null
}

interface BrandingContextType {
  branding: BrandingData
  refreshBranding: () => Promise<void>
  setBranding: (data: BrandingData) => void
}

const defaultBranding: BrandingData = {
  companyName: 'SupportHub',
  logoUrl: null,
  faviconUrl: null,
}

const BrandingContext = createContext<BrandingContextType>({
  branding: defaultBranding,
  refreshBranding: async () => {},
  setBranding: () => {},
})

export function useBranding() {
  return useContext(BrandingContext)
}

export function BrandingProvider({ children, initialBranding }: { children: ReactNode; initialBranding?: BrandingData | null }) {
  const [branding, setBrandingState] = useState<BrandingData>(initialBranding ?? defaultBranding)

  const refreshBranding = useCallback(async () => {
    try {
      const data = await getBranding()
      if (data) {
        setBrandingState({
          companyName: data.companyName,
          logoUrl: data.logoUrl,
          faviconUrl: data.faviconUrl,
        })
      }
    } catch (err) {
      console.error('[BrandingProvider] Failed to refresh branding:', err)
    }
  }, [])

  const setBranding = setBrandingState
  const contextValue = useMemo(() => ({ branding, refreshBranding, setBranding }), [branding, refreshBranding, setBranding])

  return (
    <BrandingContext.Provider value={contextValue}>
      {children}
    </BrandingContext.Provider>
  )
}
