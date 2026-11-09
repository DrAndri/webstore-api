import { withApiAccess } from '../../../utils/apiAccess';
import {
  AutocompleteDoc,
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  querySolrAutocomplete,
  SolrAutocompleteResponse
} from '../../../utils/solr';
import { AutocompleteMatch, AutocompleteResult } from '../../../types';
import { hasActiveField } from '../../../utils/search';

type Range = [start: number, end: number];

// Letters ASCIIFoldingFilter folds to more than one letter or to another letter
// without an accent
const FOLDED: Record<string, string> = {
  þ: 'th',
  æ: 'ae',
  ð: 'd',
  ø: 'o',
  œ: 'oe',
  ß: 'ss',
  đ: 'd',
  ł: 'l'
};

// The value lower cased and without accents, like Solr indexes the name, with
// the offsets in the value where each folded character starts and ends
const fold = (value: string) => {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const char of value) {
    const lower = char.toLowerCase();
    const folded =
      FOLDED[lower] ?? lower.normalize('NFD').replace(/\p{M}/gu, '');
    for (let i = 0; i < folded.length; i++) {
      starts.push(offset);
      ends.push(offset + char.length);
    }
    text += folded;
    offset += char.length;
  }
  return { text, starts, ends };
};

// Where the longest of the words is in the value, as offsets into the value
const findLongest = (value: string, words: string[]): Range | undefined => {
  const folded = fold(value);
  let found: Range | undefined;
  let longest = 0;
  for (const word of words) {
    const index = folded.text.indexOf(word);
    if (index < 0 || word.length <= longest) continue;
    longest = word.length;
    found = [folded.starts[index], folded.ends[index + word.length - 1]];
  }
  return found;
};

// The offsets of the marked parts of a highlighted value, or nothing when the
// highlight is not the whole value
const markedRanges = (highlighted: string, value: string): Range[] => {
  const ranges: Range[] = [];
  let offset = 0;
  let start = 0;
  for (const char of highlighted) {
    if (char === HIGHLIGHT_START) start = offset;
    else if (char === HIGHLIGHT_END) ranges.push([start, offset]);
    else offset += char.length;
  }
  return offset === value.length ? ranges : [];
};

// Solr marks the whole words a word of the term is part of, and words next to
// each other as one range. Each word is marked on its own and only the typed
// part is kept, or the whole word when no word of the term is in it, like fart
// and 9 of fart-9.
const typedParts = (ranges: Range[], value: string, words: string[]) =>
  ranges.flatMap(([start, end]) =>
    [...value.slice(start, end).matchAll(/\S+/g)].map(
      ({ 0: word, index }): Range => {
        const wordStart = start + index;
        const [from, to] = findLongest(word, words) ?? [0, word.length];
        return [wordStart + from, wordStart + to];
      }
    )
  );

// The parts of the sku the whole term or its words are, ordered and merged
const skuParts = (sku: string, term: string, words: string[]) => {
  const ranges = [term, ...words]
    .map((part) => findLongest(sku, [part]))
    .filter((range): range is Range => range !== undefined)
    .sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: Range[] = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
};

const getMatches = (
  doc: AutocompleteDoc,
  term: string,
  highlighting: SolrAutocompleteResponse['highlighting']
): AutocompleteMatch[] => {
  const folded = fold(term).text;
  const words = folded.split(/\s+/).filter(Boolean);
  const matches: AutocompleteMatch[] = [];
  const name = highlighting?.[doc.id]?.name?.[0];
  if (name) {
    const ranges = typedParts(markedRanges(name, doc.name), doc.name, words);
    if (ranges.length > 0) matches.push({ field: 'name', ranges });
  }
  const sku = skuParts(doc.sku, folded, words);
  if (sku.length > 0) matches.push({ field: 'sku', ranges: sku });
  return matches;
};

// Only a backslash and a quote are special inside a phrase
const quote = (value: string) => `"${value.replace(/[\\"]/g, '\\$&')}"`;
// Every character the query parser reads as syntax, so the value is one term
const escape = (value: string) =>
  value.replace(/[+\-&|!(){}[\]^"~*?:\\/\s]/g, '\\$&');

// A word as a whole word or sku, the start of one or anywhere in one, ranked in
// that order and a sku above a name. One letter only matches the start of a
// word, anywhere would match almost every product.
const wordQuery = (word: string) => {
  const escaped = escape(word);
  const anywhere = word.length > 1;
  return `(${[
    `sku:${quote(word)}^8`,
    `sku:${escaped}*^4`,
    anywhere && `sku:*${escaped}*^2`,
    `name:${quote(word)}^4`,
    `name:${escaped}*^2`,
    anywhere && `name:*${escaped}*`
  ]
    .filter(Boolean)
    .join(' OR ')})`;
};

// Each word of the term in the name or the sku, so fart finds Fartölva, 1000XM
// finds WH1000XM6B.CE7 and sony 1000xm finds Sony headphones with that sku.
// A term with spaces also matches a sku with those spaces. The wildcards search
// name and sku, the fields every products core has, so the matching needs no
// reindex. The term is lower cased so a typed AND, OR or NOT is a word.
const autocompleteQuery = (term: string) => {
  const lower = term.toLowerCase();
  const words = lower.split(/\s+/);
  if (words.length === 1) return wordQuery(lower);
  return [
    `sku:${quote(lower)}^8`,
    `sku:*${escape(lower)}*^2`,
    `(${words.map(wordQuery).join(' AND ')})`
  ].join(' OR ');
};

export const POST = withApiAccess(async (request: Request) => {
  const searchSolr = async (term: string, includeInactive: boolean) => {
    // Products a store no longer sells are left out unless asked for. A product
    // indexed before the active field was added has no value and is kept.
    const filterQueries =
      !includeInactive && (await hasActiveField()) ? ['-active:false'] : [];
    const response = await querySolrAutocomplete(
      'products',
      autocompleteQuery(term),
      filterQueries
    );
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

  if (!term) {
    return Response.json({ total: 0, results: [] });
  }
  return searchSolr(term, body.includeInactive === true)
    .then((response) => {
      return Response.json(response);
    })
    .catch((error) => {
      console.log(error);
      return Response.error();
    });
});
