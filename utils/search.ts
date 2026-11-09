// Advanced product search on the Solr products core
import type { TFunction } from 'i18next';
import type { Format } from '../i18n/format';
import { queryPool } from './mariadb';
import { ErrorMessage, HttpError } from './httpError';
import { solrUrl } from './solr';
import {
  ATTRIBUTE_FIELD,
  Facet,
  fieldKind,
  fieldOps,
  PRICE_RANGES,
  priceRangeKey,
  SearchCondition,
  SearchProduct,
  SearchRequest,
  SearchResponse,
  SORTS
} from './searchFields';

const MAX_CONDITIONS = 12;
const MAX_VALUE_LENGTH = 100;
const MAX_PAGE_SIZE = 48;
const ATTRIBUTE_FACETS = 12;
const LOOKUP_TTL_MS = 10 * 60 * 1000;
const PRODUCT_FIELDS =
  'id,storeId,manufacturerId,categoryId,sku,name,ean,image,inStock,price,lastChangeDate';

// A search that can not run, a 400 response with the message
export class SearchError extends HttpError {
  constructor(message: ErrorMessage) {
    super(400, message);
  }
}

const productsUrl = (handler: string) => solrUrl(`products/${handler}`);

// Lookups

interface Lookups {
  stores: Map<number, string>;
  manufacturers: Map<number, string>;
  categories: Map<number, string>;
  attributes: Map<number, { name: string; group?: string }>;
}

let lookups: { at: number; value: Promise<Lookups> } | undefined;

const loadLookups = async (): Promise<Lookups> => {
  const [stores, manufacturers, categories, attributes] = await Promise.all([
    queryPool<{ id: number; name: string }[]>(
      'SELECT id, name FROM stores WHERE apiEnabled = true'
    ),
    queryPool<{ id: number; name: string }[]>(
      'SELECT id, name FROM manufacturers'
    ),
    queryPool<{ id: number; parentId: number | null; name: string }[]>(
      'SELECT id, parentId, name FROM categories'
    ),
    queryPool<{ id: number; name: string; groupName: string | null }[]>(
      'SELECT a.id, a.name, g.name AS groupName FROM attributes a LEFT JOIN attributeGroups g ON g.id = a.groupId'
    )
  ]);
  const categoryRows = new Map(categories.map((c) => [Number(c.id), c]));
  // "Parent › Child" for each category
  const categoryPath = (id: number) => {
    const names: string[] = [];
    let current = categoryRows.get(id);
    while (current && names.length < 6) {
      names.unshift(current.name);
      current = current.parentId
        ? categoryRows.get(Number(current.parentId))
        : undefined;
    }
    return names.join(' › ');
  };
  return {
    stores: new Map(stores.map((s) => [Number(s.id), s.name])),
    manufacturers: new Map(manufacturers.map((m) => [Number(m.id), m.name])),
    categories: new Map(
      categories.map((c) => [Number(c.id), categoryPath(Number(c.id))])
    ),
    attributes: new Map(
      attributes.map((a) => [
        Number(a.id),
        { name: a.name, group: a.groupName ?? undefined }
      ])
    )
  };
};

export const getLookups = () => {
  if (!lookups || Date.now() - lookups.at > LOOKUP_TTL_MS) {
    const value = loadLookups();
    lookups = { at: Date.now(), value };
    value.catch(() => (lookups = undefined));
  }
  return lookups.value;
};

// Whether the products core has the advanced search fields, which the scraper
// adds when it syncs the Solr schema
let schema:
  | {
      at: number;
      exact: boolean;
      attrIds: boolean;
      namePrefix: boolean;
      skuPrefix: boolean;
      // Whether a product was seen in the last scan of its store
      active: boolean;
    }
  | undefined;

