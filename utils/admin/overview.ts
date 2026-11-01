import { adminQuery, parseJsonColumn } from './db';
import { describeCron } from './cron';
import { listConfigIds } from './github';
import {
  FIELD_ERRORS,
  Health,
  Job,
  Overview,
  Schedule,
  ScraperInfo,
  StoreStatus
} from './types';

// The scraper reports every 5 seconds
const SCRAPER_OFFLINE_AFTER_MS = 60 * 1000;
const STALE_WITHOUT_SCHEDULE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export const JOB_COLUMNS = `j.id, j.storeId, s.name AS storeName, j.mode, j.source, j.status, j.cancelRequested,
  j.requestedBy, j.queuedAt, j.startedAt, j.finishedAt, j.heartbeatAt, j.configCommit, j.totalRequests,
  j.totalProcessed, j.totalErrored, ${FIELD_ERRORS.map((f) => `j.${f}`).join(', ')}, j.errorMessage, j.testUrl`;

interface StoreRow {
  id: number;
  name: string;
  scraperEnabled: number;
  apiEnabled: number;
  createdDate: Date | null;
  lastScanDate: Date | null;
}

const toIso = (value: Date | string | null) =>
  value instanceof Date ? value.toISOString() : value;

const toDay = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : null;

export const toJob = (row: Record<string, unknown>): Job =>
  ({
    ...row,
    cancelRequested: !!row.cancelRequested,
    queuedAt: toIso(row.queuedAt as Date),
    startedAt: toIso(row.startedAt as Date | null),
    finishedAt: toIso(row.finishedAt as Date | null),
    heartbeatAt: toIso(row.heartbeatAt as Date | null),
    ...('updateResult' in row
      ? { updateResult: parseJsonColumn(row.updateResult) }
      : {}),
    ...('testResult' in row
      ? { testResult: parseJsonColumn(row.testResult) }
      : {})
  }) as Job;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

const FIELD_NAMES: Record<string, string> = {
  nameError: 'Name',
  brandError: 'Brand',
  imageError: 'Image',
  descriptionError: 'Description',
  inStockError: 'Stock',
  categoriesError: 'Categories',
  attributeError: 'Attributes'
};

// Compares the last scan of a store to its earlier scans, so a store that never
// has a brand is not flagged but one whose brand selector broke is
export const computeHealth = (
  store: StoreRow,
  finishedJobs: Job[],
  hasConfig: boolean | undefined,
  configError: string | undefined,
  crawlIntervalMs: number | undefined
): Health => {
  if (!store.scraperEnabled) return { level: 'disabled', reasons: [] };
  const errors: string[] = [];
  const warnings: string[] = [];

  if (hasConfig === false) errors.push('No config file in the repository');
  if (configError) errors.push(`The config does not load: ${configError}`);

  const last = finishedJobs[0];
  if (!last)
    return {
      level: errors.length ? 'error' : 'unknown',
      reasons: [...errors, 'Never scanned']
    };
  if (last.status === 'failed')
    errors.push(`Last scan failed: ${last.errorMessage ?? 'unknown error'}`);

  const crawls = finishedJobs.filter(
    (job) => job.mode === 'crawler' && job.status === 'succeeded'
  );
  const lastCrawl = crawls[0];
  const earlierCrawls = crawls.slice(1, 6);
  if (lastCrawl) {
    if (lastCrawl.totalProcessed === 0)
      errors.push('The last full crawl found no products');
    else if (earlierCrawls.length > 0) {
      const usual = median(earlierCrawls.map((job) => job.totalProcessed));
      if (lastCrawl.totalProcessed < usual * 0.5)
        warnings.push(
          `Products found dropped from about ${Math.round(usual)} to ${lastCrawl.totalProcessed}`
        );
    }
  }

  // Field errors and failed pages of the last successful scan against the usual rate
  const lastSucceeded = finishedJobs.find((job) => job.status === 'succeeded');
  if (lastSucceeded && lastSucceeded.totalProcessed > 0) {
    const sameMode = finishedJobs
      .filter(
        (job) =>
          job.mode === lastSucceeded.mode &&
          job.status === 'succeeded' &&
          job.totalProcessed > 0
      )
      .slice(1, 6);
    for (const field of FIELD_ERRORS) {
      const rate = lastSucceeded[field] / lastSucceeded.totalProcessed;
      const usual = sameMode.length
        ? median(sameMode.map((job) => job[field] / job.totalProcessed))
        : 0;
      if (rate - usual > 0.2)
        warnings.push(
          `${FIELD_NAMES[field]} errors rose to ${percent(rate)} of products${sameMode.length ? ` from ${percent(usual)}` : ''}`
        );
    }
    if (lastSucceeded.totalRequests > 0) {
      const failedRate =
        lastSucceeded.totalErrored / lastSucceeded.totalRequests;
      if (failedRate > 0.1)
        warnings.push(`${percent(failedRate)} of product pages failed`);
    }
  }

  const staleAfterMs = crawlIntervalMs
    ? crawlIntervalMs * 2
    : STALE_WITHOUT_SCHEDULE_DAYS * DAY_MS;
  const lastCrawlAt = lastCrawl?.finishedAt
    ? Date.parse(lastCrawl.finishedAt)
    : 0;
  if (Date.now() - lastCrawlAt > staleAfterMs)
    warnings.push(
      lastCrawl
        ? `No full crawl since ${lastCrawl.finishedAt?.slice(0, 10)}`
        : 'No successful full crawl yet'
    );

  return {
    level: errors.length ? 'error' : warnings.length ? 'warning' : 'ok',
    reasons: [...errors, ...warnings]
  };
};

