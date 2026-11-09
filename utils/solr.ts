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

export const querySolrAutocomplete = async (
  collection: string,
  query: string,
  filterQueries: string[] = []
) => {
  const params = {
    q: query,
    // The query names its fields and has wildcards, instead of the edismax
    // and qf of the handler
    defType: 'lucene',
    // Every part of a word, FART-9 is fart and 9 in the name
    'q.op': 'AND',
    //TODO: remove when I've updated the core
    fl: 'id,storeId,name,sku',
    // The words of the name the query matched in each result, the matched
    // parts of the sku are found by the route
    hl: 'true',
    'hl.method': 'unified',
    'hl.fl': 'name',
    'hl.requireFieldMatch': 'true',
    'hl.highlightMultiTerm': 'true',
    // The whole value instead of a fragment
    'hl.fragsize': '0',
    'hl.tag.pre': HIGHLIGHT_START,
    'hl.tag.post': HIGHLIGHT_END
  };
  const searchParams = new URLSearchParams(params);
  for (const fq of filterQueries) searchParams.append('fq', fq);
  const queryString = searchParams.toString();
  const response = await fetch(
    solrUrl(`${collection}/autocomplete?${queryString}`)
  );
  return response.json() as Promise<SolrAutocompleteResponse>;
};
