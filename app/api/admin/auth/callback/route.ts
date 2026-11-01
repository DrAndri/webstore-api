import { NextRequest, NextResponse } from 'next/server';
import {
  cookieOptions,
  createSession,
  getBaseUrl,
  isAdminConfigured,
  isAllowedUser,
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  SESSION_MAX_AGE,
  sessionCookieName,
  verify
} from '../../../../../utils/admin/session';
import { safeReturnTo } from '../returnTo';

interface OAuthState {
  state: string;
  verifier: string;
  returnTo: string;
}

interface GithubUser {
  id: number;
  login: string;
  name: string | null;
}

const clientId = () => process.env.GITHUB_OAUTH_CLIENT_ID ?? '';
const clientSecret = () => process.env.GITHUB_OAUTH_CLIENT_SECRET ?? '';

const redirect = (path: string, request: NextRequest) => {
  const response = NextResponse.redirect(
    new URL(path, getBaseUrl() ?? request.url)
  );
  response.cookies.set(OAUTH_COOKIE, '', cookieOptions(0, OAUTH_COOKIE_PATH));
  return response;
};

// The app only needs to know who signed in, so the GitHub token is revoked
const revokeToken = (accessToken: string) =>
  fetch(`https://api.github.com/applications/${clientId()}/token`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ access_token: accessToken })
  }).catch((e) => console.error('Revoking the GitHub token failed', e));

export async function GET(request: NextRequest) {
  if (!isAdminConfigured())
    return redirect('/admin/login?error=not-configured', request);
  const params = request.nextUrl.searchParams;
  const oauth = await verify<OAuthState>(
    request.cookies.get(OAUTH_COOKIE)?.value
  );
  const code = params.get('code');
  if (!oauth || !code || params.get('state') !== oauth.state)
    return redirect('/admin/login?error=state', request);

  const tokenResponse = await fetch(
    'https://github.com/login/oauth/access_token',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId(),
        client_secret: clientSecret(),
        code,
        redirect_uri: `${getBaseUrl()}/api/admin/auth/callback`,
        code_verifier: oauth.verifier
      })
    }
  );
  const token = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string;
  };
  if (!token.access_token)
    return redirect('/admin/login?error=github', request);

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token.access_token}`,
      'User-Agent': 'webstore-api-admin'
    }
  });
  await revokeToken(token.access_token);
  if (!userResponse.ok) return redirect('/admin/login?error=github', request);
  const user = (await userResponse.json()) as GithubUser;

  if (!isAllowedUser(user)) {
    console.warn(
      `Admin sign in refused for GitHub user ${user.login} (${user.id})`
    );
    return redirect('/admin/login?error=forbidden', request);
  }

  const response = redirect(safeReturnTo(oauth.returnTo), request);
  response.cookies.set(
    sessionCookieName(),
    await createSession({
      id: user.id,
      login: user.login,
      name: user.name ?? user.login
    }),
    cookieOptions(SESSION_MAX_AGE)
  );
  return response;
}
