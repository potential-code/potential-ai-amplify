import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

// Fast, optimistic gate: no session cookie means not signed in, so go straight
// to /login instead of rendering a dashboard first. It only checks that the
// cookie exists. Whether the session is real, and which role it has, is
// decided by the API on every request and by RequireAuth on the page.
export function proxy(req: NextRequest) {
  if (getSessionCookie(req, { cookiePrefix: 'amplify' })) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  // /mentor/setup and /partner/setup are public pages: only protect the signed-in paths.
  matcher: ['/dashboard/:path*', '/admin/:path*', '/mentor/dashboard/:path*', '/partner', '/partner/profile', '/partner/learners/:path*'],
}
