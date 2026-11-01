// Tokens and request limits of the public api, in this order:
// - API users send a token in the Authorization header.
// - Users signed in on the website whose email address is an enabled api user
//   get the limits of that user.
// - Everyone else gets an anonymous token in a cookie, with the limits of the
//   anonymous user.
//
// Counters are kept in memory and written to apiUsage every few seconds, so the
// limits assume a single webstore-api instance.
import { createHash } from 'node:crypto';
import { connection, NextRequest, NextResponse } from 'next/server';
import { queryPool } from './mariadb';
import { auth } from '../auth';
import { cookieOptions, randomToken, sign, verify } from './signedTokens';

const VISITOR_COOKIE = 'api-visitor';
const VISITOR_TOKEN_DAYS = 30;
const CACHE_TTL_MS = 30 * 1000;
const FLUSH_INTERVAL_MS = 10 * 1000;
// New visitor tokens per ip and hour, so clearing cookies does not reset the limits
const VISITOR_TOKENS_PER_IP_HOUR = Number(
  process.env.API_VISITOR_TOKENS_PER_IP_HOUR ?? 30
);

export const TOKEN_PREFIX = 'wsk_';

interface Limits {
  userId: number;
  enabled: boolean;
  requestsPerMinute: number;
  requestsPerDay: number;
}

interface TokenRecord extends Limits {
  tokenId: number;
  revoked: boolean;
}

interface Counter {
  minute: number;
  minuteCount: number;
  day: string;
  dayCount: number;
  dayLoaded?: Promise<void>;
}

interface State {
  tokens: Map<string, { at: number; record: TokenRecord | null }>;
  // Api users by lowercase email, for signed in users
  users: Map<string, { at: number; limits: Limits | null }>;
  anonymous?: { at: number; limits: Limits | null };
  counters: Map<string, Counter>;
  issued: Map<string, { hour: number; count: number }>;
  // Usage not written yet, by userId:tokenId:day
  pending: Map<string, { requests: number; rejected: number }>;
  usedTokens: Set<number>;
  flushing?: ReturnType<typeof setInterval>;
}

declare global {
  // Route handlers are bundled separately, the state is shared through globalThis
  var apiAccess: State | undefined;
}

const state = (): State => {
  global.apiAccess ??= {
    tokens: new Map(),
    users: new Map(),
    counters: new Map(),
    issued: new Map(),
    pending: new Map(),
    usedTokens: new Set()
  };
  return global.apiAccess;
};

export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export const generateToken = () => {
  const token = TOKEN_PREFIX + randomToken(32);
  return { token, prefix: token.slice(0, 12), hash: hashToken(token) };
};

// Changes in the admin interface apply right away instead of after the cache
export const invalidateAccessCache = () => {
  state().tokens.clear();
  state().users.clear();
  state().anonymous = undefined;
};

const utcDay = () => new Date().toISOString().slice(0, 10);
const currentMinute = () => Math.floor(Date.now() / 60000);

const lookupToken = async (token: string): Promise<TokenRecord | null> => {
  const hash = hashToken(token);
  const cached = state().tokens.get(hash);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.record;
  const [row] = await queryPool<
    {
      tokenId: number;
      userId: number;
      revokedAt: Date | null;
      enabled: number;
      requestsPerMinute: number;
      requestsPerDay: number;
    }[]
  >(
    `SELECT t.id AS tokenId, t.userId, t.revokedAt, u.enabled, u.requestsPerMinute, u.requestsPerDay
     FROM apiTokens t JOIN apiUsers u ON u.id = t.userId WHERE t.hash = ? AND u.anonymous = 0`,
    [hash]
  );
  const record = row
    ? {
        tokenId: Number(row.tokenId),
        userId: Number(row.userId),
        revoked: row.revokedAt !== null,
        enabled: !!row.enabled,
        requestsPerMinute: Number(row.requestsPerMinute),
        requestsPerDay: Number(row.requestsPerDay)
      }
    : null;
  state().tokens.set(hash, { at: Date.now(), record });
  return record;
};

