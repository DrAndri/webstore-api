import { generateToken, invalidateAccessCache, liveUsage } from '../apiAccess';
import { HttpError } from './api';
import { adminQuery } from './db';
import { AdminUser } from './auth';
import { ApiToken, ApiUser, ApiUserDetails } from './types';

interface UserRow {
  id: number;
  name: string;
  email: string | null;
  note: string | null;
  anonymous: number;
  admin: number;
  enabled: number;
  requestsPerMinute: number;
  requestsPerDay: number;
  createdAt: Date;
  createdBy: string | null;
  activeTokens: number;
  lastUsedAt: Date | null;
  requestsToday: number | null;
  rejectedToday: number | null;
  requests30Days: number | null;
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);

// The database counts are written every few seconds, the minute is only in
// memory. Counter keys are t<tokenId>, u<userId> for signed in users and
// a<visitor> for anonymous visitors.
const liveForUser = (
  userId: number,
  anonymous: boolean,
  tokenIds: number[]
) => {
  const live = liveUsage();
  let minute = 0;
  for (const [key, usage] of live) {
    const counts = anonymous
      ? key.startsWith('a')
      : key === `u${userId}` ||
        (key.startsWith('t') && tokenIds.includes(Number(key.slice(1))));
    if (counts) minute += usage.minute;
  }
  return minute;
};

const USER_COLUMNS = `u.id, u.name, u.email, u.note, u.anonymous, u.admin, u.enabled, u.requestsPerMinute,
  u.requestsPerDay, u.createdAt, u.createdBy,
  (SELECT COUNT(*) FROM apiTokens t WHERE t.userId = u.id AND t.revokedAt IS NULL) AS activeTokens,
  (SELECT MAX(lastUsedAt) FROM apiTokens t WHERE t.userId = u.id) AS lastUsedAt,
  (SELECT SUM(requests) FROM apiUsage a WHERE a.userId = u.id AND a.day = UTC_DATE()) AS requestsToday,
  (SELECT SUM(rejected) FROM apiUsage a WHERE a.userId = u.id AND a.day = UTC_DATE()) AS rejectedToday,
  (SELECT SUM(requests) FROM apiUsage a WHERE a.userId = u.id AND a.day > UTC_DATE() - INTERVAL 30 DAY) AS requests30Days`;

const toUser = (row: UserRow, tokenIds: number[]): ApiUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  note: row.note,
  anonymous: !!row.anonymous,
  admin: !!row.admin,
  enabled: !!row.enabled,
  requestsPerMinute: row.requestsPerMinute,
  requestsPerDay: row.requestsPerDay,
  createdAt: iso(row.createdAt)!,
  createdBy: row.createdBy,
  activeTokens: row.activeTokens,
  lastUsedAt: iso(row.lastUsedAt),
  requestsToday: row.requestsToday ?? 0,
  rejectedToday: row.rejectedToday ?? 0,
  requests30Days: row.requests30Days ?? 0,
  requestsThisMinute: liveForUser(row.id, !!row.anonymous, tokenIds)
});

export const listApiUsers = async (): Promise<ApiUser[]> => {
  const [rows, tokens] = await Promise.all([
    adminQuery<UserRow[]>(
      `SELECT ${USER_COLUMNS} FROM apiUsers u ORDER BY u.anonymous DESC, u.name`
    ),
    adminQuery<{ id: number; userId: number }[]>(
      'SELECT id, userId FROM apiTokens WHERE revokedAt IS NULL'
    )
  ]);
  return rows.map((row) =>
    toUser(
      row,
      tokens.filter((t) => t.userId === row.id).map((t) => t.id)
    )
  );
};

