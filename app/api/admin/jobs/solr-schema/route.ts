import { UpsertResult } from 'mariadb';
import { HttpError, readJson, withAdmin } from '../../../../../utils/admin/api';
import { adminQuery } from '../../../../../utils/admin/db';

// Queues a sync of the Solr schemas with solr-configsets in the scraper, unless
// one is already queued or running. With reindex the scraper queues a reindex
// when a schema changed.
export const POST = withAdmin(async (request, { user }) => {
  const body = await readJson<{ reindex?: unknown }>(request);
  if (body.reindex !== undefined && typeof body.reindex !== 'boolean')
    throw new HttpError(400, {
      key: 'mustBeBoolean',
      values: { name: 'reindex' }
    });
  const result = await adminQuery<UpsertResult>(
    `INSERT INTO scrapeJobs (storeId, mode, source, status, requestedBy, queuedAt, options)
     SELECT NULL, 'schema', 'manual', 'queued', ?, UTC_TIMESTAMP(), ? FROM DUAL
     WHERE NOT EXISTS (
       SELECT 1 FROM scrapeJobs WHERE mode = 'schema' AND status IN ('queued', 'running')
     )`,
    [user.email, JSON.stringify({ reindex: body.reindex === true })]
  );
  return { queued: result.affectedRows };
});
