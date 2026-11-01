import { NextRequest, NextResponse } from 'next/server';
import {
  cookieOptions,
  getBaseUrl,
  isSameOrigin,
  sessionCookieName
} from '../../../../../utils/admin/session';

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  const response = NextResponse.redirect(
    new URL('/admin/login?signedOut=1', getBaseUrl() ?? request.url),
    303
  );
  response.cookies.set(sessionCookieName(), '', cookieOptions(0));
  return response;
}
