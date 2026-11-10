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
      schedulesEnabled: number | boolean;
      updatedAt: Date | null;
      updatedBy: string | null;
    }[]
  >(
    'SELECT concurrency, schedulesEnabled, updatedAt, updatedBy FROM scraperSettings WHERE id = 1'
  );
  if (!row) throw new HttpError(404, { key: 'settings.notFound' });
  return {
    concurrency: row.concurrency,
    schedulesEnabled: !!row.schedulesEnabled,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    updatedBy: row.updatedBy
  };
};

export const GET = withAdmin(getSettings);

// Changes the settings in the body, the others are kept. The job runner reads
// the concurrency every 5 seconds, the scheduler reads schedulesEnabled every
// 30 seconds.
export const PUT = withAdmin(async (request, { user }) => {
  const { concurrency, schedulesEnabled } = await readJson<{
    concurrency?: unknown;
    schedulesEnabled?: unknown;
  }>(request);
  const changes: [string, unknown][] = [];
  if (concurrency !== undefined) {
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
    changes.push(['concurrency', concurrency]);
  }
  if (schedulesEnabled !== undefined) {
    if (typeof schedulesEnabled !== 'boolean')
      throw new HttpError(400, { key: 'settings.schedulesEnabledType' });
    changes.push(['schedulesEnabled', schedulesEnabled]);
  }
  if (changes.length === 0)
    throw new HttpError(400, { key: 'settings.nothingToChange' });
  await adminQuery(
    `UPDATE scraperSettings SET ${changes.map(([column]) => `${column} = ?`).join(', ')}, updatedAt = UTC_TIMESTAMP(), updatedBy = ? WHERE id = 1`,
    [...changes.map(([, value]) => value), user.email]
  );
  return getSettings();
});
