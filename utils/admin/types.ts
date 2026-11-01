// Types shared by the admin api routes and pages

export type JobMode = 'crawler' | 'list' | 'test';
export type ScheduledMode = Exclude<JobMode, 'test'>;
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

export const MODE_LABELS: Record<JobMode, string> = {
  crawler: 'Full crawl',
  list: 'Active products',
  test: 'Test'
};

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

export interface StoreStatus {
  id: number;
  name: string;
  scraperEnabled: boolean;
  apiEnabled: boolean;
  createdDate: string | null;
  lastScanDate: string | null;
  hasConfig: boolean;
  health: Health;
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
  configCommit: string | null;
  configErrors: { file: string; message: string }[];
}

export interface CronDescription {
  valid: boolean;
  errors: string[];
  nextRuns: string[];
}

export interface Schedule extends CronDescription {
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
  schedules: Schedule[];
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
    createdDate: string | null;
    lastScanDate: string | null;
  };
  config: { text: string; sha: string } | null;
  configPath: string;
  fileUrl: string;
  legacyHistoryUrl: string;
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
  sitemapUrls?: string[];
  scrollPagesToBottom?: boolean;
  menuClicker?: string;
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
  email: string | null;
  note: string | null;
  anonymous: boolean;
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
}
