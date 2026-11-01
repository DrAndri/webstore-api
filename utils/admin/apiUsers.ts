import { generateToken, invalidateAccessCache, liveUsage } from '../apiAccess';
import { HttpError } from './api';
import { adminQuery } from './db';
import { AdminUser } from './session';
import { ApiToken, ApiUser, ApiUserDetails } from './types';

interface UserRow {
  id: number;
  name: string;
  email: string | null;
  note: string | null;
  anonymous: number;
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

// The database counts are written every few seconds, the minute is only in memory
const liveForUser = (
  userId: number,
  anonymous: boolean,
  tokenIds: number[]
) => {
  const live = liveUsage();
  let minute = 0;
  for (const [key, usage] of live) {
    if (
      anonymous ? key.startsWith('a') : tokenIds.includes(Number(key.slice(1)))
    )
      minute += usage.minute;
  }
  return minute;
};

const USER_COLUMNS = `u.id, u.name, u.email, u.note, u.anonymous, u.enabled, u.requestsPerMinute,
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
  const [[row], tokens, usage] = await Promise.all([
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
    usage
  };
};

export interface ApiUserInput {
  name?: string;
  email?: string | null;
  note?: string | null;
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
    const email = input.email ? String(input.email).trim() : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new HttpError(400, 'Invalid email');
    values.email = email;
  }
  if (input.note !== undefined)
    values.note = input.note ? String(input.note).slice(0, 2000) : null;
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean')
      throw new HttpError(400, 'enabled must be true or false');
    values.enabled = input.enabled;
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

export const createToken = async (
  userId: number,
  name: string | null,
  admin: AdminUser
) => {
  const { token, prefix, hash } = generateToken();
  await adminQuery(
    'INSERT INTO apiTokens (userId, name, prefix, hash, createdAt, createdBy) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), ?)',
    [userId, name?.trim().slice(0, 255) || null, prefix, hash, admin.login]
  );
  invalidateAccessCache();
  return token;
};
