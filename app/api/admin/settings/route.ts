import { HttpError, readJson, withAdmin } from '../../../../utils/admin/api';
import { adminQuery } from '../../../../utils/admin/db';
import {
  MAX_CONCURRENCY,
  MIN_CONCURRENCY,
  ScraperSettings
} from '../../../../utils/admin/types';

const getSettings = async (): Promise<ScraperSettings> => {
  const [row] = await adminQuery<
    {
      concurrency: number;
      updatedAt: Date | null;
      updatedBy: string | null;
    }[]
  >(
    'SELECT concurrency, updatedAt, updatedBy FROM scraperSettings WHERE id = 1'
  );
  if (!row) throw new HttpError(404, { key: 'settings.notFound' });
  return {
    concurrency: row.concurrency,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    updatedBy: row.updatedBy
  };
};

export const GET = withAdmin(getSettings);

// The scraper reads the settings every 5 seconds
export const PUT = withAdmin(async (request, { user }) => {
  const body = await readJson<{ concurrency?: unknown }>(request);
  const { concurrency } = body;
  if (
    typeof concurrency !== 'number' ||
    !Number.isInteger(concurrency) ||
    concurrency < MIN_CONCURRENCY ||
    concurrency > MAX_CONCURRENCY
  )
    throw new HttpError(400, {
      key: 'settings.concurrencyRange',
      values: { min: MIN_CONCURRENCY, max: MAX_CONCURRENCY }
    });
  await adminQuery(
    'UPDATE scraperSettings SET concurrency = ?, updatedAt = UTC_TIMESTAMP(), updatedBy = ? WHERE id = 1',
    [concurrency, user.email]
  );
  return getSettings();
});
