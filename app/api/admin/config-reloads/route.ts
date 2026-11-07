import { UpsertResult } from 'mariadb';
import {
  HttpError,
  parseId,
  readJson,
  withAdmin
} from '../../../../utils/admin/api';
import { adminQuery } from '../../../../utils/admin/db';

// Queues a reload of a store's config in the scraper, or of every config
// without a storeId. The scraper only reloads the configs when asked, it picks
// the reload up within 5 seconds. A reload that is already queued is reused.
export const POST = withAdmin(async (request, { user }) => {
  const body = await readJson<{ storeId?: unknown }>(request);
  const storeId =
    body.storeId === undefined || body.storeId === null
      ? null
      : parseId(String(body.storeId), 'storeId');
  if (storeId !== null) {
    const [store] = await adminQuery<{ id: number }[]>(
      'SELECT id FROM stores WHERE id = ?',
      [storeId]
    );
    if (!store) throw new HttpError(404, { key: 'stores.notFound' });
  }
  const [queued] = await adminQuery<{ id: number }[]>(
    "SELECT id FROM configReloads WHERE status = 'queued' AND storeId <=> ? ORDER BY id LIMIT 1",
    [storeId]
  );
  if (queued) return { id: queued.id };
  const result = await adminQuery<UpsertResult>(
    "INSERT INTO configReloads (storeId, status, requestedBy, requestedAt) VALUES (?, 'queued', ?, UTC_TIMESTAMP())",
    [storeId, user.email]
  );
  return { id: Number(result.insertId) };
});
