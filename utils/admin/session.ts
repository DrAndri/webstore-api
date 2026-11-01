// Signed session cookies for the admin interface. Uses only Web Crypto so it can
// run in proxy.ts as well as in route handlers.

export interface AdminUser {
  // GitHub user id and login
  id: number;
  login: string;
  name: string;
}

interface SessionPayload extends AdminUser {
  exp: number;
}

const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const OAUTH_COOKIE = 'admin-oauth';
export const OAUTH_COOKIE_PATH = '/api/admin/auth';

export const getBaseUrl = () => process.env.ADMIN_BASE_URL?.replace(/\/$/, '');

const isSecure = () => getBaseUrl()?.startsWith('https://') ?? false;

// The __Host- prefix makes the browser reject the cookie unless it is Secure,
// has Path=/ and no Domain
export const sessionCookieName = () =>
  isSecure() ? '__Host-admin-session' : 'admin-session';

export const cookieOptions = (maxAge: number, path = '/') => ({
  httpOnly: true,
  secure: isSecure(),
  sameSite: 'lax' as const,
  path,
  maxAge
});

// Admin access is disabled unless all of these are set
export const isAdminConfigured = () =>
  (process.env.ADMIN_SESSION_SECRET?.length ?? 0) >= 32 &&
  !!process.env.ADMIN_GITHUB_USERS &&
  !!process.env.GITHUB_OAUTH_CLIENT_ID &&
  !!process.env.GITHUB_OAUTH_CLIENT_SECRET &&
  !!getBaseUrl();

// ADMIN_GITHUB_USERS is a comma separated list of GitHub logins or numeric
// user ids. Ids keep working if a login is renamed and later taken by someone else.
export const isAllowedUser = (user: { id: number; login: string }) =>
  (process.env.ADMIN_GITHUB_USERS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .some((entry) =>
      /^\d+$/.test(entry)
        ? entry === String(user.id)
        : entry === user.login.toLowerCase()
    );

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64Url = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0)
  );

const getKey = () => {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('ADMIN_SESSION_SECRET must be at least 32 characters');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
};

export const randomToken = (bytes = 32) =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export const sha256Base64Url = async (value: string) =>
  toBase64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
  );

// payload.signature, the payload is base64url encoded JSON with an exp in seconds
export const sign = async (payload: object, ttlSeconds: number) => {
  const body = toBase64Url(
    encoder.encode(
      JSON.stringify({
        ...payload,
        exp: Math.floor(Date.now() / 1000) + ttlSeconds
      })
    )
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    await getKey(),
    encoder.encode(body)
  );
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
};

export const verify = async <T>(token: string | undefined) => {
  if (!token) return undefined;
  const [body, signature] = token.split('.');
  if (!body || !signature) return undefined;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await getKey(),
      fromBase64Url(signature),
      encoder.encode(body)
    );
    if (!valid) return undefined;
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(body))
    ) as T & { exp: number };
    if (payload.exp < Date.now() / 1000) return undefined;
    return payload;
  } catch {
    return undefined;
  }
};

export const createSession = (user: AdminUser) =>
  sign(
    { id: user.id, login: user.login, name: user.name },
    SESSION_TTL_SECONDS
  );

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;

// Also checks the allowlist so removing a user ends their session
export const verifySession = async (
  token: string | undefined
): Promise<AdminUser | undefined> => {
  if (!isAdminConfigured()) return undefined;
  const payload = await verify<SessionPayload>(token);
  if (!payload || !isAllowedUser(payload)) return undefined;
  return { id: payload.id, login: payload.login, name: payload.name };
};

// Mutating requests must come from the admin interface itself. Together with
// SameSite=Lax cookies this protects against CSRF.
export const isSameOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  return origin !== null && origin === getBaseUrl();
};
