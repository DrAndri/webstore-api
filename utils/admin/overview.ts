import { TFunction } from 'i18next';
import { adminQuery, parseJsonColumn } from './db';
import { describeCron } from './cron';
import { listConfigs } from './github';
import {
  FIELD_ERRORS,
  Health,
  Job,
  LoadedStoreConfig,
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
  j.totalProcessed, j.totalErrored, j.pendingRequests, ${FIELD_ERRORS.map((f) => `j.${f}`).join(', ')}, j.errorMessage, j.testUrl`;

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

// Compares the last scan of a store to its earlier scans, so a store that never
// has a brand is not flagged but one whose brand selector broke is. The reasons
// are in the language of t.
export const computeHealth = (
  t: TFunction<'admin'>,
  store: StoreRow,
  finishedJobs: Job[],
  hasConfig: boolean | undefined,
  configError: string | undefined,
  crawlIntervalMs: number | undefined
): Health => {
  if (!store.scraperEnabled) return { level: 'disabled', reasons: [] };
  const errors: string[] = [];
  const warnings: string[] = [];

  if (hasConfig === false) errors.push(t('healthReasons.noConfig'));
  if (configError)
    errors.push(t('healthReasons.configError', { error: configError }));

  const last = finishedJobs[0];
  if (!last)
    return {
      level: errors.length ? 'error' : 'unknown',
      reasons: [...errors, t('healthReasons.neverScanned')]
    };
  if (last.status === 'failed')
    errors.push(
      t('healthReasons.lastFailed', {
        error: last.errorMessage ?? t('healthReasons.unknownError')
      })
    );

  const crawls = finishedJobs.filter(
    (job) => job.mode === 'crawler' && job.status === 'succeeded'
  );
  const lastCrawl = crawls[0];
  const earlierCrawls = crawls.slice(1, 6);
  if (lastCrawl) {
    if (lastCrawl.totalProcessed === 0)
      errors.push(t('healthReasons.noProducts'));
    else if (earlierCrawls.length > 0) {
      const usual = median(earlierCrawls.map((job) => job.totalProcessed));
      if (lastCrawl.totalProcessed < usual * 0.5)
        warnings.push(
          t('healthReasons.productsDropped', {
            usual: Math.round(usual),
            found: lastCrawl.totalProcessed
          })
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
          sameMode.length
            ? t('healthReasons.fieldErrorsRoseFrom', {
                errors: t(`fieldErrors.${field}`),
                rate: percent(rate),
                usual: percent(usual)
              })
            : t('healthReasons.fieldErrorsRose', {
                errors: t(`fieldErrors.${field}`),
                rate: percent(rate)
              })
        );
    }
    if (lastSucceeded.totalRequests > 0) {
      const failedRate =
        lastSucceeded.totalErrored / lastSucceeded.totalRequests;
      if (failedRate > 0.1)
        warnings.push(
          t('healthReasons.pagesFailed', { rate: percent(failedRate) })
        );
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
        ? t('healthReasons.noCrawlSince', {
            date: lastCrawl.finishedAt?.slice(0, 10)
          })
        : t('healthReasons.noCrawlYet')
    );

  return {
    level: errors.length ? 'error' : warnings.length ? 'warning' : 'ok',
    reasons: [...errors, ...warnings]
  };
};

// The scan schedules of every store, or of one store. t is for the errors of
// invalid cron expressions. The overview only needs the next two runs, the
// time of the next one and the interval of the full crawls.
export const getSchedules = async (
  t: TFunction<'admin'>,
  storeId?: number
): Promise<Schedule[]> => {
  const rows = await adminQuery<Record<string, unknown>[]>(
    `SELECT storeId, mode, cron, enabled, updatedAt, updatedBy, lastRunAt, lastError FROM storeSchedules
     ${storeId === undefined ? '' : 'WHERE storeId = ?'} ORDER BY storeId, FIELD(mode, 'crawler', 'list')`,
    storeId === undefined ? [] : [storeId]
  );
  return rows.map((row) => ({
    storeId: row.storeId as number,
    mode: row.mode as Schedule['mode'],
    cron: row.cron as string,
    enabled: !!row.enabled,
    updatedAt: toIso(row.updatedAt as Date | null),
    updatedBy: row.updatedBy as string | null,
    lastRunAt: toIso(row.lastRunAt as Date | null),
    lastError: row.lastError as string | null,
    ...describeCron(row.cron as string, t, 2)
  }));
};

// The time between two full crawls of a store, undefined when they are not
// scheduled
const crawlInterval = (schedules: Schedule[]) => {
  const crawl = schedules.find((s) => s.mode === 'crawler');
  return crawl?.enabled && crawl.nextRuns.length >= 2
    ? Date.parse(crawl.nextRuns[1]) - Date.parse(crawl.nextRuns[0])
    : undefined;
};

// The health reasons and cron errors are in the language of t
export const getOverview = async (t: TFunction<'admin'>): Promise<Overview> => {
  const [stores, recentJobs, activeJobs, statusRows, schedules, configShas] =
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
        'SELECT startedAt, lastSeenAt, hostname, concurrency, configSource, configCommit, configLoadedAt, configErrors, storeConfigs FROM scraperStatus WHERE id = 1'
      ),
      getSchedules(t),
      listConfigs()
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
        configLoadedAt: toIso(status.configLoadedAt as Date | null),
        configErrors:
          parseJsonColumn<ScraperInfo['configErrors']>(status.configErrors) ??
          [],
        storeConfigs:
          parseJsonColumn<Record<string, LoadedStoreConfig>>(
            status.storeConfigs
          ) ?? {}
      }
    : null;
  // A scraper that reads the configs in its image can not reload the ones on
  // GitHub, and one that does not report them yet has not been updated
  const comparesToGithub =
    !!scraper?.configSource?.startsWith('github:') &&
    status?.storeConfigs != null;

  const jobs = recentJobs.map(toJob);
  const active = activeJobs.map(toJob);

  const storeStatuses: StoreStatus[] = stores.map((store) => {
    const finished = jobs
      .filter((job) => job.storeId === store.id)
      .sort((a, b) => b.id - a.id);
    const configError = scraper?.configErrors.find(
      (e) => e.file === `${store.id}.jsonc`
    )?.message;
    const fileSha = configShas?.get(store.id);
    const hasConfig = configShas ? fileSha !== undefined : undefined;
    const loadedConfig = scraper?.storeConfigs[store.id] ?? null;
    const storeSchedules = schedules.filter((s) => s.storeId === store.id);
    return {
      id: store.id,
      name: store.name,
      scraperEnabled: !!store.scraperEnabled,
      apiEnabled: !!store.apiEnabled,
      createdDate: toDay(store.createdDate),
      lastScanDate: toDay(store.lastScanDate),
      hasConfig: hasConfig ?? true,
      loadedConfig,
      configReloadNeeded:
        comparesToGithub &&
        fileSha !== undefined &&
        loadedConfig?.sha !== fileSha,
      health: computeHealth(
        t,
        store,
        finished,
        hasConfig,
        configError,
        crawlInterval(storeSchedules)
      ),
      schedules: storeSchedules,
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
    stores: storeStatuses,
    activeJobs: active,
    configsAvailable: configShas !== undefined
  };
};
