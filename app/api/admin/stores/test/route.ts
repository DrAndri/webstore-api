import { UpsertResult } from 'mariadb';
import { getTranslation } from '../../../../../i18n/server';
import { HttpError, readJson, withAdmin } from '../../../../../utils/admin/api';
import { adminQuery } from '../../../../../utils/admin/db';
import { validateStoreConfig } from '../../../../../utils/admin/storeConfig';
import { WebshopCrawlerOptions } from '../../../../../utils/admin/types';

const siteOf = (url: string) => new URL(url).hostname.replace(/^www\./, '');

// Queues a test job that scrapes one page with a draft config without saving
// anything, the page polls /api/admin/jobs/<id> for the result
export const POST = withAdmin(async (request, { user }) => {
  const body = await readJson<{
    storeId?: number | null;
    url?: string;
    config?: WebshopCrawlerOptions;
  }>(request);
  const storeId = body.storeId ?? 0;
  const config = { ...body.config, storeId } as WebshopCrawlerOptions;
  // The problems are in the language of the request
  const { t } = await getTranslation('stores');
  const errors = validateStoreConfig(config, t);
  if (errors.length > 0)
    throw new HttpError(400, {
      key: 'invalidConfig',
      values: { errors: errors.join(', ') }
    });

  let url: URL;
  try {
    url = new URL(body.url ?? '');
  } catch {
    throw new HttpError(400, { key: 'stores.enterProductUrl' });
  }
  // The scraper only fetches pages of the store being tested
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    siteOf(url.href) !== siteOf(config.startUrl)
  )
    throw new HttpError(400, {
      key: 'stores.urlNotOnSite',
      values: { site: siteOf(config.startUrl) }
    });

  const result = await adminQuery<UpsertResult>(
    `INSERT INTO scrapeJobs (storeId, mode, source, status, requestedBy, queuedAt, testUrl, testConfig)
     VALUES (?, 'test', 'manual', 'queued', ?, UTC_TIMESTAMP(), ?, ?)`,
    [storeId || null, user.email, url.href, JSON.stringify(config)]
  );
  return { jobId: Number(result.insertId) };
});
