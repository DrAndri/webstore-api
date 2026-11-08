// Types shared by the admin api routes and pages

// index reindexes everything in the database to Solr and schema syncs the
// Solr schemas, they have no store
export type JobMode = 'crawler' | 'list' | 'test' | 'index' | 'schema';
export type ScheduledMode = Exclude<JobMode, 'test' | 'index' | 'schema'>;
export type SolrJobMode = Extract<JobMode, 'index' | 'schema'>;

// The schedules a new store gets, turned off. Evaluated in UTC.
export const DEFAULT_SCHEDULES: Record<ScheduledMode, string> = {
  crawler: '0 1 * * 1',
  list: '0 4 * * *'
};

// The jobs that work on Solr instead of a store, one runs at a time
export const isSolrJob = (mode: JobMode): mode is SolrJobMode =>
  mode === 'index' || mode === 'schema';
export type JobSource = 'cron' | 'manual' | 'startup';
export type JobStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export const FIELD_ERRORS = [
  'nameError',
  'brandError',
  'imageError',
  'descriptionError',
  'inStockError',
  'categoriesError',
  'attributeError'
] as const;
export type FieldError = (typeof FIELD_ERRORS)[number];

export interface Job extends Record<FieldError, number> {
  id: number;
  storeId: number | null;
  storeName?: string;
  mode: JobMode;
  source: JobSource;
  status: JobStatus;
  cancelRequested: boolean;
  requestedBy: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
  configCommit: string | null;
  totalRequests: number;
  totalProcessed: number;
  totalErrored: number;
  // Requests in the request queue of a scan not handled yet, as of the last
  // heartbeat. Null for jobs that don't crawl and scans before it was saved.
  pendingRequests: number | null;
  errorMessage: string | null;
  updateResult?: Record<string, number> | null;
  testUrl?: string | null;
  testResult?: TestResult | null;
}

export interface TestResult {
  isProductPage?: boolean;
  product?: Record<string, unknown>;
  fieldErrors?: Record<string, string>;
  error?: string;
}

export type HealthLevel = 'ok' | 'warning' | 'error' | 'disabled' | 'unknown';

export interface Health {
  level: HealthLevel;
  reasons: string[];
}

// The config of a store as the scraper loaded it, sha is the git blob sha of
// the file
export interface LoadedStoreConfig {
  sha: string;
  commit: string | null;
  loadedAt: string;
}

export interface StoreStatus {
  id: number;
  name: string;
  scraperEnabled: boolean;
  apiEnabled: boolean;
  createdDate: string | null;
  lastScanDate: string | null;
  hasConfig: boolean;
  loadedConfig: LoadedStoreConfig | null;
  // The config on GitHub differs from the one the scraper loaded, or the
  // scraper has not loaded it, so it needs to be reloaded
  configReloadNeeded: boolean;
  health: Health;
  // The full crawl and active products schedules of the store, they run
  // while scraperEnabled is on
  schedules: Schedule[];
  activeJob?: Job;
  lastJob?: Job;
  lastCrawl?: Job;
}

export interface ScraperInfo {
  online: boolean;
  startedAt: string;
  lastSeenAt: string;
  hostname: string | null;
  concurrency: number | null;
  configSource: string | null;
  // Commit and time of the last reload of every config
  configCommit: string | null;
  configLoadedAt: string | null;
  configErrors: { file: string; message: string }[];
  // By store id
  storeConfigs: Record<string, LoadedStoreConfig>;
}

// A reload of the store configs in the scraper, storeId is null for a reload
// of every config
export type ConfigReloadStatus = 'queued' | 'succeeded' | 'failed';

export interface ConfigReload {
  id: number;
  storeId: number | null;
  status: ConfigReloadStatus;
  requestedBy: string | null;
  requestedAt: string;
  finishedAt: string | null;
  configCommit: string | null;
  errorMessage: string | null;
}

export interface CronDescription {
  valid: boolean;
  errors: string[];
  nextRuns: string[];
}

