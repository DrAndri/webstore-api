import { updateSolr } from '../solr';
import { invalidateSolrStores } from '../solrNames';
import { adminQuery } from './db';

// Sends the store, as it is in the database, to the stores core of Solr. The
// public search reads the stores in it and whether they are in the api. It is
// committed at once and the cached stores of the search are cleared after, so
// the next search has the change.
export const indexStore = async (id: number) => {
  const [store] = await adminQuery<
    { id: number; name: string; apiEnabled: number }[]
  >('SELECT id, name, apiEnabled FROM stores WHERE id = ?', [id]);
  if (!store) return;
  await updateSolr(
    'stores',
    [
      { id: String(store.id), name: store.name, apiEnabled: !!store.apiEnabled }
    ],
    { commit: true }
  );
  invalidateSolrStores();
};