const getSchemaSupport = async () => {
  if (schema && Date.now() - schema.at < 5 * 60 * 1000) return schema;
  try {
    const response = await fetch(productsUrl('schema'), { cache: 'no-store' });
    const { schema: body } = (await response.json()) as {
      schema: { fields: { name: string }[]; dynamicFields: { name: string }[] };
    };
    const fields = new Set(body.fields.map((f) => f.name));
    schema = {
      at: Date.now(),
      exact:
        fields.has('name_ci') &&
        fields.has('sku_ci') &&
        body.dynamicFields.some((f) => f.name === 'attrci_*'),
      attrIds: fields.has('attrIds'),
      namePrefix: fields.has('name_prefix'),
      skuPrefix: fields.has('sku_prefix'),
      active: fields.has('active')
    };
  } catch (e) {
    console.error('Reading the Solr schema failed', e);
    schema = {
      at: Date.now(),
      exact: false,
      attrIds: false,
      namePrefix: false,
      skuPrefix: false,
      active: false
    };
  }
  return schema;
};

// Query building

// Escapes a term for the standard query parser, including whitespace so a
// wildcard term stays one term
const escapeTerm = (value: string) =>
  value.replace(/[+\-&|!(){}[\]^"~*?:\\/\s]/g, '\\$&');
const quote = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`;

const wildcard = (op: string, term: string) =>
  op === 'startsWith'
    ? `${term}*`
    : op === 'endsWith'
      ? `*${term}`
      : op === 'contains'
        ? `*${term}*`
        : term;

const parseNumber = (value: string | undefined) => {
  if (value === undefined || value.trim() === '') return '*';
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new SearchError({ key: 'search.notANumber', values: { value } });
  return String(number);
};

const parseDate = (value: string | undefined, endOfDay: boolean) => {
  if (!value) return '*';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new SearchError({ key: 'search.notADate', values: { value } });
  return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}Z`;
};

const conditionClause = (
  condition: SearchCondition,
  exact: boolean
): string | undefined => {
  if (typeof condition?.field !== 'string')
    throw new SearchError({ key: 'search.invalidCondition' });
  const { field, op } = condition;
  const kind = fieldKind(field);
  if (!kind || !fieldOps(field).includes(op))
    throw new SearchError({ key: 'search.invalidCondition' });
  const value = String(condition.value ?? '')
    .trim()
    .slice(0, MAX_VALUE_LENGTH);

  if (kind === 'number')
    return `${field}:[${parseNumber(condition.value)} TO ${parseNumber(condition.value2)}]`;
  if (kind === 'date')
    return `${field}:[${parseDate(condition.value, false)} TO ${parseDate(condition.value2, true)}]`;
  if (kind === 'boolean')
    return `${field}:${value === 'false' ? 'false' : 'true'}`;
  if (value === '') return undefined;
  // Leading wildcards scan every term, so very short ones are not allowed
  if ((op === 'contains' || op === 'endsWith') && value.length < 2)
    throw new SearchError({ key: 'search.tooShort' });

  if (kind === 'words') {
    if (op === 'exact') return `${field}:${quote(value)}`;
    const words = value.split(/\s+/).map(escapeTerm);
    return `${field}:(${words.join(' AND ')})`;
  }

  // ean is a case sensitive string, but only holds digits
  if (field === 'ean')
    return `ean:${op === 'exact' ? quote(value) : wildcard(op, escapeTerm(value))}`;

  const attribute = ATTRIBUTE_FIELD.exec(field);
  if (exact) {
    // Keyword fields that are lowercased and accent folded, wildcards included
    const target = attribute ? `attrci_${attribute[1]}` : `${field}_ci`;
    return `${target}:${op === 'exact' ? quote(value) : wildcard(op, escapeTerm(value))}`;
  }
  // Before those fields exist: attribute values are case sensitive strings, name
  // and sku are matched word by word
  if (attribute)
    return `${field}:${op === 'exact' ? quote(value) : wildcard(op, escapeTerm(value))}`;
  if (op === 'exact') return `${field}:${quote(value)}`;
  const words = value
    .split(/\s+/)
    .map((word) => wildcard(op, escapeTerm(word)));
  return `${field}:(${words.join(' AND ')})`;
};

// hasActive is whether the products core has the active field yet
const filterQuery = (
  key: string,
  values: string[],
  hasActive: boolean
): string => {
  const tag = `{!tag=f_${key}}`;
  if (key === 'storeId' || key === 'manufacturerId' || key === 'categoryId') {
    const ids = values.map(Number).filter(Number.isInteger);
    if (ids.length === 0)
      throw new SearchError({ key: 'search.invalidFilter' });
    return `${tag}${key}:(${ids.join(' OR ')})`;
  }
  if (key === 'inStock' || (key === 'active' && hasActive))
    return `${tag}${key}:(${values.map((v) => (v === 'false' ? 'false' : 'true')).join(' OR ')})`;
  if (key === 'price') {
    const ranges = values.map((value) => {
      const range = PRICE_RANGES.find((r) => priceRangeKey(r) === value);
      if (!range) throw new SearchError({ key: 'search.invalidPriceRange' });
      return priceRangeQuery(range);
    });
    return `${tag}(${ranges.join(' OR ')})`;
  }
  if (ATTRIBUTE_FIELD.test(key))
    return `${tag}${key}:(${values.map((v) => quote(v.slice(0, 255))).join(' OR ')})`;
  throw new SearchError({ key: 'search.unknownFilter', values: { key } });
};

const priceRangeQuery = ([from, to]: [number | null, number | null]) =>
  `price:[${from ?? '*'} TO ${to ?? '*'}}`;

interface SolrResponse {
  response: { numFound: number; docs: Record<string, unknown>[] };
  facet_counts?: {
    facet_fields: Record<string, (string | number)[]>;
    facet_queries: Record<string, number>;
  };
  error?: { msg: string };
}

const querySolr = async (params: URLSearchParams): Promise<SolrResponse> => {
  const response = await fetch(productsUrl('select'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
    cache: 'no-store'
  });
  const body = (await response.json()) as SolrResponse;
  if (!response.ok) {
    console.error('Solr search failed', body.error?.msg);
    throw new Error(`Solr returned ${response.status}`);
  }
  return body;
};

// [value, count, value, count, ...] from Solr
const pairs = (list: (string | number)[] = []) => {
  const result: { value: string; count: number }[] = [];
  for (let i = 0; i < list.length; i += 2)
    result.push({ value: String(list[i]), count: Number(list[i + 1]) });
  return result;
};

// The facet labels are in the language of t and format, the site namespace
export interface SearchLabels {
  t: TFunction<'site'>;
  format: Format;
}

export const search = async (
  request: SearchRequest,
  { t, format }: SearchLabels
): Promise<SearchResponse> => {
  const [{ stores, manufacturers, categories, attributes }, support] =
    await Promise.all([getLookups(), getSchemaSupport()]);
  if (stores.size === 0)
    return { total: 0, products: [], facets: [], exactMatching: support.exact };

  if (request.conditions !== undefined && !Array.isArray(request.conditions))
    throw new SearchError({ key: 'search.invalidConditions' });
  if (
    request.filters !== undefined &&
    (typeof request.filters !== 'object' || request.filters === null)
  )
    throw new SearchError({ key: 'search.invalidFilters' });
  if (typeof request.q !== 'string' && request.q !== undefined)
    throw new SearchError({ key: 'search.invalidSearch' });
  const conditions = (request.conditions ?? []).slice(0, MAX_CONDITIONS);
  const clauses = conditions
    .map((condition) => conditionClause(condition, support.exact))
    .filter((clause): clause is string => clause !== undefined);
  const filters = Object.entries(request.filters ?? {}).filter(
    ([, values]) => Array.isArray(values) && values.length > 0
  );
  const filterQueries = filters.map(([key, values]) =>
    filterQuery(key, values.slice(0, 50).map(String), support.active)
  );

  const params = new URLSearchParams();
  const q = (request.q ?? '').trim().slice(0, MAX_VALUE_LENGTH);
  if (q) {
    // Words only, operators in the free text are escaped
    params.set('q', q.split(/\s+/).map(escapeTerm).join(' '));
    params.set('defType', 'edismax');
    // name and sku match whole words and skus, name_prefix and sku_prefix the
    // start of them, so fart finds fartölva, ranked below a whole word
    params.set(
      'qf',
      [
        'name^3',
        support.namePrefix && 'name_prefix^1.5',
        'sku^4',
        support.skuPrefix && 'sku_prefix^2',
        'ean^4',
        'description^0.5'
      ]
        .filter(Boolean)
        .join(' ')
    );
    params.set('mm', '100%');
  } else {
    params.set('q', '*:*');
    params.set('defType', 'lucene');
  }
  params.append('fq', `storeId:(${[...stores.keys()].join(' OR ')})`);
  for (const clause of clauses) params.append('fq', clause);
  for (const fq of filterQueries) params.append('fq', fq);

  const pageSize = Math.min(
    Math.max(Number(request.pageSize) || 24, 1),
    MAX_PAGE_SIZE
  );
  const page = Math.min(Math.max(Number(request.page) || 1, 1), 200);
  params.set('rows', String(pageSize));
  params.set('start', String((page - 1) * pageSize));
  params.set('fl', PRODUCT_FIELDS);
  const sort =
    request.sort && Object.hasOwn(SORTS, request.sort)
      ? SORTS[request.sort]
      : SORTS.relevance;
  params.set(
    'sort',
    q || sort !== SORTS.relevance ? `${sort.solr}, id asc` : 'id asc'
  );

  // Multi select facets, the selection of a facet does not change its own counts
  params.set('facet', 'true');
  params.set('facet.mincount', '1');
  params.append('facet.field', '{!ex=f_storeId}storeId');
  params.append('facet.field', '{!ex=f_manufacturerId}manufacturerId');
  params.append('facet.field', '{!ex=f_categoryId}categoryId');
  params.append('facet.field', '{!ex=f_inStock}inStock');
  if (support.active) params.append('facet.field', '{!ex=f_active}active');
  params.set('f.manufacturerId.facet.limit', '100');
  params.set('f.categoryId.facet.limit', '100');
  for (const range of PRICE_RANGES)
    params.append(
      'facet.query',
      `{!ex=f_price key=price_${priceRangeKey(range)}}${priceRangeQuery(range)}`
    );
  if (support.attrIds) {
    params.append('facet.field', 'attrIds');
    params.set('f.attrIds.facet.limit', String(ATTRIBUTE_FACETS));
  }

  const result = await querySolr(params);
  const fields = result.facet_counts?.facet_fields ?? {};

  // The attributes most products in the result have, and the ones filtered on
  let attributeIds = pairs(fields.attrIds).map(({ value }) => Number(value));
  if (!support.attrIds && result.response.numFound > 0) {
    attributeIds = await sampleAttributeIds(params);
  }
  for (const [key] of filters) {
    const id = ATTRIBUTE_FIELD.exec(key)?.[1];
    if (id && !attributeIds.includes(Number(id))) attributeIds.push(Number(id));
  }
  const attributeFacets = await attributeFacetValues(params, attributeIds);

  const facets: Facet[] = [
    {
      key: 'storeId',
      label: t('facets.storeId'),
      values: pairs(fields.storeId).map(({ value, count }) => ({
        value,
        count,
        label: stores.get(Number(value)) ?? value
      }))
    },
    {
      key: 'inStock',
      label: t('facets.inStock'),
      values: pairs(fields.inStock).map(({ value, count }) => ({
        value,
        count,
        label:
          value === 'true'
            ? t('facets.inStockValue')
            : t('facets.outOfStockValue')
      }))
    },
    {
      key: 'active',
      label: t('facets.active'),
      values: pairs(fields.active).map(({ value, count }) => ({
        value,
        count,
        label:
          value === 'true' ? t('facets.activeValue') : t('facets.inactiveValue')
      }))
    },
    {
      key: 'price',
      label: t('facets.price'),
      values: PRICE_RANGES.map((range) => ({
        value: priceRangeKey(range),
        count:
          result.facet_counts?.facet_queries[`price_${priceRangeKey(range)}`] ??
          0,
        label:
          range[0] === null
            ? t('facets.priceUnder', { price: format.price(range[1]) })
            : range[1] === null
              ? t('facets.priceOver', { price: format.price(range[0]) })
              : t('facets.priceBetween', {
                  from: format.number(range[0]),
                  to: format.price(range[1])
                })
      })).filter((value) => value.count > 0)
    },
    {
      key: 'manufacturerId',
      label: t('facets.manufacturerId'),
      values: pairs(fields.manufacturerId).map(({ value, count }) => ({
        value,
        count,
        label: manufacturers.get(Number(value)) ?? value
      }))
    },
    {
      key: 'categoryId',
      label: t('facets.categoryId'),
      values: pairs(fields.categoryId).map(({ value, count }) => ({
        value,
        count,
        label: categories.get(Number(value)) ?? value
      }))
    },
    ...attributeIds.map((id) => ({
      key: `attr_${id}`,
      label: attributes.get(id)?.name ?? t('facets.attribute', { id }),
      group: attributes.get(id)?.group,
      values: pairs(attributeFacets[`attr_${id}`]).map(({ value, count }) => ({
        value,
        count,
        label: value
      }))
    }))
  ].filter((facet) => facet.values.length > 0);

  const products: SearchProduct[] = result.response.docs.map((doc) => ({
    id: String(doc.id),
    storeId: Number(doc.storeId),
    storeName: stores.get(Number(doc.storeId)) ?? '',
    sku: String(doc.sku ?? ''),
    name: doc.name as string | undefined,
    ean: doc.ean as string | undefined,
    image:
      typeof doc.image === 'string' && doc.image.startsWith('http')
        ? doc.image
        : undefined,
    price: doc.price as number | undefined,
    inStock: doc.inStock as boolean | undefined,
    manufacturer:
      doc.manufacturerId !== undefined
        ? manufacturers.get(Number(doc.manufacturerId))
        : undefined,
    category:
      doc.categoryId !== undefined
        ? categories.get(Number(doc.categoryId))
        : undefined,
    lastChangeDate: doc.lastChangeDate as string | undefined
  }));

  return {
    total: result.response.numFound,
    products,
    facets,
    exactMatching: support.exact
  };
};

// Before attrIds is indexed, the attributes of the first products stand in
const sampleAttributeIds = async (base: URLSearchParams) => {
  const params = new URLSearchParams(base);
  params.set('rows', '200');
  params.set('start', '0');
  params.set('fl', 'attr_*');
  params.set('facet', 'false');
  const { response } = await querySolr(params);
  const counts = new Map<number, number>();
  for (const doc of response.docs)
    for (const key of Object.keys(doc)) {
      const id = ATTRIBUTE_FIELD.exec(key)?.[1];
      if (id) counts.set(Number(id), (counts.get(Number(id)) ?? 0) + 1);
    }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, ATTRIBUTE_FACETS)
    .map(([id]) => id);
};

