import { withApiAccess } from '../../../utils/apiAccess';
import {
  AutocompleteDoc,
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  querySolrAutocomplete,
  SolrAutocompleteResponse
} from '../../../utils/solr';
import { AutocompleteMatch, AutocompleteResult } from '../../../types';

// The offsets of the marked parts of a highlighted value, or nothing when the
// highlight is not the whole value
const markedRanges = (
  highlighted: string,
  value: string
): AutocompleteMatch['ranges'] => {
  const ranges: AutocompleteMatch['ranges'] = [];
  let offset = 0;
  let start = 0;
  for (const char of highlighted) {
    if (char === HIGHLIGHT_START) start = offset;
    else if (char === HIGHLIGHT_END) ranges.push([start, offset]);
    else offset += char.length;
  }
  return offset === value.length ? ranges : [];
};

// Solr marks the whole words a prefix matched, and words next to each other as
// one range. Each word is marked on its own and only the typed part is kept of
// a word that starts with one of the words of the term.
const typedParts = (
  ranges: AutocompleteMatch['ranges'],
  value: string,
  term: string
): AutocompleteMatch['ranges'] => {
  const typed = term.toLowerCase().split(/\s+/).filter(Boolean);
  return ranges.flatMap(([start, end]) =>
    [...value.slice(start, end).matchAll(/\S+/g)].map(
      ({ 0: word, index }): [number, number] => {
        const wordStart = start + index;
        const longest = Math.max(
          0,
          ...typed
            .filter((t) => word.toLowerCase().startsWith(t))
            .map((t) => t.length)
        );
        return [wordStart, wordStart + (longest || word.length)];
      }
    )
  );
};

const getMatches = (
  doc: AutocompleteDoc,
  term: string,
  highlighting: SolrAutocompleteResponse['highlighting']
): AutocompleteMatch[] => {
  const highlights = highlighting?.[doc.id] ?? {};
  const matches: AutocompleteMatch[] = [];
  // name_prefix matches every word name does and the prefixes too, name is
  // used until the products are reindexed with name_prefix
  const namePrefix = highlights.name_prefix?.[0];
  const name = namePrefix ?? highlights.name?.[0];
  if (name) {
    const marked = markedRanges(name, doc.name);
    const ranges = namePrefix ? typedParts(marked, doc.name, term) : marked;
    if (ranges.length > 0) matches.push({ field: 'name', ranges });
  }
  const sku = highlights.sku_prefix?.[0] ?? highlights.sku?.[0];
  if (sku) {
    // The sku is matched as a whole value or its prefixes, so Solr marks all
    // of it. The part that matched is the term.
    const ranges = doc.sku.toLowerCase().startsWith(term.toLowerCase())
      ? [[0, term.length] as [number, number]]
      : markedRanges(sku, doc.sku);
    if (ranges.length > 0) matches.push({ field: 'sku', ranges });
  }
  return matches;
};

export const POST = withApiAccess(async (request: Request) => {
  const searchSolr = async (safeTerm: string, term: string) => {
    // A phrase in the qf fields of the handler. Not *:"…", edismax reads *: as
    // a wildcard of its own, matching every word and sku that ends with a colon
    const response = await querySolrAutocomplete('products', `"${safeTerm}"`);
    return {
      total: response.response.numFound,
      results: response.response.docs
        .splice(0, 20)
        .map((doc): AutocompleteResult => ({
          ...doc,
          matches: getMatches(doc, term, response.highlighting)
        }))
    };
  };

  const body = await request.json();
  const term = typeof body.term === 'string' ? body.term.trim() : '';
  // Only a backslash and a quote are special inside a phrase
  const safeTerm = term.replace(/[\\"]/g, '\\$&');

  if (!safeTerm) {
    return Response.json({ total: 0, results: [] });
  }
  return searchSolr(safeTerm, term)
    .then((response) => {
      return Response.json(response);
    })
    .catch((error) => {
      console.log(error);
      return Response.error();
    });
});
