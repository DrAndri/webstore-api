import { cacheLife, cacheTag } from 'next/cache';
import { StoreConfig } from '../types';
import { queryPool } from './mariadb';

// Revalidated by the admin api when a store is added or changed
export const STORES_TAG = 'stores';

// The stores in the public search. Cached, so the pages that list them are
// prerendered at build time with the stores from the database.
export const getPublicStores = async (): Promise<StoreConfig[]> => {
  'use cache';
  cacheTag(STORES_TAG);
  cacheLife('hours');
  const rows = await queryPool<StoreConfig[]>(
    'SELECT id, name FROM stores WHERE apiEnabled = true ORDER BY id'
  );
  // Plain objects, cached results must be serializable
  return rows.map((row) => ({ id: Number(row.id), name: row.name }));
};
