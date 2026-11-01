import { UpsertResult } from 'mariadb';
import { HttpError, readJson, withAdmin } from '../../../../utils/admin/api';
import { describeCron } from '../../../../utils/admin/cron';
import { adminQuery } from '../../../../utils/admin/db';
import { getSchedules } from '../../../../utils/admin/overview';
import { ScheduledMode } from '../../../../utils/admin/types';

export const GET = withAdmin(() => getSchedules());

// The scraper picks up changes within 30 seconds
export const PUT = withAdmin(async (request, { user }) => {
  const body = await readJson<{
    mode?: ScheduledMode;
    cron?: string;
    enabled?: boolean;
  }>(request);
  if (body.mode !== 'crawler' && body.mode !== 'list')
    throw new HttpError(400, 'mode must be crawler or list');
  if (typeof body.enabled !== 'boolean')
    throw new HttpError(400, 'enabled must be true or false');
  const cron = body.cron?.trim().replace(/\s+/g, ' ') ?? '';
  if (cron.length > 64) throw new HttpError(400, 'The expression is too long');
  const description = describeCron(cron);
  if (!description.valid)
    throw new HttpError(
      400,
      `Invalid schedule: ${description.errors.join(', ')}`
    );

  const result = await adminQuery<UpsertResult>(
    'UPDATE scraperSchedules SET cron = ?, enabled = ?, updatedAt = UTC_TIMESTAMP(), updatedBy = ? WHERE mode = ?',
    [cron, body.enabled, user.login, body.mode]
  );
  if (result.affectedRows === 0)
    throw new HttpError(
      404,
      'The schedule does not exist yet, it is created when the scraper starts'
    );
  return getSchedules();
});
