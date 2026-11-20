import { AutocompleteResult } from '../types';

interface SolrResponse<T> {
  responseHeader: {
    zkConnected: boolean;
    status: number;
    QTime: number;
  };
  response: {
    numFound: number;
    start: number;
    numFoundExact: boolean;
    docs: T[];
  };
}

// Marks the matched parts in the highlights, characters from the private use
// area so they can't appear in a product name
export const HIGHLIGHT_START = '';
export const HIGHLIGHT_END = '';

export type AutocompleteDoc = Omit<AutocompleteResult, 'matches'>;

export type SolrAutocompleteResponse = SolrResponse<AutocompleteDoc> & {
  // The whole name with the matched words marked, by document id
  highlighting?: Record<string, { name?: string[] }>;
};

// SOLR_URL may end with a slash or not, Solr answers 400 to a double slash
export const solrUrl = (path: string) =>
  `${(process.env.SOLR_URL ?? '').replace(/\/+$/, '')}/${path}`;

export interface SolrSelectResponse {
  response: { numFound: number; docs: Record<string, unknown>[] };
  facet_counts?: {
    facet_fields: Record<string, (string | number)[]>;
    facet_queries: Record<string, number>;
  };
  error?: { msg: string };
}

// The select handler of a core, the params are posted so long filters fit
export const selectSolr = async (
  core: string,
  params: URLSearchParams
): Promise<SolrSelectResponse> => {
  const response = await fetch(solrUrl(`${core}/select`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
    cache: 'no-store'
  });
  const body = (await response.json()) as SolrSelectResponse;
  if (!response.ok) {
    console.error('Solr select on %s failed', core, body.error?.msg);
    throw new Error(`Solr ${core} returned ${response.status}`);
  }
  return body;
};

// Adds or replaces documents. The autoSoftCommit of the core makes them
// searchable after a while, or at once with commit.
export const updateSolr = async (
  core: string,
  docs: object[],
  { commit = false } = {}
) => {
  const path = `${core}/update${commit ? '?softCommit=true' : ''}`;
  const response = await fetch(solrUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(docs),
    cache: 'no-store'
  });
  if (!response.ok)
    throw new Error(
      `Updating Solr core ${core} failed with ${response.status}: ${await response.text()}`
    );
};

export const querySolrAutocomplete = async (
  collection: string,
  query: string,
  // The query of the highlighting: the matches in the name field itself, the
  // query matches parts of words in fields with no stored value
  highlightQuery: string,
  filterQueries: string[] = []
) => {
  const params = new URLSearchParams({
    q: query,
    // The query names its fields, boosts and constant scores
    defType: 'lucene',
    // Every part of a word, FART-9 is fart and 9 in the name
    'q.op': 'AND',
    rows: '10',
    fl: 'id,storeId,name,sku',
    // The words of the name the query matched in each result, the matched
    // parts of the sku are found by the route. The unified highlighter matches
    // the wildcards of hl.q against the words of each result, not the index.
    hl: 'true',
    'hl.q': highlightQuery,
    'hl.qparser': 'lucene',
    'hl.method': 'unified',
    'hl.fl': 'name',
    'hl.requireFieldMatch': 'true',
    'hl.highlightMultiTerm': 'true',
    // The whole value instead of a fragment
    'hl.fragsize': '0',
    'hl.tag.pre': HIGHLIGHT_START,
    'hl.tag.post': HIGHLIGHT_END
  });
  for (const fq of filterQueries) params.append('fq', fq);
  const response = await fetch(solrUrl(`${collection}/select`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
    cache: 'no-store'
  });
  return response.json() as Promise<SolrAutocompleteResponse>;
};
