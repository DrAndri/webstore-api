import { getTranslation } from '../../../../../i18n/server';
import { withAdmin } from '../../../../../utils/admin/api';
import { adminQuery } from '../../../../../utils/admin/db';
import {
  configPath,
  fileUrl,
  getConfigFile
} from '../../../../../utils/admin/github';
import { checkConfigText } from '../../../../../utils/admin/storeConfig';
import { NextStore } from '../../../../../utils/admin/types';

// The id the auto increment gives the next store, ids of deleted stores are
// not reused
const nextStoreId = async () => {
  const [row] = await adminQuery<{ next: number | null }[]>(
    `SELECT AUTO_INCREMENT AS next FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stores'`
  );
  if (row?.next) return Number(row.next);
  const [max] = await adminQuery<{ next: number }[]>(
    'SELECT COALESCE(MAX(id), 0) + 1 AS next FROM stores'
  );
  return Number(max.next);
};

// For the new store wizard, which offers to use a config that was committed
// before the store was added
export const GET = withAdmin(async (): Promise<NextStore> => {
  const storeId = await nextStoreId();
  const file = await getConfigFile(storeId);
  // The problems are in the language of the request
  const { t } = await getTranslation('stores');
  return {
    storeId,
    configPath: configPath(storeId),
    fileUrl: fileUrl(storeId),
    config: file && { ...file, ...checkConfigText(file.text, t, storeId) }
  };
});
