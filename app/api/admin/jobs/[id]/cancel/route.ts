import { UpsertResult } from 'mariadb';
import {
  HttpError,
  parseId,
  withAdmin
} from '../../../../../../utils/admin/api';
import { adminQuery } from '../../../../../../utils/admin/db';

// The scraper drops queued jobs and stops running ones within a few seconds
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(
  async (request, { params }) => {
    const id = parseId((await params).id);
    const result = await adminQuery<UpsertResult>(
      "UPDATE scrapeJobs SET cancelRequested = 1 WHERE id = ? AND status IN ('queued', 'running')",
      [id]
    );
    if (result.affectedRows === 0)
      throw new HttpError(409, 'The job has already finished');
    return { ok: true };
  }
);
