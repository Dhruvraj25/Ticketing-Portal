import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'
import { headers } from 'next/headers'

// Single global Inter load — exposed as the --font-inter CSS variable so
// consumers (e.g. the sidebar) can opt in without loading the font again.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'SupportHub - Enterprise Ticket Management',
  description: 'Premium enterprise ticketing platform for modern support teams',
  generator: 'v0.app',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Read middleware timing header if available (dev only)
  let mwTime = 0
  try {
    const h = await headers()
    const mwHeader = h.get('X-Middleware-Time')
    if (mwHeader) mwTime = parseInt(mwHeader, 10) || 0
  } catch {}

  const layoutStart = performance.now()

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased min-h-screen`}>
        <ThemeProvider defaultTheme="light">
          {children}
          <Toaster richColors closeButton />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ThemeProvider>
      </body>
    </html>
  )
}
