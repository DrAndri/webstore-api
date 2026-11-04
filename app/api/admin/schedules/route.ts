import { UpsertResult } from 'mariadb';
import { getTranslation } from '../../../../i18n/server';
import { HttpError, readJson, withAdmin } from '../../../../utils/admin/api';
import { describeCron } from '../../../../utils/admin/cron';
import { adminQuery } from '../../../../utils/admin/db';
import { getSchedules } from '../../../../utils/admin/overview';
import { ScheduledMode } from '../../../../utils/admin/types';

export const GET = withAdmin(async () =>
  getSchedules((await getTranslation('admin')).t)
);

// The scraper picks up changes within 30 seconds
export const PUT = withAdmin(async (request, { user }) => {
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

  const result = await adminQuery<UpsertResult>(
    'UPDATE scraperSchedules SET cron = ?, enabled = ?, updatedAt = UTC_TIMESTAMP(), updatedBy = ? WHERE mode = ?',
    [cron, body.enabled, user.email, body.mode]
  );
  if (result.affectedRows === 0)
    throw new HttpError(404, { key: 'schedules.notFound' });
  return getSchedules(t);
});
