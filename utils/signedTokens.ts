// HMAC signed tokens with an expiry, used for the api tokens website visitors
// get in a cookie. Signed with API_TOKEN_SECRET.

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
  const secret = process.env.API_TOKEN_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('API_TOKEN_SECRET must be at least 32 characters');
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

// Secure cookies unless the site is known to run on plain http
export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.AUTH_URL
    ? process.env.AUTH_URL.startsWith('https://')
    : process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge
});

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
