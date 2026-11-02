import { HttpError, parseId } from './api';
import { adminQuery } from './db';
import { LogSource, toNs } from './loki';

const MAX_RANGE_MS = 30 * 24 * 3600 * 1000;

// Lines are timestamped when they are logged, the margins cover the clocks of
// the scraper and the database disagreeing a little
const SCAN_START_MARGIN_MS = 60 * 1000;
const SCAN_END_MARGIN_MS = 2 * 60 * 1000;

export interface ResolvedSource {
  from: LogSource;
  start: bigint;
  end: bigint;
  note?: string;
}

const parseMs = (value: string | null, name: string) => {
  if (value === null || value === '') return undefined;
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0)
    throw new HttpError(400, `Invalid ${name}`);
  return ms;
};

// Which log the request is for and the time range it covers: the range given
// for the app log, the time the scan ran for a scan
export const resolveLogSource = async (
  params: URLSearchParams
): Promise<ResolvedSource> => {
  const source = params.get('source') ?? 'app';
  if (source === 'app') {
    const end = parseMs(params.get('end'), 'end') ?? Date.now();
    const start = parseMs(params.get('start'), 'start') ?? end - 3600 * 1000;
    if (start >= end) throw new HttpError(400, 'start must be before end');
    if (end - start > MAX_RANGE_MS)
      throw new HttpError(400, 'The time range can be 30 days at most');
    return { from: { source: 'app' }, start: toNs(start), end: toNs(end) };
  }
  if (source !== 'scan') throw new HttpError(400, 'Invalid source');

  const jobId = parseId(params.get('job'), 'job');
  const [job] = await adminQuery<
    {
      mode: string;
      startedAt: Date | null;
      finishedAt: Date | null;
      storeName: string | null;
    }[]
  >(
    `SELECT j.mode, j.startedAt, j.finishedAt, s.name AS storeName
     FROM scrapeJobs j LEFT JOIN stores s ON s.id = j.storeId WHERE j.id = ?`,
    [jobId]
  );
  if (!job) throw new HttpError(404, 'Job not found');
  // Tests are logged under a store named after the job
  const store = job.mode === 'test' ? `test-${jobId}` : job.storeName;
  if (!store) throw new HttpError(404, 'The store of the job no longer exists');
  const from: LogSource = { source: 'scan', store, jobId };
  if (!job.startedAt)
    return {
      from,
      start: BigInt(0),
      end: BigInt(0),
      note: 'The scan has not started yet'
    };
  const start = job.startedAt.getTime() - SCAN_START_MARGIN_MS;
  const end = job.finishedAt
    ? job.finishedAt.getTime() + SCAN_END_MARGIN_MS
    : Date.now() + 1000;
  return {
    from,
    start: toNs(start),
    end: toNs(Math.min(end, start + MAX_RANGE_MS))
  };
};

// Loki timestamps are nanoseconds, too large for a number
export const parseNs = (value: string | null, name: string) => {
  if (value === null || value === '') return undefined;
  if (!/^\d{1,20}$/.test(value)) throw new HttpError(400, `Invalid ${name}`);
  return BigInt(value);
};
