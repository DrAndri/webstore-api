import { UpsertResult } from 'mariadb';
import { withAdmin } from '../../../../../utils/admin/api';
import { adminQuery } from '../../../../../utils/admin/db';

// Queues a reindex of everything in the database to Solr, unless one is
// already queued or running. The scraper runs it like a scan.
export const POST = withAdmin(async (_request, { user }) => {
  const result = await adminQuery<UpsertResult>(
    `INSERT INTO scrapeJobs (storeId, mode, source, status, requestedBy, queuedAt)
     SELECT NULL, 'index', 'manual', 'queued', ?, UTC_TIMESTAMP() FROM DUAL
     WHERE NOT EXISTS (
       SELECT 1 FROM scrapeJobs WHERE mode = 'index' AND status IN ('queued', 'running')
     )`,
    [user.email]
  );
  return { queued: result.affectedRows };
});
