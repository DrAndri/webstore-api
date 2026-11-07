import { HttpError, parseId, withAdmin } from '../../../../../utils/admin/api';
import { adminQuery } from '../../../../../utils/admin/db';
import { ConfigReload } from '../../../../../utils/admin/types';

const toIso = (value: Date | null) => value?.toISOString() ?? null;

export const GET = withAdmin<{ params: Promise<{ id: string }> }>(
  async (request, { params }): Promise<ConfigReload> => {
    const id = parseId((await params).id);
    const [row] = await adminQuery<
      (Omit<ConfigReload, 'requestedAt' | 'finishedAt'> & {
        requestedAt: Date;
        finishedAt: Date | null;
      })[]
    >(
      'SELECT id, storeId, status, requestedBy, requestedAt, finishedAt, configCommit, errorMessage FROM configReloads WHERE id = ?',
      [id]
    );
    if (!row) throw new HttpError(404, { key: 'configReloads.notFound' });
    return {
      ...row,
      requestedAt: toIso(row.requestedAt)!,
      finishedAt: toIso(row.finishedAt)
    };
  }
);
