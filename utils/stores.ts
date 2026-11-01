import { StoreConfig } from '../types';
import { queryPool } from './mariadb';

const TTL_MS = 10 * 60 * 1000;

declare global {
  // Pages and route handlers are bundled separately, the cache is shared
  // through globalThis
  var publicStores: { at: number; value: Promise<StoreConfig[]> } | undefined;
}

// The stores in the public search, cached in memory for a few minutes since
// every page lists them
export const getPublicStores = (): Promise<StoreConfig[]> => {
  const cached = global.publicStores;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = queryPool<StoreConfig[]>(
    'SELECT id, name FROM stores WHERE apiEnabled = true'
  ).then((rows) => rows.map((row) => ({ id: Number(row.id), name: row.name })));
  global.publicStores = { at: Date.now(), value };
  // A failed query is not cached
  value.catch(() => {
    if (global.publicStores?.value === value) global.publicStores = undefined;
  });
  return value;
};

// Called by the admin api when a store is added or changed
export const invalidatePublicStores = () => {
  global.publicStores = undefined;
};
