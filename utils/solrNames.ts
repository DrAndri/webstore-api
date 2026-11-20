// The stores and attributes of the search, read from Solr. A product document
// has the names of its manufacturer, category and attributes in labels with
// their ids, set by SolrLabels.ts in the scraper. The stores are read from the
// stores core, the attributes with the names of their groups from the
// attributes core.
import { selectSolr } from './solr';

// Store ids are a TINYINT UNSIGNED
const MAX_STORES = 256;
const STORES_TTL_MS = 60 * 1000;

declare global {
  // Route handlers are bundled separately, the cache is shared through
  // globalThis
  var solrPublicStores:
    { at: number; value: Promise<Map<number, string>> } | undefined;
}

// Separates the id from the names in a label
const LABEL_SEPARATOR = '\u001f';

// "<id>␟<name>" of manufacturerLabel and categoryLabel
export const parseLabel = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const [id, ...name] = value.split(LABEL_SEPARATOR);
  return { id, name: name.join(LABEL_SEPARATOR) };
};

// "<id>␟<group>␟<name>" of attrLabels, the group empty when it has none
export const parseAttributeLabel = (value: string) => {
  const [id, group, ...name] = value.split(LABEL_SEPARATOR);
  return {
    id: Number(id),
    group: group || undefined,
    name: name.join(LABEL_SEPARATOR)
  };
};

// The stores in the public api, their names by id, from the stores core.
// Cached for a minute, indexStore clears the cache when it changes a store.
// No stores is not cached, the core is empty until the first reindex.
export const publicStores = (): Promise<Map<number, string>> => {
  const cached = global.solrPublicStores;
  if (cached && Date.now() - cached.at < STORES_TTL_MS) return cached.value;
  const value = selectSolr(
    'stores',
    new URLSearchParams({
      defType: 'lucene',
      q: 'apiEnabled:true',
      rows: String(MAX_STORES),
      fl: 'id,name'
    })
  ).then(
    (result) =>
      new Map(
        result.response.docs.map((doc) => [
          Number(doc.id),
          String(doc.name ?? '')
        ])
      )
  );
  global.solrPublicStores = { at: Date.now(), value };
  const forget = () => {
    if (global.solrPublicStores?.value === value)
      global.solrPublicStores = undefined;
  };
  value.then((stores) => stores.size === 0 && forget(), forget);
  return value;
};

export const invalidateSolrStores = () => {
  global.solrPublicStores = undefined;
};

// The products of the stores in the public api. The same stores give the same
// filter, so Solr caches it. The terms parser is made for a list of ids.
export const storeFilter = (stores: Map<number, string>) => {
  const ids = [...stores.keys()].sort((a, b) => a - b);
  return ids.length ? `{!terms f=storeId}${ids.join(',')}` : '-*:*';
};

// The documents of a core with these ids. Ids that are not numbers are left
// out.
const docsWithIds = async (
  core: string,
  ids: Iterable<unknown>,
  fields: string
) => {
  const unique = [...new Set([...ids].map(String))].filter((id) =>
    /^\d+$/.test(id)
  );
  if (unique.length === 0) return [];
  const result = await selectSolr(
    core,
    new URLSearchParams({
      // Local params in q switch the parser only when the default is lucene
      defType: 'lucene',
      q: `{!terms f=id}${unique.join(',')}`,
      rows: String(unique.length),
      fl: fields
    })
  );
  return result.response.docs;
};

// "Parent › Child" of the category of each product, by product id
export const productCategoryPaths = async (
  productIds: Iterable<unknown>
): Promise<Map<string, string>> => {
  const docs = await docsWithIds('products', productIds, 'id,categoryLabel');
  return new Map(
    docs.flatMap((doc) => {
      const label = parseLabel(doc.categoryLabel);
      return label ? [[String(doc.id), label.name] as const] : [];
    })
  );
};

// The fields of an attribute document, group is the name of its group
const ATTRIBUTE_FIELDS = 'id,name,group';

const toAttribute = (
  doc: Record<string, unknown>
): { id: number; name: string; group?: string } => ({
  id: Number(doc.id),
  name: String(doc.name ?? ''),
  group: typeof doc.group === 'string' && doc.group ? doc.group : undefined
});

// Names and groups of attributes, by id, from the attributes core
export const attributeNames = async (ids: Iterable<unknown>) =>
  (await docsWithIds('attributes', ids, ATTRIBUTE_FIELDS)).map(toAttribute);

// Escapes a term for the standard query parser, including whitespace so a
// wildcard term stays one term
export const escapeTerm = (value: string) =>
  value.replace(/[+\-&|!(){}[\]^"~*?:\\/\s]/g, '\\$&');

// Attributes whose name has the words, whole words first, then the start of a
// word, then anywhere in a word, so þyngd finds Heildarþyngd
export const findAttributes = async (term: string) => {
  const words = term.trim().split(/\s+/).filter(Boolean).map(escapeTerm);
  if (words.length === 0) return [];
  const all = (terms: string[]) => `(${terms.join(' AND ')})`;
  const result = await selectSolr(
    'attributes',
    new URLSearchParams({
      defType: 'lucene',
      q: [
        `name:${all(words)}^3`,
        `name_prefix:${all(words)}^2`,
        `name:${all(words.map((word) => `*${word}*`))}`
      ].join(' OR '),
      rows: '20',
      fl: ATTRIBUTE_FIELDS
    })
  );
  return result.response.docs.map(toAttribute);
};
