import { getTranslation } from '../../../../i18n/server';
import { HttpError, readJson, withAdmin } from '../../../../utils/admin/api';
import { adminQuery } from '../../../../utils/admin/db';
import { saveConfigFile } from '../../../../utils/admin/github';
import {
  newConfigText,
  validateStoreConfig
} from '../../../../utils/admin/storeConfig';
import { WebshopCrawlerOptions } from '../../../../utils/admin/types';
import { UpsertResult } from 'mariadb';
import { invalidatePublicStores } from '../../../../utils/stores';

// Creates the store and commits its config. The store id is only known after
// the insert, so the config is sent without one.
export const POST = withAdmin(async (request, { user }) => {
  const body = await readJson<{
    name?: string;
    scraperEnabled?: boolean;
    apiEnabled?: boolean;
    config?: Omit<WebshopCrawlerOptions, 'storeId'>;
  }>(request);
  const name = body.name?.trim() ?? '';
  if (name.length < 2 || name.length > 255)
    throw new HttpError(400, { key: 'nameLength' });
  // The problems are in the language of the request
  const { t } = await getTranslation('stores');
  const errors = validateStoreConfig({ ...body.config, storeId: 0 }, t);
  if (errors.length > 0)
    throw new HttpError(400, {
      key: 'invalidConfig',
      values: { errors: errors.join(', ') }
    });

  const [existing] = await adminQuery<{ id: number }[]>(
    'SELECT id FROM stores WHERE name = ?',
    [name]
  );
  if (existing)
    throw new HttpError(409, {
      key: 'stores.nameExists',
      values: { name }
    });
  const result = await adminQuery<UpsertResult>(
    'INSERT INTO stores (name, createdDate, scraperEnabled, apiEnabled) VALUES (?, CURRENT_DATE, ?, ?)',
    [name, !!body.scraperEnabled, !!body.apiEnabled]
  );
  const storeId = Number(result.insertId);
  // The website lists the stores in the public search
  invalidatePublicStores();

  // storeId first, the rest in the order of the form
  const config = { storeId, ...body.config } as WebshopCrawlerOptions;
  try {
    await saveConfigFile(
      storeId,
      newConfigText(config),
      null,
      `Add store ${name}`,
      user
    );
  } catch (e) {
    console.error(`Saving the config of new store ${storeId} failed`, e);
    return {
      id: storeId,
      warning:
        'The store was created but saving its config failed. Save it again from the config tab.'
    };
  }
  return { id: storeId };
});