// The enabled api user with the email address of a signed in user
const lookupUser = async (email: string): Promise<Limits | null> => {
  const key = email.toLowerCase();
  const cached = state().users.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.limits;
  const [row] = await queryPool<
    { id: number; requestsPerMinute: number; requestsPerDay: number }[]
  >(
    'SELECT id, requestsPerMinute, requestsPerDay FROM apiUsers WHERE email = ? AND enabled = 1 AND anonymous = 0',
    [key]
  );
  const limits = row
    ? {
        userId: Number(row.id),
        enabled: true,
        requestsPerMinute: Number(row.requestsPerMinute),
        requestsPerDay: Number(row.requestsPerDay)
      }
    : null;
  state().users.set(key, { at: Date.now(), limits });
  return limits;
};

const anonymousLimits = async (): Promise<Limits | null> => {
  const cached = state().anonymous;
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.limits;
  const [row] = await queryPool<
    {
      id: number;
      enabled: number;
      requestsPerMinute: number;
      requestsPerDay: number;
    }[]
  >(
    'SELECT id, enabled, requestsPerMinute, requestsPerDay FROM apiUsers WHERE anonymous = 1 LIMIT 1'
  );
  const limits = row
    ? {
        userId: Number(row.id),
        enabled: !!row.enabled,
        requestsPerMinute: Number(row.requestsPerMinute),
        requestsPerDay: Number(row.requestsPerDay)
      }
    : null;
  state().anonymous = { at: Date.now(), limits };
  return limits;
};

