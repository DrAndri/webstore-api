// The fields and match types of the advanced search, shared by /api/search and
// the search page

export type MatchOp = 'contains' | 'startsWith' | 'endsWith' | 'exact';
export type ConditionOp = MatchOp | 'between' | 'is';

export interface SearchCondition {
  // A key of SEARCH_FIELDS or attr_<attributeId>
  field: string;
  op: ConditionOp;
  value?: string;
  value2?: string;
}

export type FieldKind = 'text' | 'words' | 'number' | 'date' | 'boolean';

// The labels of the match types are in the site namespace,
// searchFields.ops.<op>
export const MATCH_OPS: MatchOp[] = [
  'contains',
  'startsWith',
  'endsWith',
  'exact'
];

// The labels are in the site namespace, searchFields.fields.<key>
export type SearchFieldKey =
  | 'name'
  | 'sku'
  | 'ean'
  | 'description'
  | 'price'
  | 'inStock'
  | 'firstSeenDate'
  | 'lastChangeDate';

export const SEARCH_FIELDS: Record<
  SearchFieldKey,
  { kind: FieldKind; ops: ConditionOp[] }
> = {
  name: { kind: 'text', ops: MATCH_OPS },
  sku: { kind: 'text', ops: MATCH_OPS },
  ean: { kind: 'text', ops: MATCH_OPS },
  description: { kind: 'words', ops: ['contains', 'exact'] },
  price: { kind: 'number', ops: ['between'] },
  inStock: { kind: 'boolean', ops: ['is'] },
  firstSeenDate: { kind: 'date', ops: ['between'] },
  lastChangeDate: { kind: 'date', ops: ['between'] }
};

export const ATTRIBUTE_FIELD = /^attr_(\d+)$/;
export const attributeField = (id: number | string) => `attr_${id}`;

export const fieldKind = (field: string): FieldKind | undefined =>
  ATTRIBUTE_FIELD.test(field)
    ? 'text'
    : SEARCH_FIELDS[field as SearchFieldKey]?.kind;

export const fieldOps = (field: string): ConditionOp[] =>
  ATTRIBUTE_FIELD.test(field)
    ? MATCH_OPS
    : (SEARCH_FIELDS[field as SearchFieldKey]?.ops ?? []);

// The labels are in the site namespace, searchFields.sorts.<key>
export const SORTS = {
  relevance: { solr: 'score desc' },
  priceAsc: { solr: 'price asc' },
  priceDesc: { solr: 'price desc' },
  changed: { solr: 'lastChangeDate desc' },
  newest: { solr: 'firstSeenDate desc' }
} as const;
export type SortKey = keyof typeof SORTS;

// Price facet buckets in krónur, [from, to)
export const PRICE_RANGES: [number | null, number | null][] = [
  [null, 5000],
  [5000, 20000],
  [20000, 50000],
  [50000, 100000],
  [100000, 250000],
  [250000, null]
];
export const priceRangeKey = ([from, to]: [number | null, number | null]) =>
  `${from ?? ''}-${to ?? ''}`;

export interface SearchRequest {
  q?: string;
  conditions?: SearchCondition[];
  // Selected facet values: storeId, manufacturerId, categoryId, inStock,
  // active, price or attr_<id>
  filters?: Record<string, string[]>;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface SearchProduct {
  id: string;
  storeId: number;
  storeName: string;
  sku: string;
  name?: string;
  ean?: string;
  image?: string;
  price?: number;
  inStock?: boolean;
  manufacturer?: string;
  category?: string;
  lastChangeDate?: string;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

export interface Facet {
  key: string;
  label: string;
  group?: string;
  values: FacetValue[];
}

export interface SearchResponse {
  total: number;
  products: SearchProduct[];
  facets: Facet[];
  // False until the products core has the fields added for the advanced
  // search, matching is then approximate
  exactMatching: boolean;
}
