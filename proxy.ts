import type { Session } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from './auth';

const securityHeaders = (response: NextResponse) => {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Cache-Control', 'no-store');
  return response;
};

// Sends visitors of the admin interface that are not signed in to the sign in
// page. Whether a signed in user is an admin is checked by the admin layout
// and every admin api route.
export default auth((authRequest) => {
  // next-auth's types import next/server without an extension, which this
  // project's nodenext resolution can not follow, so NextRequest is restored here
  const request = authRequest as unknown as NextRequest & {
    auth: Session | null;
  };
  const { pathname, search } = request.nextUrl;
  if (request.auth?.user?.email) return securityHeaders(NextResponse.next());

  if (pathname.startsWith('/api/'))
    return securityHeaders(
      NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    );
  const login = new URL('/login', request.url);
  login.searchParams.set('returnTo', pathname + search);
  return securityHeaders(NextResponse.redirect(login));
});

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*']
};
