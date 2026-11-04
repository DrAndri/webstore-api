import { createHash } from 'node:crypto';
import { HttpError } from './api';
import { LOG_LEVELS, LogEntry, LogLevel } from './types';

// The scraper logs with winston to Loki. Its own log is in the stream
// app="webstore-scraper", each line is JSON with the label of the module that
// logged it. The log of a scan has the labels store, jobId and page, page is
// the url the line is about or "Scan log" for the summary.

// No bigint literals, the compile target is older than ES2020
const NS_PER_MS = BigInt(1_000_000);
const NS_PER_S = BigInt(1_000_000_000);

interface LokiStream {
  stream: Record<string, string>;
  values: [ts: string, line: string][];
}

const lokiFetch = async <T>(
  path: string,
  params: Record<string, string>
): Promise<T> => {
  const base = process.env.LOKI_URL?.replace(/\/+$/, '');
  if (!base) throw new HttpError(503, { key: 'loki.notConfigured' });
  const headers: Record<string, string> = {};
  if (process.env.LOKI_USERNAME)
    headers.Authorization = `Basic ${Buffer.from(
      `${process.env.LOKI_USERNAME}:${process.env.LOKI_PASSWORD ?? ''}`
    ).toString('base64')}`;
  let response: Response;
  try {
    response = await fetch(
      `${base}/loki/api/v1/${path}?${new URLSearchParams(params)}`,
      { headers, cache: 'no-store', signal: AbortSignal.timeout(20000) }
    );
  } catch (e) {
    console.error('Loki request failed', e);
    throw new HttpError(502, { key: 'loki.unreachable' });
  }
  if (!response.ok) {
    // Loki explains rejected queries, e.g. a time range over its limit
    const text = (await response.text()).trim().slice(0, 300);
    throw new HttpError(502, {
      key: 'loki.failed',
      values: { status: response.status, text }
    });
  }
  return ((await response.json()) as { data: T }).data;
};

// LogQL strings take the same escapes as JSON strings
const quote = (value: string) => JSON.stringify(value);
const regexEscape = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const anyOf = (values: string[]) => quote(values.map(regexEscape).join('|'));

export type LogSource =
  | { source: 'app' }
  // Lines without a jobId are from before the scraper labelled them, they are
  // matched by the store and the time of the scan
  | { source: 'scan'; store: string; jobId: number };

export interface LogFilters {
  levels: LogLevel[];
  // The module label for the app log, the page for a scan
  labels: string[];
  search: string;
}

const selector = (from: LogSource, filters: LogFilters) => {
  const matchers =
    from.source === 'app'
      ? ['app="webstore-scraper"']
      : [`store=${quote(from.store)}`, `jobId=~${quote(`|${from.jobId}`)}`];
  if (filters.levels.length > 0 && filters.levels.length < LOG_LEVELS.length)
    matchers.push(`level=~${anyOf(filters.levels)}`);
  if (from.source === 'scan' && filters.labels.length > 0)
    matchers.push(`page=~${anyOf(filters.labels)}`);
  return `{${matchers.join(', ')}}`;
};

export const logQuery = (from: LogSource, filters: LogFilters) => {
  let query = selector(from, filters);
  // Line filters before the parser, they are cheaper
  if (filters.search)
    query += ` |~ ${quote(`(?i)${regexEscape(filters.search)}`)}`;
  if (from.source === 'app' && filters.labels.length > 0)
    query += ` | json module="label" | module=~${anyOf(filters.labels)}`;
  return query;
};

const parseLine = (line: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
  } catch {
    // Not JSON, shown as it is
  }
  return { message: line };
};

// Labels Loki adds or the viewer shows elsewhere
const HIDDEN_LABELS = new Set([
  'app',
  'level',
  'detected_level',
  'level_extracted',
  'service_name',
  'module'
]);

const toEntry = (
  stream: Record<string, string>,
  ts: string,
  line: string
): LogEntry => {
  const { level, label, message, ...fields } = parseLine(line);
  const labels = Object.fromEntries(
    Object.entries(stream).filter(([key]) => !HIDDEN_LABELS.has(key))
  );
  // Winston's stack is in the line and in the structured metadata
  delete labels.stack;
  const { page, ...otherLabels } = labels;
  return {
    // The same line can come back from overlapping queries, the key finds it
    key: createHash('sha1')
      .update(`${ts}\n${JSON.stringify(stream)}\n${line}`)
      .digest('base64url')
      .slice(0, 16),
    ts,
    time: new Date(Number(BigInt(ts) / NS_PER_MS)).toISOString(),
    level: String(level ?? stream.level ?? 'info'),
    label: typeof label === 'string' ? label : undefined,
    page,
    message: typeof message === 'string' ? message : JSON.stringify(message),
    fields: { ...fields, ...otherLabels }
  };
};

export const toNs = (ms: number) => BigInt(Math.floor(ms)) * NS_PER_MS;

// Newest first. Loki's start is inclusive and its end exclusive.
export const queryLogs = async (
  query: string,
  start: bigint,
  end: bigint,
  limit: number,
  direction: 'backward' | 'forward'
): Promise<LogEntry[]> => {
  const data = await lokiFetch<{ result: LokiStream[] }>('query_range', {
    query,
    start: start.toString(),
    end: end.toString(),
    limit: String(limit),
    direction
  });
  const entries = data.result.flatMap((stream) =>
    stream.values.map(([ts, line]) => toEntry(stream.stream, ts, line))
  );
  return entries.sort((a, b) =>
    a.ts === b.ts ? 0 : BigInt(a.ts) > BigInt(b.ts) ? -1 : 1
  );
};

// The module labels in the app log, with how many lines each has
export const appLabelCounts = async (
  start: bigint,
  end: bigint
): Promise<{ value: string; count: number }[]> => {
  const seconds = Math.max(1, Number((end - start) / NS_PER_S));
  const data = await lokiFetch<{
    result: { metric: { module?: string }; value: [number, string] }[];
  }>('query', {
    query: `sum by (module) (count_over_time({app="webstore-scraper"} | json module="label" [${seconds}s]))`,
    time: end.toString()
  });
  return data.result
    .filter((row) => row.metric.module)
    .map((row) => ({ value: row.metric.module!, count: Number(row.value[1]) }))
    .sort((a, b) => b.count - a.count);
};

// The pages in the log of a scan
export const scanPages = (
  from: Extract<LogSource, { source: 'scan' }>,
  start: bigint,
  end: bigint
) =>
  lokiFetch<string[] | undefined>('label/page/values', {
    query: selector(from, { levels: [], labels: [], search: '' }),
    start: start.toString(),
    end: end.toString()
  }).then((values) => values ?? []);
