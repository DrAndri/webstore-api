import { NextRequest, NextResponse } from 'next/server';
import {
  cookieOptions,
  getBaseUrl,
  isAdminConfigured,
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  randomToken,
  sha256Base64Url,
  sign
} from '../../../../../utils/admin/session';
import { safeReturnTo } from '../returnTo';

const OAUTH_TTL_SECONDS = 10 * 60;

// Starts the GitHub OAuth flow, with state and PKCE kept in a signed cookie
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl();
  if (!isAdminConfigured() || !baseUrl)
    return NextResponse.redirect(
      new URL('/admin/login?error=not-configured', request.url)
    );

  const state = randomToken();
  const verifier = randomToken(48);
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));

  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set(
    'client_id',
    process.env.GITHUB_OAUTH_CLIENT_ID ?? ''
  );
  authorize.searchParams.set(
    'redirect_uri',
    `${baseUrl}/api/admin/auth/callback`
  );
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('code_challenge', await sha256Base64Url(verifier));
  authorize.searchParams.set('code_challenge_method', 'S256');
  authorize.searchParams.set('allow_signup', 'false');

  const response = NextResponse.redirect(authorize);
  response.cookies.set(
    OAUTH_COOKIE,
    await sign({ state, verifier, returnTo }, OAUTH_TTL_SECONDS),
    cookieOptions(OAUTH_TTL_SECONDS, OAUTH_COOKIE_PATH)
  );
  return response;
}
