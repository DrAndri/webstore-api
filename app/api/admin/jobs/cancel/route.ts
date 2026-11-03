import { UpsertResult } from 'mariadb';
import { withAdmin } from '../../../../../utils/admin/api';
import { adminQuery } from '../../../../../utils/admin/db';

// Cancels every queued and running scan. Config tests are left alone, since
// someone is waiting on them in the new store wizard.
export const POST = withAdmin(async () => {
  const result = await adminQuery<UpsertResult>(
    "UPDATE scrapeJobs SET cancelRequested = 1 WHERE mode <> 'test' AND status IN ('queued', 'running') AND cancelRequested = 0"
  );
  return { cancelled: result.affectedRows };
});
