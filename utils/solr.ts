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
  // The whole field value with the matched parts marked, by document id
  highlighting?: Record<
    string,
    {
      name?: string[];
      sku?: string[];
      name_prefix?: string[];
      sku_prefix?: string[];
    }
  >;
};

// SOLR_URL may end with a slash or not, Solr answers 400 to a double slash
export const solrUrl = (path: string) =>
  `${(process.env.SOLR_URL ?? '').replace(/\/+$/, '')}/${path}`;

export const querySolrAutocomplete = async (
  collection: string,
  query: string
) => {
  const params = {
    q: query,
    // Every part of a word, FART-9 is fart and 9 in the name
    'q.op': 'AND',
    //TODO: remove when I've updated the core
    fl: 'id,storeId,name,sku',
    // What the query matched in each result
    hl: 'true',
    'hl.method': 'unified',
    // name and sku match whole words and skus, the _prefix fields their
    // prefixes
    'hl.fl': 'name,sku,name_prefix,sku_prefix',
    'hl.requireFieldMatch': 'true',
    // The whole value instead of a fragment
    'hl.fragsize': '0',
    'hl.tag.pre': HIGHLIGHT_START,
    'hl.tag.post': HIGHLIGHT_END
  };
  const queryString = new URLSearchParams(params).toString();
  const response = await fetch(
    solrUrl(`${collection}/autocomplete?${queryString}`)
  );
  return response.json() as Promise<SolrAutocompleteResponse>;
};
