import { HttpError, readJson, withAdmin } from '../../../../utils/admin/api';
import { adminQuery } from '../../../../utils/admin/db';
import { JOB_COLUMNS, toJob } from '../../../../utils/admin/overview';
import { ScheduledMode } from '../../../../utils/admin/types';
import { UpsertResult } from 'mariadb';

const MODES = ['crawler', 'list', 'test'];
const STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'];

// Job history, newest first
export const GET = withAdmin(async (request) => {
  const params = request.nextUrl.searchParams;
  const conditions: string[] = [];
  const values: unknown[] = [];
  const storeId = params.get('storeId');
  if (storeId) {
    conditions.push('j.storeId = ?');
    values.push(Number(storeId));
  }
  const mode = params.get('mode');
  if (mode && MODES.includes(mode)) {
    conditions.push('j.mode = ?');
    values.push(mode);
  } else conditions.push("j.mode <> 'test'");
  const status = params.get('status');
  if (status && STATUSES.includes(status)) {
    conditions.push('j.status = ?');
    values.push(status);
  }
  const pageSize = Math.min(
    Math.max(Number(params.get('pageSize')) || 50, 1),
    200
  );
  const page = Math.max(Number(params.get('page')) || 1, 1);
  const where = conditions.join(' AND ');

  const [rows, [{ total }]] = await Promise.all([
    adminQuery<Record<string, unknown>[]>(
      `SELECT ${JOB_COLUMNS}, j.updateResult FROM scrapeJobs j LEFT JOIN stores s ON s.id = j.storeId
       WHERE ${where} ORDER BY j.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize]
    ),
    adminQuery<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM scrapeJobs j WHERE ${where}`,
      values
    )
  ]);
  return { jobs: rows.map(toJob), total };
});

// Queues scans of the given stores, or of all enabled stores
export const POST = withAdmin(async (request, { user }) => {
  const body = await readJson<{
    storeIds?: number[] | 'all';
    mode?: ScheduledMode;
  }>(request);
  if (body.mode !== 'crawler' && body.mode !== 'list')
    throw new HttpError(400, 'mode must be crawler or list');

  let condition: string;
  const values: unknown[] = [];
  if (body.storeIds === 'all') condition = 's.scraperEnabled = 1';
  else if (
    Array.isArray(body.storeIds) &&
    body.storeIds.length > 0 &&
    body.storeIds.every((id) => Number.isInteger(id))
  ) {
    condition = 's.id IN (?)';
    values.push(body.storeIds);
  } else throw new HttpError(400, 'Select at least one store');

  const result = await adminQuery<UpsertResult>(
    `INSERT INTO scrapeJobs (storeId, mode, source, status, requestedBy, queuedAt)
     SELECT s.id, ?, 'manual', 'queued', ?, UTC_TIMESTAMP() FROM stores s
     WHERE ${condition} AND NOT EXISTS (
       SELECT 1 FROM scrapeJobs j WHERE j.storeId = s.id AND j.mode = ? AND j.status IN ('queued', 'running')
     )`,
    [body.mode, user.email, ...values, body.mode]
  );
  return { queued: result.affectedRows };
});
