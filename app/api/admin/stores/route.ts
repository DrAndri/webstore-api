import { getTranslation } from '../../../../i18n/server';
import {
  HttpError,
  parseId,
  readJson,
  withAdmin
} from '../../../../utils/admin/api';
import { adminQuery } from '../../../../utils/admin/db';
import {
  configPath,
  getConfigFile,
  saveConfigFile
} from '../../../../utils/admin/github';
import {
  checkConfigText,
  newConfigText,
  validateStoreConfig
} from '../../../../utils/admin/storeConfig';
import { WebshopCrawlerOptions } from '../../../../utils/admin/types';
import { UpsertResult } from 'mariadb';
import { invalidatePublicStores } from '../../../../utils/stores';

const invalidConfig = (errors: string[]) =>
  new HttpError(400, {
    key: 'invalidConfig',
    values: { errors: errors.join(', ') }
  });

// Creates the store and commits its config. The store id is only known after
// the insert, so the config is sent without one. With existingConfig the store
// gets the id of a config that is already committed, and nothing is committed.
export const POST = withAdmin(async (request, { user }) => {
  const body = await readJson<{
    name?: string;
    scraperEnabled?: boolean;
    apiEnabled?: boolean;
    config?: Omit<WebshopCrawlerOptions, 'storeId'>;
    existingConfig?: { storeId?: number };
  }>(request);
  const name = body.name?.trim() ?? '';
  if (name.length < 2 || name.length > 255)
    throw new HttpError(400, { key: 'nameLength' });
  // The problems are in the language of the request
  const { t } = await getTranslation('stores');
  const existingId =
    body.existingConfig !== undefined
      ? parseId(String(body.existingConfig.storeId), 'storeId')
      : undefined;
  if (existingId !== undefined) {
    const file = await getConfigFile(existingId);
    if (!file)
      throw new HttpError(404, {
        key: 'stores.configNotFound',
        values: { path: configPath(existingId) }
      });
    const { errors } = checkConfigText(file.text, t, existingId);
    if (errors.length > 0) throw invalidConfig(errors);
  } else {
    const errors = validateStoreConfig({ ...body.config, storeId: 0 }, t);
    if (errors.length > 0) throw invalidConfig(errors);
  }

  const [existing] = await adminQuery<{ id: number }[]>(
    'SELECT id FROM stores WHERE name = ?',
    [name]
  );
  if (existing)
    throw new HttpError(409, {
      key: 'stores.nameExists',
      values: { name }
    });

  if (existingId !== undefined) {
    const idTaken = new HttpError(409, {
      key: 'stores.idTaken',
      values: { id: existingId }
    });
    const [taken] = await adminQuery<{ id: number }[]>(
      'SELECT id FROM stores WHERE id = ?',
      [existingId]
    );
    if (taken) throw idTaken;
    try {
      await adminQuery<UpsertResult>(
        'INSERT INTO stores (id, name, createdDate, scraperEnabled, apiEnabled) VALUES (?, ?, CURRENT_DATE, ?, ?)',
        [existingId, name, !!body.scraperEnabled, !!body.apiEnabled]
      );
    } catch (e) {
      // Another store got the id since the check
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY') throw idTaken;
      throw e;
    }
    invalidatePublicStores();
    return { id: existingId };
  }

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
