import { HttpError, withAdmin } from '../../../../utils/admin/api';
import { logQuery, queryLogs } from '../../../../utils/admin/loki';
import { parseNs, resolveLogSource } from '../../../../utils/admin/logs';
import {
  LOG_LEVELS,
  LogLevel,
  LogsResponse
} from '../../../../utils/admin/types';

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1000;

// A page of the app log or the log of a scan, newest first.
// before: the lines up to this timestamp, to load older lines.
// after: the lines from this timestamp on, to follow the log live.
// Both are inclusive, so lines logged in the same millisecond are not lost
// between pages. The entry keys find the lines that come back twice.
export const GET = withAdmin(async (request): Promise<LogsResponse> => {
  const params = request.nextUrl.searchParams;
  const resolved = await resolveLogSource(params);

  const levels = (params.get('levels') ?? '')
    .split(',')
    .filter(Boolean) as LogLevel[];
  if (levels.some((level) => !LOG_LEVELS.includes(level)))
    throw new HttpError(400, 'Invalid level');
  const labels = params.getAll('label').filter(Boolean);
  if (labels.length > 50 || labels.some((label) => label.length > 2000))
    throw new HttpError(400, 'Too many labels');
  const search = (params.get('search') ?? '').trim();
  if (search.length > 200) throw new HttpError(400, 'The search is too long');
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(params.get('limit')) || DEFAULT_LIMIT)
  );

  const query = logQuery(resolved.from, { levels, labels, search });
  if (resolved.note)
    return { entries: [], query, hasMore: false, note: resolved.note };

  const before = parseNs(params.get('before'), 'before');
  const after = parseNs(params.get('after'), 'after');
  let { start, end } = resolved;
  if (after !== undefined && after > start) start = after;
  if (before !== undefined && before + BigInt(1) < end)
    end = before + BigInt(1);
  if (start >= end) return { entries: [], query, hasMore: false };

  const entries = await queryLogs(
    query,
    start,
    end,
    limit,
    after === undefined ? 'backward' : 'forward'
  );
  return {
    entries,
    query,
    hasMore: after === undefined && entries.length >= limit
  };
});
