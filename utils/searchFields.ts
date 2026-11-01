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

export const MATCH_OPS: MatchOp[] = [
  'contains',
  'startsWith',
  'endsWith',
  'exact'
];

export const SEARCH_FIELDS: Record<
  string,
  { label: string; kind: FieldKind; ops: ConditionOp[] }
> = {
  name: { label: 'Heiti', kind: 'text', ops: MATCH_OPS },
  sku: { label: 'Vörunúmer', kind: 'text', ops: MATCH_OPS },
  ean: { label: 'Strikamerki', kind: 'text', ops: MATCH_OPS },
  description: { label: 'Lýsing', kind: 'words', ops: ['contains', 'exact'] },
  price: { label: 'Verð', kind: 'number', ops: ['between'] },
  inStock: { label: 'Á lager', kind: 'boolean', ops: ['is'] },
  firstSeenDate: { label: 'Fyrst skráð', kind: 'date', ops: ['between'] },
  lastChangeDate: { label: 'Síðast breytt', kind: 'date', ops: ['between'] }
};

export const ATTRIBUTE_FIELD = /^attr_(\d+)$/;
export const attributeField = (id: number | string) => `attr_${id}`;

export const OP_LABELS: Record<ConditionOp, string> = {
  contains: 'inniheldur',
  startsWith: 'byrjar á',
  endsWith: 'endar á',
  exact: 'er nákvæmlega',
  between: 'á bilinu',
  is: 'er'
};

export const fieldKind = (field: string): FieldKind | undefined =>
  ATTRIBUTE_FIELD.test(field) ? 'text' : SEARCH_FIELDS[field]?.kind;

export const fieldOps = (field: string): ConditionOp[] =>
  ATTRIBUTE_FIELD.test(field) ? MATCH_OPS : (SEARCH_FIELDS[field]?.ops ?? []);

export const SORTS = {
  relevance: { label: 'Mikilvægi', solr: 'score desc' },
  priceAsc: { label: 'Lægsta verð', solr: 'price asc' },
  priceDesc: { label: 'Hæsta verð', solr: 'price desc' },
  changed: { label: 'Nýjast breytt', solr: 'lastChangeDate desc' },
  newest: { label: 'Nýjustu vörur', solr: 'firstSeenDate desc' }
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
  // Selected facet values: storeId, manufacturerId, categoryId, inStock, price
  // or attr_<id>
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