const attributeFacetValues = async (base: URLSearchParams, ids: number[]) => {
  if (ids.length === 0) return {};
  const params = new URLSearchParams(base);
  params.set('rows', '0');
  params.delete('facet.field');
  params.delete('facet.query');
  params.set('facet', 'true');
  params.set('facet.mincount', '1');
  params.set('facet.limit', '30');
  for (const id of ids)
    params.append('facet.field', `{!ex=f_attr_${id}}attr_${id}`);
  const result = await querySolr(params);
  return result.facet_counts?.facet_fields ?? {};
};

// Values of an attribute for suggestions in the condition editor
export const attributeValues = async (id: number, contains: string) => {
  const { stores } = await getLookups();
  const params = new URLSearchParams({
    q: '*:*',
    rows: '0',
    facet: 'true',
    'facet.field': `attr_${id}`,
    'facet.limit': '30',
    'facet.mincount': '1',
    fq: `storeId:(${[...stores.keys()].join(' OR ') || '0'})`
  });
  if (contains) {
    params.set('facet.contains', contains.slice(0, MAX_VALUE_LENGTH));
    params.set('facet.contains.ignoreCase', 'true');
  }
  const result = await querySolr(params);
  return pairs(result.facet_counts?.facet_fields[`attr_${id}`]);
};

// Attributes whose name matches, for picking one in the condition editor
export const findAttributes = async (term: string) => {
  const { attributes } = await getLookups();
  const needle = term.trim().toLocaleLowerCase('is');
  const matches: { id: number; name: string; group?: string }[] = [];
  for (const [id, attribute] of attributes) {
    if (attribute.name.toLocaleLowerCase('is').includes(needle))
      matches.push({ id, ...attribute });
    if (matches.length >= 50) break;
  }
  return matches.sort((a, b) => a.name.length - b.name.length).slice(0, 20);
};
