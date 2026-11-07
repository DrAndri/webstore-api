import { getTranslation } from '../../../../../../i18n/server';
import {
  HttpError,
  parseId,
  readJson,
  withAdmin
} from '../../../../../../utils/admin/api';
import { describeCron } from '../../../../../../utils/admin/cron';
import { adminQuery } from '../../../../../../utils/admin/db';
import { getSchedules } from '../../../../../../utils/admin/overview';
import { ScheduledMode } from '../../../../../../utils/admin/types';

type Context = { params: Promise<{ id: string }> };

// Sets the full crawl or active products schedule of a store and returns the
// schedules of the store. The scraper picks up changes within 30 seconds.
export const PUT = withAdmin<Context>(async (request, { params, user }) => {
  const storeId = parseId((await params).id);
  const { t } = await getTranslation('admin');
  const body = await readJson<{
    mode?: ScheduledMode;
    cron?: string;
    enabled?: boolean;
  }>(request);
  if (body.mode !== 'crawler' && body.mode !== 'list')
    throw new HttpError(400, { key: 'modeCrawlerOrList' });
  if (typeof body.enabled !== 'boolean')
    throw new HttpError(400, {
      key: 'mustBeBoolean',
      values: { name: 'enabled' }
    });
  const cron = body.cron?.trim().replace(/\s+/g, ' ') ?? '';
  if (cron.length > 64)
    throw new HttpError(400, { key: 'schedules.expressionTooLong' });
  const description = describeCron(cron, t);
  if (!description.valid)
    throw new HttpError(400, {
      key: 'schedules.invalid',
      values: { errors: description.errors.join(', ') }
    });

  try {
    // The scraper creates the rows of new stores within 30 seconds, until then
    // the schedule is created here
    await adminQuery(
      `INSERT INTO storeSchedules (storeId, mode, cron, enabled, updatedAt, updatedBy)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), ?)
       ON DUPLICATE KEY UPDATE cron = VALUES(cron), enabled = VALUES(enabled),
         updatedAt = VALUES(updatedAt), updatedBy = VALUES(updatedBy)`,
      [storeId, body.mode, cron, body.enabled, user.email]
    );
  } catch (e) {
    if ((e as { code?: string }).code === 'ER_NO_REFERENCED_ROW_2')
      throw new HttpError(404, { key: 'stores.notFound' });
    throw e;
  }
  return getSchedules(t, storeId);
});
