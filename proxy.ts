import { NextRequest, NextResponse } from 'next/server';
import { sessionCookieName, verifySession } from './utils/admin/session';

const PUBLIC_ADMIN_PATHS = ['/admin/login', '/api/admin/auth/'];

const securityHeaders = (response: NextResponse) => {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Cache-Control', 'no-store');
  return response;
};

// Signs in to the admin interface. The api routes check the session again.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_ADMIN_PATHS.some((path) => pathname.startsWith(path)))
    return securityHeaders(NextResponse.next());

  const user = await verifySession(
    request.cookies.get(sessionCookieName())?.value
  );
  if (user) return securityHeaders(NextResponse.next());

  if (pathname.startsWith('/api/'))
    return securityHeaders(
      NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    );
  const login = new URL('/admin/login', request.url);
  login.searchParams.set('returnTo', pathname + search);
  return securityHeaders(NextResponse.redirect(login));
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*']
};
