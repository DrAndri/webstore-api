import { withAdmin } from '../../../../utils/admin/api';
import { adminQuery } from '../../../../utils/admin/db';
import { FIELD_ERRORS, TrendRow } from '../../../../utils/admin/types';

// Finished scans per day and store
export const GET = withAdmin(async (request) => {
  const params = request.nextUrl.searchParams;
  const days = Math.min(Math.max(Number(params.get('days')) || 30, 1), 365);
  const mode = params.get('mode');
  const storeId = params.get('storeId');
  const conditions = [
    "j.status IN ('succeeded', 'failed')",
    'j.queuedAt >= UTC_TIMESTAMP() - INTERVAL ? DAY'
  ];
  const values: unknown[] = [days];
  if (mode === 'crawler' || mode === 'list') {
    conditions.push('j.mode = ?');
    values.push(mode);
  } else conditions.push("j.mode <> 'test'");
  if (storeId) {
    conditions.push('j.storeId = ?');
    values.push(Number(storeId));
  }
  return adminQuery<TrendRow[]>(
    `SELECT DATE_FORMAT(COALESCE(j.startedAt, j.queuedAt), '%Y-%m-%d') AS day, j.storeId,
       COUNT(*) AS jobs, SUM(j.status = 'failed') AS failedJobs,
       SUM(j.totalRequests) AS totalRequests, SUM(j.totalProcessed) AS totalProcessed,
       SUM(j.totalErrored) AS totalErrored,
       ${FIELD_ERRORS.map((f) => `SUM(j.${f}) AS ${f}`).join(', ')}
     FROM scrapeJobs j WHERE ${conditions.join(' AND ')}
     GROUP BY day, j.storeId ORDER BY day`,
    values
  );
});
