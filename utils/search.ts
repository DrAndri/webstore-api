// Advanced product search on the Solr products core. A search is two queries:
// the products with their facets, then the values of the attribute facets.
// The stores in the search are cached from the stores core, the names of the
// manufacturers, categories and attributes are in the labels of the products.
import type { TFunction } from 'i18next';
import type { Format } from '../i18n/format';
import { ErrorMessage, HttpError } from './httpError';
import { selectSolr } from './solr';
import {
  attributeNames,
  escapeTerm,
  parseAttributeLabel,
  parseLabel,
  publicStores,
  storeFilter
} from './solrNames';
import {
  ATTRIBUTE_FACETS,
  ATTRIBUTE_FIELD,
  Facet,
  fieldKind,
  fieldOps,
  MAX_ATTRIBUTE_FACETS,
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
const PRODUCT_FIELDS =
  'id,storeId,manufacturerLabel,categoryLabel,sku,name,ean,image,inStock,price,lastChangeDate';

// A search that can not run, a 400 response with the message
export class SearchError extends HttpError {
  constructor(message: ErrorMessage) {
    super(400, message);
  }
}

const querySolr = (params: URLSearchParams) => selectSolr('products', params);

// Query building

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

// The start of the day, or of the next day for the end of a range, so the
// whole last day is in it
const parseDate = (value: string | undefined, nextDay: boolean) => {
  if (!value) return '*';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new SearchError({ key: 'search.notADate', values: { value } });
  return `${value}T00:00:00Z${nextDay ? '+1DAY' : ''}`;
};

const conditionClause = (condition: SearchCondition): string | undefined => {
  if (typeof condition?.field !== 'string')
    throw new SearchError({ key: 'search.invalidCondition' });
  const { field, op } = condition;
  const kind = fieldKind(field);
  if (!kind || !fieldOps(field).includes(op))
    throw new SearchError({ key: 'search.invalidCondition' });
  const attribute = ATTRIBUTE_FIELD.exec(field);
  const value = String(condition.value ?? '')
    .trim()
    .slice(0, MAX_VALUE_LENGTH);

  // An attribute between two numbers is on the number at the start of its
  // value, set by the scraper
  if (kind === 'number' || (attribute && op === 'between')) {
    const target = attribute ? `attrnum_${attribute[1]}` : field;
    return `${target}:[${parseNumber(condition.value)} TO ${parseNumber(condition.value2)}]`;
  }
  if (kind === 'date')
    return `${field}:[${parseDate(condition.value, false)} TO ${parseDate(condition.value2, true)}}`;
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

  // Keyword fields that are lowercased and accent folded, wildcards included.
  // The category is the name of the category or of one of its parents.
  const target = attribute ? `attrci_${attribute[1]}` : `${field}_ci`;
  return `${target}:${op === 'exact' ? quote(value) : wildcard(op, escapeTerm(value))}`;
};

const filterQuery = (key: string, values: string[]): string => {
  const tag = `{!tag=f_${key}}`;
  if (key === 'storeId' || key === 'manufacturerId' || key === 'categoryId') {
    const ids = values.map(Number).filter(Number.isInteger);
    if (ids.length === 0)
      throw new SearchError({ key: 'search.invalidFilter' });
    return `${tag}${key}:(${ids.join(' OR ')})`;
  }
  if (key === 'inStock' || key === 'active')
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
    .map(conditionClause)
    .filter((clause): clause is string => clause !== undefined);
  const filters = Object.entries(request.filters ?? {}).filter(
    ([, values]) => Array.isArray(values) && values.length > 0
  );
  const filterQueries = filters.map(([key, values]) =>
    filterQuery(key, values.slice(0, 50).map(String))
  );

  const params = new URLSearchParams();
  const q = (request.q ?? '').trim().slice(0, MAX_VALUE_LENGTH);
  if (q) {
    // Words only: operators in the free text are escaped, and lowercased so a
    // typed AND, OR or NOT is a word. Every field lowercases anyway.
    params.set('q', q.toLowerCase().split(/\s+/).map(escapeTerm).join(' '));
    params.set('defType', 'edismax');
    // name and sku match whole words and skus, name_prefix and sku_prefix the
    // start of them, so fart finds fartölva, ranked below a whole word
    params.set(
      'qf',
      'name^3 name_prefix^1.5 sku^4 sku_prefix^2 ean^4 manufacturer^2 category^1.5 description^0.5'
    );
    // Every word in one of the fields. Each word is analyzed on its own,
    // otherwise sku, which keeps the whole text as one token, makes edismax
    // apply mm to each field and every word has to be in the same field.
    params.set('mm', '100%');
    params.set('sow', 'true');
    // Products with the words next to each other in the name rank higher
    params.set('pf', 'name^5');
  } else {
    params.set('q', '*:*');
    params.set('defType', 'lucene');
  }
  const stores = await publicStores();
  params.append('fq', storeFilter(stores));
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
  // The labels have the names with the ids, filters are on the ids
  params.append('facet.field', '{!ex=f_manufacturerId}manufacturerLabel');
  params.append('facet.field', '{!ex=f_categoryId}categoryLabel');
  params.append('facet.field', '{!ex=f_inStock}inStock');
  params.append('facet.field', '{!ex=f_active}active');
  params.set('f.manufacturerLabel.facet.limit', '100');
  params.set('f.categoryLabel.facet.limit', '100');
  for (const range of PRICE_RANGES)
    params.append(
      'facet.query',
      `{!ex=f_price key=price_${priceRangeKey(range)}}${priceRangeQuery(range)}`
    );
  // One more than the limit tells if there are more
  const facetLimit = Math.min(
    Math.max(Math.trunc(Number(request.facetLimit)) || ATTRIBUTE_FACETS, 1),
    MAX_ATTRIBUTE_FACETS
  );
  params.append('facet.field', 'attrLabels');
  params.set('f.attrLabels.facet.limit', String(facetLimit + 1));

  const result = await querySolr(params);
  const fields = result.facet_counts?.facet_fields ?? {};
  const docs = result.response.docs;

  // The attributes most products in the result have, and the ones filtered on
  const topAttributes = pairs(fields.attrLabels);
  const moreFacets =
    topAttributes.length > facetLimit && facetLimit < MAX_ATTRIBUTE_FACETS;
  const attributes = new Map<number, { name: string; group?: string }>(
    topAttributes
      .slice(0, facetLimit)
      .map(({ value }) => parseAttributeLabel(value))
      .map((attribute) => [attribute.id, attribute])
  );
  const filteredIds = filters
    .map(([key]) => Number(ATTRIBUTE_FIELD.exec(key)?.[1]))
    .filter((id) => Number.isInteger(id) && !attributes.has(id));
  const attributeIds = [...attributes.keys(), ...filteredIds];
  // A filtered attribute is on every product in the result, so it is nearly
  // always in the top ones. When it is not, its name is read from its core.
  const [attributeFacets, filteredAttributes] = await Promise.all([
    attributeFacetValues(params, attributeIds),
    filteredIds.length ? attributeNames(filteredIds) : []
  ]);
  for (const attribute of filteredAttributes)
    attributes.set(attribute.id, attribute);

  // Values with the id and the name
  const labelValues = (list: (string | number)[] | undefined) =>
    pairs(list).flatMap(({ value, count }) => {
      const label = parseLabel(value);
      return label ? [{ value: label.id, count, label: label.name }] : [];
    });

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
      values: labelValues(fields.manufacturerLabel)
    },
    {
      key: 'categoryId',
      label: t('facets.categoryId'),
      values: labelValues(fields.categoryLabel)
    },
    ...attributeIds.map((id) => ({
      key: `attr_${id}`,
      label: attributes.get(id)?.name || t('facets.attribute', { id }),
      group: attributes.get(id)?.group,
      values: pairs(attributeFacets[`attr_${id}`]).map(({ value, count }) => ({
        value,
        count,
        label: value
      }))
    }))
  ].filter((facet) => facet.values.length > 0);

  const products: SearchProduct[] = docs.map((doc) => ({
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
    manufacturer: parseLabel(doc.manufacturerLabel)?.name,
    category: parseLabel(doc.categoryLabel)?.name,
    lastChangeDate: doc.lastChangeDate as string | undefined
  }));

  return {
    total: result.response.numFound,
    products,
    facets,
    moreFacets
  };
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
  const params = new URLSearchParams({
    q: '*:*',
    defType: 'lucene',
    rows: '0',
    facet: 'true',
    'facet.field': `attr_${id}`,
    'facet.limit': '30',
    'facet.mincount': '1',
    fq: storeFilter(await publicStores())
  });
  if (contains) {
    params.set('facet.contains', contains.slice(0, MAX_VALUE_LENGTH));
    params.set('facet.contains.ignoreCase', 'true');
  }
  const result = await querySolr(params);
  return pairs(result.facet_counts?.facet_fields[`attr_${id}`]);
};

// Attributes whose name matches, for picking one in the condition editor
export { findAttributes } from './solrNames';
