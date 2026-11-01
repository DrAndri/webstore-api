import { withApiAccess } from '../../../utils/apiAccess';
import { escapeRegExp } from 'lodash';
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

const getMatches = (
  doc: AutocompleteDoc,
  term: string,
  highlighting: SolrAutocompleteResponse['highlighting']
): AutocompleteMatch[] => {
  const highlights = highlighting?.[doc.id] ?? {};
  const matches: AutocompleteMatch[] = [];
  const name = highlights.name?.[0];
  if (name) {
    const ranges = markedRanges(name, doc.name);
    if (ranges.length > 0) matches.push({ field: 'name', ranges });
  }
  const sku = highlights.sku?.[0];
  if (sku) {
    // The sku is indexed as prefixes of the whole value, so Solr marks all of
    // it. The part that matched is the term.
    const ranges = doc.sku.toLowerCase().startsWith(term.toLowerCase())
      ? [[0, term.length] as [number, number]]
      : markedRanges(sku, doc.sku);
    if (ranges.length > 0) matches.push({ field: 'sku', ranges });
  }
  return matches;
};

export const POST = withApiAccess(async (request: Request) => {
  const searchSolr = async (safeTerm: string, term: string) => {
    const response = await querySolrAutocomplete('products', `*:"${safeTerm}"`);
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
  const safeTerm = escapeRegExp(term);

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
