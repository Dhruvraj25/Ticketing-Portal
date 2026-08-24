import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { startTimer, mark } from '@/lib/request-timing'

export function proxy(request: NextRequest) {
  startTimer()

  const { pathname } = request.nextUrl

  // Protect all /dashboard routes
  if (pathname.startsWith('/dashboard')) {
    const sessionToken =
      request.cookies.get('better-auth.session_token')?.value ||
      request.cookies.get('__Secure-better-auth.session_token')?.value

    if (!sessionToken) {
      const signInUrl = new URL('/sign-in', request.url)
      signInUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(signInUrl)
    }
  }

  mark('Middleware')

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
