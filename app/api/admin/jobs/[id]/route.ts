import { HttpError, parseId, withAdmin } from '../../../../../utils/admin/api';
import { adminQuery } from '../../../../../utils/admin/db';
import { JOB_COLUMNS, toJob } from '../../../../../utils/admin/overview';

export const GET = withAdmin<{ params: Promise<{ id: string }> }>(
  async (request, { params }) => {
    const id = parseId((await params).id);
    const [row] = await adminQuery<Record<string, unknown>[]>(
      `SELECT ${JOB_COLUMNS}, j.updateResult, j.testResult FROM scrapeJobs j
       LEFT JOIN stores s ON s.id = j.storeId WHERE j.id = ?`,
      [id]
    );
    if (!row) throw new HttpError(404, 'Job not found');
    return toJob(row);
  }
);