export const getApiUser = async (id: number): Promise<ApiUserDetails> => {
  const [[row], tokens, usage, [website]] = await Promise.all([
    adminQuery<UserRow[]>(
      `SELECT ${USER_COLUMNS} FROM apiUsers u WHERE u.id = ?`,
      [id]
    ),
    adminQuery<
      (Omit<
        ApiToken,
        'createdAt' | 'lastUsedAt' | 'revokedAt' | 'requestsThisMinute'
      > & {
        createdAt: Date;
        lastUsedAt: Date | null;
        revokedAt: Date | null;
        requestsToday: number | null;
      })[]
    >(
      `SELECT t.id, t.name, t.prefix, t.createdAt, t.createdBy, t.lastUsedAt, t.revokedAt,
         (SELECT SUM(requests) FROM apiUsage a WHERE a.tokenId = t.id AND a.day = UTC_DATE()) AS requestsToday
       FROM apiTokens t WHERE t.userId = ? ORDER BY t.revokedAt IS NULL DESC, t.id DESC`,
      [id]
    ),
    adminQuery<{ day: string; requests: number; rejected: number }[]>(
      `SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, SUM(requests) AS requests, SUM(rejected) AS rejected
       FROM apiUsage WHERE userId = ? AND day > UTC_DATE() - INTERVAL 30 DAY GROUP BY day ORDER BY day`,
      [id]
    ),
    // Requests made while signed in on the website are counted as token 0
    adminQuery<{ requests: number }[]>(
      'SELECT requests FROM apiUsage WHERE userId = ? AND tokenId = 0 AND day = UTC_DATE()',
      [id]
    )
  ]);
  if (!row) throw new HttpError(404, 'API user not found');
  const live = liveUsage();
  return {
    user: toUser(
      row,
      tokens.filter((t) => !t.revokedAt).map((t) => t.id)
    ),
    tokens: tokens.map((token) => ({
      ...token,
      createdAt: iso(token.createdAt)!,
      lastUsedAt: iso(token.lastUsedAt),
      revokedAt: iso(token.revokedAt),
      requestsToday: token.requestsToday ?? 0,
      requestsThisMinute: live.get(`t${token.id}`)?.minute ?? 0
    })),
    usage,
    websiteRequestsToday: website?.requests ?? 0,
    websiteRequestsThisMinute: live.get(`u${id}`)?.minute ?? 0
  };
};

export interface ApiUserInput {
  name?: string;
  email?: string | null;
  note?: string | null;
  admin?: boolean;
  enabled?: boolean;
  requestsPerMinute?: number;
  requestsPerDay?: number;
}

// Checks the fields that are present and returns them as column values
export const validateApiUser = (input: ApiUserInput, anonymous: boolean) => {
  const values: Record<string, unknown> = {};
  if (input.name !== undefined && !anonymous) {
    const name = String(input.name).trim();
    if (name.length < 2 || name.length > 255)
      throw new HttpError(400, 'The name must be 2 to 255 characters');
    values.name = name;
  }
  if (input.email !== undefined && !anonymous) {
    // Matched to the address of users who sign in on the website
    const email = input.email ? String(input.email).trim().toLowerCase() : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new HttpError(400, 'Invalid email');
    values.email = email;
  }
  if (input.note !== undefined)
    values.note = input.note ? String(input.note).slice(0, 2000) : null;
  for (const flag of ['enabled', 'admin'] as const) {
    if (input[flag] === undefined || (flag === 'admin' && anonymous)) continue;
    if (typeof input[flag] !== 'boolean')
      throw new HttpError(400, `${flag} must be true or false`);
    values[flag] = input[flag];
  }
  for (const limit of ['requestsPerMinute', 'requestsPerDay'] as const) {
    if (input[limit] !== undefined) {
      const value = Number(input[limit]);
      if (!Number.isInteger(value) || value < 1 || value > 10_000_000)
        throw new HttpError(
          400,
          `${limit} must be a whole number from 1 to 10000000`
        );
      values[limit] = value;
    }
  }
  return values;
};

// Email addresses are unique, they decide the limits of signed in users
export const rethrowDuplicateEmail = (e: unknown): never => {
  if ((e as { code?: string }).code === 'ER_DUP_ENTRY')
    throw new HttpError(409, 'Another user has that email address');
  throw e;
};

export const createToken = async (
  userId: number,
  name: string | null,
  admin: AdminUser
) => {
  const { token, prefix, hash } = generateToken();
  await adminQuery(
    'INSERT INTO apiTokens (userId, name, prefix, hash, createdAt, createdBy) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), ?)',
    [userId, name?.trim().slice(0, 255) || null, prefix, hash, admin.email]
  );
  invalidateAccessCache();
  return token;
};