export const getSchedules = async (): Promise<Schedule[]> => {
  const rows = await adminQuery<Record<string, unknown>[]>(
    "SELECT mode, cron, enabled, updatedAt, updatedBy, lastRunAt, lastError FROM scraperSchedules ORDER BY FIELD(mode, 'crawler', 'list')"
  );
  return rows.map((row) => ({
    mode: row.mode as Schedule['mode'],
    cron: row.cron as string,
    enabled: !!row.enabled,
    updatedAt: toIso(row.updatedAt as Date | null),
    updatedBy: row.updatedBy as string | null,
    lastRunAt: toIso(row.lastRunAt as Date | null),
    lastError: row.lastError as string | null,
    ...describeCron(row.cron as string)
  }));
};

export const getOverview = async (): Promise<Overview> => {
  const [stores, recentJobs, activeJobs, statusRows, schedules, configIds] =
    await Promise.all([
      adminQuery<StoreRow[]>(
        'SELECT id, name, scraperEnabled, apiEnabled, createdDate, lastScanDate FROM stores ORDER BY name'
      ),
      // The last finished jobs of each store
      adminQuery<Record<string, unknown>[]>(
        `SELECT * FROM (
           SELECT ${JOB_COLUMNS}, ROW_NUMBER() OVER (PARTITION BY j.storeId ORDER BY j.id DESC) AS rowNumber
           FROM scrapeJobs j JOIN stores s ON s.id = j.storeId
           WHERE j.mode <> 'test' AND j.status IN ('succeeded', 'failed', 'cancelled')
         ) recent WHERE rowNumber <= 12`
      ),
      adminQuery<Record<string, unknown>[]>(
        `SELECT ${JOB_COLUMNS} FROM scrapeJobs j LEFT JOIN stores s ON s.id = j.storeId
         WHERE j.status IN ('queued', 'running') ORDER BY j.id`
      ),
      adminQuery<Record<string, unknown>[]>(
        'SELECT startedAt, lastSeenAt, hostname, concurrency, configSource, configCommit, configErrors FROM scraperStatus WHERE id = 1'
      ),
      getSchedules(),
      listConfigIds()
    ]);

  const status = statusRows[0];
  const scraper: ScraperInfo | null = status
    ? {
        online:
          Date.now() - (status.lastSeenAt as Date).getTime() <
          SCRAPER_OFFLINE_AFTER_MS,
        startedAt: toIso(status.startedAt as Date) as string,
        lastSeenAt: toIso(status.lastSeenAt as Date) as string,
        hostname: status.hostname as string | null,
        concurrency: status.concurrency as number | null,
        configSource: status.configSource as string | null,
        configCommit: status.configCommit as string | null,
        configErrors:
          parseJsonColumn<ScraperInfo['configErrors']>(status.configErrors) ??
          []
      }
    : null;

  const crawlSchedule = schedules.find((s) => s.mode === 'crawler');
  const crawlIntervalMs =
    crawlSchedule?.enabled && crawlSchedule.nextRuns.length >= 2
      ? Date.parse(crawlSchedule.nextRuns[1]) -
        Date.parse(crawlSchedule.nextRuns[0])
      : undefined;

  const jobs = recentJobs.map(toJob);
  const active = activeJobs.map(toJob);

  const storeStatuses: StoreStatus[] = stores.map((store) => {
    const finished = jobs
      .filter((job) => job.storeId === store.id)
      .sort((a, b) => b.id - a.id);
    const configError = scraper?.configErrors.find(
      (e) => e.file === `${store.id}.jsonc`
    )?.message;
    const hasConfig = configIds ? configIds.has(store.id) : undefined;
    return {
      id: store.id,
      name: store.name,
      scraperEnabled: !!store.scraperEnabled,
      apiEnabled: !!store.apiEnabled,
      createdDate: toDay(store.createdDate),
      lastScanDate: toDay(store.lastScanDate),
      hasConfig: hasConfig ?? true,
      health: computeHealth(
        store,
        finished,
        hasConfig,
        configError,
        crawlIntervalMs
      ),
      activeJob:
        active.find(
          (job) => job.storeId === store.id && job.status === 'running'
        ) ?? active.find((job) => job.storeId === store.id),
      lastJob: finished[0],
      lastCrawl: finished.find(
        (job) => job.mode === 'crawler' && job.status === 'succeeded'
      )
    };
  });

  return {
    scraper,
    schedules,
    stores: storeStatuses,
    activeJobs: active,
    configsAvailable: configIds !== undefined
  };
};
