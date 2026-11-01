import { UpsertResult } from 'mariadb';
import { revalidateTag } from 'next/cache';
import { STORES_TAG } from '../../../../../utils/stores';
import {
  HttpError,
  parseId,
  readJson,
  withAdmin
} from '../../../../../utils/admin/api';
import { adminQuery } from '../../../../../utils/admin/db';
import {
  configPath,
  fileUrl,
  getConfigFile,
  legacyHistoryUrl
} from '../../../../../utils/admin/github';
import { StoreDetails } from '../../../../../utils/admin/types';

type Context = { params: Promise<{ id: string }> };

interface StoreRow {
  id: number;
  name: string;
  scraperEnabled: number;
  apiEnabled: number;
  createdDate: Date | null;
  lastScanDate: Date | null;
}

const getStore = async (id: number) => {
  const [store] = await adminQuery<StoreRow[]>(
    'SELECT id, name, scraperEnabled, apiEnabled, createdDate, lastScanDate FROM stores WHERE id = ?',
    [id]
  );
  if (!store) throw new HttpError(404, 'Store not found');
  return {
    ...store,
    scraperEnabled: !!store.scraperEnabled,
    apiEnabled: !!store.apiEnabled,
    createdDate: store.createdDate?.toISOString().slice(0, 10) ?? null,
    lastScanDate: store.lastScanDate?.toISOString().slice(0, 10) ?? null
  };
};

export const GET = withAdmin<Context>(
  async (request, { params }): Promise<StoreDetails> => {
    const id = parseId((await params).id);
    const [store, config] = await Promise.all([
      getStore(id),
      getConfigFile(id)
    ]);
    return {
      store,
      config,
      configPath: configPath(id),
      fileUrl: fileUrl(id),
      legacyHistoryUrl: legacyHistoryUrl()
    };
  }
);

// Renames the store or turns scraping and the public api on or off
export const PATCH = withAdmin<Context>(async (request, { params }) => {
  const id = parseId((await params).id);
  const body = await readJson<{
    name?: string;
    scraperEnabled?: boolean;
    apiEnabled?: boolean;
  }>(request);
  const updates: string[] = [];
  const values: unknown[] = [];
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 255)
      throw new HttpError(400, 'The name must be 2 to 255 characters');
    updates.push('name = ?');
    values.push(name);
  }
  for (const flag of ['scraperEnabled', 'apiEnabled'] as const) {
    if (body[flag] !== undefined) {
      if (typeof body[flag] !== 'boolean')
        throw new HttpError(400, `${flag} must be true or false`);
      updates.push(`${flag} = ?`);
      values.push(body[flag]);
    }
  }
  if (updates.length === 0) throw new HttpError(400, 'Nothing to update');
  try {
    const result = await adminQuery<UpsertResult>(
      `UPDATE stores SET ${updates.join(', ')} WHERE id = ?`,
      [...values, id]
    );
    if (result.affectedRows === 0) throw new HttpError(404, 'Store not found');
  } catch (e) {
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY')
      throw new HttpError(409, 'Another store has that name');
    throw e;
  }
  // The website lists the names of the stores in the public search
  revalidateTag(STORES_TAG, 'max');
  return getStore(id);
});