// A scan schedule of a store, a row of storeSchedules
export interface Schedule extends CronDescription {
  storeId: number;
  mode: ScheduledMode;
  cron: string;
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface Overview {
  scraper: ScraperInfo | null;
  stores: StoreStatus[];
  activeJobs: Job[];
  configsAvailable: boolean;
}

export interface TrendRow extends Record<FieldError, number> {
  day: string;
  storeId: number;
  jobs: number;
  failedJobs: number;
  totalRequests: number;
  totalProcessed: number;
  totalErrored: number;
}

export interface ConfigCommit {
  sha: string;
  message: string;
  authorName: string;
  authorLogin: string | null;
  avatarUrl: string | null;
  date: string;
  url: string;
}

export interface StoreDetails {
  store: {
    id: number;
    name: string;
    scraperEnabled: boolean;
    apiEnabled: boolean;
    // Scans of the store log every page to the scan log
    loggingEnabled: boolean;
    createdDate: string | null;
    lastScanDate: string | null;
  };
  config: { text: string; sha: string } | null;
  configPath: string;
  fileUrl: string;
  legacyHistoryUrl: string;
}

// The id the next store gets, and its config when one is already committed
export interface NextStore {
  storeId: number;
  configPath: string;
  fileUrl: string;
  config: {
    text: string;
    sha: string;
    // Without a value the file does not parse
    value?: WebshopCrawlerOptions;
    errors: string[];
  } | null;
}

// Mirrors WebshopCrawlerOptions in webstore-scraper/types/db-types.d.ts

export interface WebshopCrawlerOptions {
  storeId: number;
  type: 'httpcrawler' | 'crawler';
  startUrl: string;
  selectors: ProductSelectors;
  sanitizers?: ProductSanitizers;
  productPageIdentifier: string;
  urlWhitelist?: string[];
  urlBlacklist?: string[];
  // Query parameters kept on links before they are queued, [] removes the
  // whole query string, unset keeps all of them
  keepQueryParams?: string[];
  startUrls?: string[];
  sitemapUrls?: string[];
  productFeed?: ProductFeed;
  // Pages requested a minute, 60 when unset
  maxRequestsPerMinute?: number;
  scrollPagesToBottom?: boolean;
  menuClicker?: string;
}

export interface ProductFeed {
  url: string;
  items: string;
  productUrl: string;
  pageCount?: string;
  feedList?: ProductFeedList;
}

export interface ProductFeedList {
  url: string;
  items?: string;
}

export interface ProductSanitizers {
  sku: ProductSanitizer[];
}

export interface ProductSanitizer {
  match: string;
  replace: string;
}

export type ProductSelector =
  | {
      source: 'url';
      delimiter: string;
      index: number | 'first' | 'last';
    }
  | {
      source: 'attribute';
      selector: string;
      attribute: string;
    }
  | {
      // A dot path in the JSON text of an element, matched in the whole page
      source: 'json';
      selector: string;
      path: string;
    };

export const STRUCTURED_DATA_FIELDS = [
  'sku',
  'gtin',
  'name',
  'brand',
  'image',
  'description',
  'price',
  'inStock',
  'categories'
] as const;
export type StructuredDataField = (typeof STRUCTURED_DATA_FIELDS)[number];

export interface StructuredDataOptions {
  source: 'jsonld' | 'nextdata';
  fields?: Partial<Record<StructuredDataField, string | string[] | false>>;
  categorySplitter?: string;
}

export interface ProductSelectors {
  productPage: string;
  structuredData?: StructuredDataOptions;
  oldPrice?: string;
  listPrice?: string;
  name?: string;
  sku?: string | ProductSelector;
  image?: string;
  imageAttribute?: string;
  brand?: string;
  description?: string;
  inStock?: string;
  inStockText?: string;
  clickers?: string[];
  categories?: string;
  categorySplitter?: string;
  categoryItemLocator?: string;
  attributes?: AttributeSelectors;
}

export interface AttributeSelectors {
  attributesTable: string;
  attributeGroup?: string;
  attribute: string;
  attributeLabel: string;
  attributeValue: string;
  attributeGroupName?: string;
}

export interface ApiUserLimits {
  enabled: boolean;
  requestsPerMinute: number;
  requestsPerDay: number;
}

export interface ApiUser extends ApiUserLimits {
  id: number;
  name: string;
  // Users who sign in on the website with this address get these limits
  email: string | null;
  note: string | null;
  anonymous: boolean;
  // Can sign in to the admin interface
  admin: boolean;
  createdAt: string;
  createdBy: string | null;
  activeTokens: number;
  lastUsedAt: string | null;
  // Requests today, in the last 30 days and in the current minute
  requestsToday: number;
  rejectedToday: number;
  requests30Days: number;
  requestsThisMinute: number;
}

export interface ApiToken {
  id: number;
  name: string | null;
  prefix: string;
  createdAt: string;
  createdBy: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  requestsToday: number;
  requestsThisMinute: number;
}

export interface ApiUsageDay {
  day: string;
  requests: number;
  rejected: number;
}

export interface ApiUserDetails {
  user: ApiUser;
  tokens: ApiToken[];
  usage: ApiUsageDay[];
  // Requests made while signed in on the website
  websiteRequestsToday: number;
  websiteRequestsThisMinute: number;
}

// Winston's npm levels, most severe first
export const LOG_LEVELS = [
  'error',
  'warn',
  'info',
  'http',
  'verbose',
  'debug',
  'silly'
] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
  // Identifies the line across requests
  key: string;
  // Nanoseconds since the epoch, Loki's timestamp
  ts: string;
  time: string;
  level: string;
  // The module that logged the line, in the app log
  label?: string;
  // The page the line is about, in the log of a scan
  page?: string;
  message: string;
  // The other fields of the line and the labels of its stream
  fields: Record<string, unknown>;
}

export interface LogsResponse {
  entries: LogEntry[];
  // The LogQL query, to open the same log in Grafana
  query: string;
  // Whether there are older lines than the oldest entry
  hasMore: boolean;
  // Why a scan has no log yet
  note?: string;
}

// Stores the scraper scans at a time, set in the admin interface
export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 20;

// The row of scraperSettings
export interface ScraperSettings {
  concurrency: number;
  updatedAt: string | null;
  updatedBy: string | null;
}