// The client address as seen by the reverse proxy, which must append it to
// X-Forwarded-For
const clientIp = (request: NextRequest) => {
  const forwarded = request.headers.get('x-forwarded-for');
  return (
    forwarded?.split(',').pop()?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
};

const mayIssueVisitorToken = (ip: string) => {
  // Without a reverse proxy every visitor would share one address
  if (ip === 'unknown') return true;
  const hour = Math.floor(Date.now() / 3600000);
  const issued = state().issued.get(ip);
  if (!issued || issued.hour !== hour) {
    state().issued.set(ip, { hour, count: 1 });
    return true;
  }
  issued.count++;
  return issued.count <= VISITOR_TOKENS_PER_IP_HOUR;
};

const record = (userId: number, tokenId: number, rejected: boolean) => {
  const key = `${userId}:${tokenId}:${utcDay()}`;
  const pending = state().pending.get(key) ?? { requests: 0, rejected: 0 };
  if (rejected) pending.rejected++;
  else pending.requests++;
  state().pending.set(key, pending);
  if (tokenId > 0 && !rejected) state().usedTokens.add(tokenId);
  startFlushing();
};

const flush = async () => {
  const { pending, usedTokens } = state();
  const entries = [...pending.entries()];
  const tokenIds = [...usedTokens];
  pending.clear();
  usedTokens.clear();
  try {
    for (const [key, { requests, rejected }] of entries) {
      const [userId, tokenId, day] = key.split(':');
      await queryPool(
        `INSERT INTO apiUsage (userId, tokenId, day, requests, rejected) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE requests = requests + VALUES(requests), rejected = rejected + VALUES(rejected)`,
        [userId, tokenId, day, String(requests), String(rejected)]
      );
    }
    if (tokenIds.length > 0)
      await queryPool(
        'UPDATE apiTokens SET lastUsedAt = UTC_TIMESTAMP() WHERE id IN (?)',
        [tokenIds]
      );
  } catch (e) {
    console.error('Writing api usage failed', e);
  }
  // Forget visitor counters from earlier days
  const today = utcDay();
  for (const [key, counter] of state().counters)
    if (counter.day !== today) state().counters.delete(key);
};

const startFlushing = () => {
  if (state().flushing) return;
  const interval = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  interval.unref?.();
  state().flushing = interval;
};

// Counts the request against the limits of the token, false when over a
// limit. Anonymous visitors are counted together in the database, so their
// day count is only kept in memory.
const consume = async (
  key: string,
  limits: Limits,
  tokenId: number,
  anonymous: boolean
) => {
  const minute = currentMinute();
  const day = utcDay();
  let counter = state().counters.get(key);
  if (!counter || counter.day !== day) {
    counter = { minute, minuteCount: 0, day, dayCount: 0 };
    state().counters.set(key, counter);
    // Requests made before a restart still count for api users
    if (!anonymous) {
      const current = counter;
      current.dayLoaded = queryPool<{ requests: number }[]>(
        'SELECT requests FROM apiUsage WHERE userId = ? AND tokenId = ? AND day = ?',
        [limits.userId, tokenId, day]
      )
        .then(([row]) => {
          current.dayCount += Number(row?.requests ?? 0);
        })
        .catch((e) => console.error('Reading api usage failed', e));
    }
  }
  await counter.dayLoaded;
  if (counter.minute !== minute) {
    counter.minute = minute;
    counter.minuteCount = 0;
  }
  const allowed =
    counter.minuteCount < limits.requestsPerMinute &&
    counter.dayCount < limits.requestsPerDay;
  if (allowed) {
    counter.minuteCount++;
    counter.dayCount++;
  }
  record(limits.userId, tokenId, !allowed);
  return {
    allowed,
    retryAfter:
      counter.dayCount >= limits.requestsPerDay
        ? secondsToMidnight()
        : 60 - ((Date.now() / 1000) % 60),
    headers: {
      'X-RateLimit-Limit-Minute': String(limits.requestsPerMinute),
      'X-RateLimit-Remaining-Minute': String(
        Math.max(limits.requestsPerMinute - counter.minuteCount, 0)
      ),
      'X-RateLimit-Limit-Day': String(limits.requestsPerDay),
      'X-RateLimit-Remaining-Day': String(
        Math.max(limits.requestsPerDay - counter.dayCount, 0)
      )
    }
  };
};

const secondsToMidnight = () => {
  const now = new Date();
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  return (midnight - now.getTime()) / 1000;
};

const error = (
  status: number,
  message: string,
  headers: Record<string, string> = {}
) => NextResponse.json({ error: message }, { status, headers });

// Requests this minute and today per token key, for the admin interface
export const liveUsage = () => {
  const minute = currentMinute();
  const day = utcDay();
  const result = new Map<string, { minute: number; day: number }>();
  for (const [key, counter] of state().counters)
    if (counter.day === day)
      result.set(key, {
        minute: counter.minute === minute ? counter.minuteCount : 0,
        day: counter.dayCount
      });
  return result;
};

// Wraps a public api route: checks the token and the limits
export const withApiAccess =
  <C>(handler: (request: NextRequest, context: C) => Promise<Response>) =>
  async (request: NextRequest, context: C) => {
    // Never prerendered. Outside the try, which would otherwise catch the
    // signal Next.js throws to stop prerendering.
    await connection();
    let key: string;
    let limits: Limits;
    let tokenId = 0;
    let anonymous = false;
    let visitorCookie: string | undefined;
    try {
      const token =
        request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ??
        request.headers.get('x-api-key') ??
        undefined;
      if (token) {
        const found = await lookupToken(token);
        if (!found || found.revoked || !found.enabled)
          return error(401, 'The API token is not valid');
        key = `t${found.tokenId}`;
        limits = found;
        tokenId = found.tokenId;
      }
      const email = token ? undefined : (await auth())?.user?.email;
      const user = email ? await lookupUser(email) : null;
      if (user) {
        // Requests of signed in users are counted as token 0 of the user
        key = `u${user.userId}`;
        limits = user;
      } else if (!token) {
        const anonymousUser = await anonymousLimits();
        if (!anonymousUser?.enabled)
          return error(401, 'An API token is required');
        anonymous = true;
        let visitor = (
          await verify<{ v: string }>(
            request.cookies.get(VISITOR_COOKIE)?.value
          )
        )?.v;
        if (!visitor) {
          if (!mayIssueVisitorToken(clientIp(request)))
            return error(
              429,
              'Too many new visitors from this address, try again later',
              {
                'Retry-After': '3600'
              }
            );
          visitor = randomToken(16);
          visitorCookie = await sign(
            { v: visitor },
            VISITOR_TOKEN_DAYS * 24 * 3600
          );
        }
        key = `a${visitor}`;
        limits = anonymousUser;
      }
    } catch (e) {
      console.error('Checking api access failed', e);
      return error(503, 'The API is not available');
    }

    const usage = await consume(key!, limits!, tokenId, anonymous);
    if (!usage.allowed)
      return error(429, 'Too many requests', {
        ...usage.headers,
        'Retry-After': String(Math.ceil(usage.retryAfter))
      });

    const response = await handler(request, context);
    // Response.error() has status 0, which a NextResponse can not have
    if (response.type === 'error' || response.status === 0)
      return error(500, 'Something went wrong');
    const result = new NextResponse(response.body, response);
    for (const [name, value] of Object.entries(usage.headers))
      result.headers.set(name, value);
    if (visitorCookie)
      result.cookies.set(
        VISITOR_COOKIE,
        visitorCookie,
        cookieOptions(VISITOR_TOKEN_DAYS * 24 * 3600)
      );
    return result;
  };
