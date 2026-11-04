// Parsing, validation and comment preserving edits of the store config files
// (stores/<storeId>.jsonc in webstore-scraper). Used by both the api and the pages.
import type { TFunction } from 'i18next';
import {
  applyEdits,
  getLocation,
  modify,
  parse,
  type ParseError,
  printParseErrorCode
} from 'jsonc-parser';
import type { Resources } from '../../i18n/resources';
import { STRUCTURED_DATA_FIELDS, type WebshopCrawlerOptions } from './types';

// The messages are in the stores namespace. t comes from useTranslation in the
// pages and from getTranslation in the api, so they are in the user's language.
type ValidationKey = keyof Resources['stores']['validation'];
type Fail = (
  key: ValidationKey,
  path: string,
  values?: Record<string, string | number>
) => void;
type Rule = (value: unknown, path: string, fail: Fail) => void;
type Shape = Record<string, { rule: Rule; required?: boolean }>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str =
  (options: { nonEmpty?: boolean; url?: boolean } = {}): Rule =>
  (value, path, fail) => {
    if (typeof value !== 'string') fail('string', path);
    else if (options.nonEmpty && value.trim() === '') fail('nonEmpty', path);
    else if (options.url && !/^https?:\/\/[^/]+/.test(value)) fail('url', path);
  };

const bool: Rule = (value, path, fail) => {
  if (typeof value !== 'boolean') fail('boolean', path);
};

const oneOf =
  (values: readonly unknown[]): Rule =>
  (value, path, fail) => {
    if (!values.includes(value))
      fail('oneOf', path, { values: values.join(', ') });
  };

const arrayOf =
  (rule: Rule): Rule =>
  (value, path, fail) => {
    if (!Array.isArray(value)) fail('list', path);
    else value.forEach((item, i) => rule(item, `${path}[${i}]`, fail));
  };

const object =
  (shape: Shape): Rule =>
  (value, path, fail) => {
    if (!isObject(value)) {
      fail('object', path);
      return;
    }
    for (const [key, { rule, required }] of Object.entries(shape)) {
      if (value[key] === undefined) {
        if (required) fail('required', `${path}.${key}`);
      } else rule(value[key], `${path}.${key}`, fail);
    }
    for (const key of Object.keys(value)) {
      if (!(key in shape)) fail('unknown', `${path}.${key}`);
    }
  };

const selector = { rule: str({ nonEmpty: true }) };
const optionalString = { rule: str() };

const skuRule: Rule = (value, path, fail) => {
  if (typeof value === 'string')
    return str({ nonEmpty: true })(value, path, fail);
  if (isObject(value) && value.source === 'url')
    return object({
      source: { rule: oneOf(['url']), required: true },
      delimiter: { rule: str({ nonEmpty: true }), required: true },
      index: {
        rule: (index, indexPath) => {
          if (
            !(typeof index === 'number' && Number.isInteger(index)) &&
            index !== 'first' &&
            index !== 'last'
          )
            fail('skuIndex', indexPath);
        },
        required: true
      }
    })(value, path, fail);
  if (isObject(value) && value.source === 'attribute')
    return object({
      source: { rule: oneOf(['attribute']), required: true },
      selector: { rule: str({ nonEmpty: true }), required: true },
      attribute: { rule: str({ nonEmpty: true }), required: true }
    })(value, path, fail);
  fail('sku', path);
};

const structuredDataFieldRule: Rule = (value, path, fail) => {
  if (value === false || typeof value === 'string') return;
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return;
  fail('structuredDataField', path);
};

const selectorsRule = object({
  productPage: { ...selector, required: true },
  structuredData: {
    rule: object({
      source: { rule: oneOf(['jsonld', 'nextdata']), required: true },
      fields: {
        rule: object(
          Object.fromEntries(
            STRUCTURED_DATA_FIELDS.map((field) => [
              field,
              { rule: structuredDataFieldRule }
            ])
          )
        )
      },
      categorySplitter: optionalString
    })
  },
  // Empty optional selectors are used to skip a field
  oldPrice: optionalString,
  listPrice: optionalString,
  name: optionalString,
  sku: { rule: skuRule },
  image: optionalString,
  imageAttribute: optionalString,
  brand: optionalString,
  description: optionalString,
  inStock: optionalString,
  inStockText: optionalString,
  clickers: { rule: arrayOf(str({ nonEmpty: true })) },
  categories: optionalString,
  categorySplitter: optionalString,
  categoryItemLocator: optionalString,
  attributes: {
    rule: object({
      attributesTable: { ...selector, required: true },
      attributeGroup: selector,
      attribute: { ...selector, required: true },
      attributeLabel: { ...selector, required: true },
      attributeValue: { ...selector, required: true },
      attributeGroupName: selector
    })
  }
});

const configRule = object({
  storeId: {
    rule: (value, path, fail) => {
      if (!Number.isInteger(value) || (value as number) < 0)
        fail('storeId', path);
    },
    required: true
  },
  type: { rule: oneOf(['httpcrawler', 'crawler']), required: true },
  startUrl: { rule: str({ url: true }), required: true },
  productPageIdentifier: { rule: str({ nonEmpty: true }), required: true },
  selectors: { rule: selectorsRule, required: true },
  sanitizers: {
    rule: object({
      sku: {
        rule: arrayOf(
          object({
            match: { rule: str({ nonEmpty: true }), required: true },
            replace: { rule: str(), required: true }
          })
        ),
        required: true
      }
    })
  },
  urlWhitelist: { rule: arrayOf(str({ nonEmpty: true })) },
  urlBlacklist: { rule: arrayOf(str({ nonEmpty: true })) },
  startUrls: { rule: arrayOf(str({ url: true })) },
  sitemapUrls: { rule: arrayOf(str({ url: true })) },
  productFeed: {
    rule: object({
      // Absolute or relative to the start url
      url: { rule: str({ nonEmpty: true }), required: true },
      items: { rule: str({ nonEmpty: true }), required: true },
      productUrl: {
        rule: (value, path, fail) => {
          str({ nonEmpty: true })(value, path, fail);
          if (typeof value === 'string' && !/\{\w+(:\d+)?\}/.test(value))
            fail('productUrlField', path);
        },
        required: true
      }
    })
  },
  scrollPagesToBottom: { rule: bool },
  menuClicker: selector
});

// Returns a list of problems in the language of t, empty when the config is
// valid
export const validateStoreConfig = (
  value: unknown,
  t: TFunction<'stores'>,
  storeId?: number
): string[] => {
  const errors: string[] = [];
  // Paths are shown without the config. prefix
  const fail: Fail = (key, path, values) =>
    errors.push(
      t(`validation.${key}`, {
        ...values,
        path: path.replace(/^config\./, '')
      })
    );
  configRule(value, 'config', fail);
  if (errors.length === 0 && isObject(value))
    crossFieldErrors(value as unknown as WebshopCrawlerOptions, fail, storeId);
  return errors;
};

const crossFieldErrors = (
  config: WebshopCrawlerOptions,
  fail: Fail,
  storeId?: number
) => {
  if (storeId !== undefined && config.storeId !== storeId)
    fail('storeIdMismatch', 'config.storeId', { storeId });
  if (config.type === 'crawler') {
    if (config.selectors.structuredData)
      fail('needsHttpcrawler', 'config.selectors.structuredData');
    if (config.sitemapUrls?.length)
      fail('needsHttpcrawler', 'config.sitemapUrls');
    if (!config.selectors.listPrice)
      fail('listPriceCrawler', 'config.selectors.listPrice');
  } else if (!config.selectors.listPrice && !config.selectors.structuredData) {
    fail('listPriceStructured', 'config.selectors.listPrice');
  }
};

export const parseConfigText = (
  text: string,
  t: TFunction<'stores'>
): { value?: unknown; errors: string[] } => {
  const parseErrors: ParseError[] = [];
  const value: unknown = parse(text, parseErrors, { allowTrailingComma: true });
  if (parseErrors.length === 0) return { value, errors: [] };
  return {
    errors: parseErrors.map((e) => {
      const before = text.slice(0, e.offset).split('\n');
      return t('validation.syntax', {
        error: printParseErrorCode(e.error),
        line: before.length,
        column: before[before.length - 1].length + 1
      });
    })
  };
};

// Parses and validates the text of a config file
export const checkConfigText = (
  text: string,
  t: TFunction<'stores'>,
  storeId?: number
) => {
  const { value, errors } = parseConfigText(text, t);
  if (errors.length > 0) return { errors };
  return {
    value: value as WebshopCrawlerOptions,
    errors: validateStoreConfig(value, t, storeId)
  };
};

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  (isObject(value) && Object.keys(value).length === 0);

// Removes the empty values a form leaves behind, unless the original config had
// that setting
export const pruneConfig = (value: unknown, original?: unknown): unknown => {
  // In list items an empty string is a value, e.g. replace: '' removes the match
  if (Array.isArray(value))
    return value
      .map((item) =>
        isObject(item)
          ? Object.fromEntries(
              Object.entries(item).filter(
                ([, v]) => v !== undefined && v !== null
              )
            )
          : item
      )
      .filter((item) => !isEmpty(item));
  if (!isObject(value)) return value;
  const originalObject = isObject(original) ? original : {};
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const pruned = pruneConfig(child, originalObject[key]);
    const keep =
      !isEmpty(pruned) ||
      (pruned !== undefined && pruned !== null && key in originalObject);
    if (keep) result[key] = pruned;
  }
  return result;
};

const deepEqual = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const formattingOptions = { insertSpaces: true, tabSize: 2, eol: '\n' };

// Applies the changes between oldValue and newValue to the text of a config
// file, so comments and formatting outside the changed settings are kept
export const applyConfigChanges = (
  text: string,
  oldValue: unknown,
  newValue: unknown,
  path: (string | number)[] = []
): string => {
  if (isObject(oldValue) && isObject(newValue)) {
    const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
    for (const key of keys) {
      text = applyConfigChanges(text, oldValue[key], newValue[key], [
        ...path,
        key
      ]);
    }
    return text;
  }
  if (deepEqual(oldValue, newValue)) return text;
  return applyEdits(text, modify(text, path, newValue, { formattingOptions }));
};

export const newConfigText = (config: WebshopCrawlerOptions) =>
  JSON.stringify(config, null, 2) + '\n';

// The path of the setting at a position in the text, for showing where an
// error is in the raw editor
export const pathAtOffset = (text: string, offset: number) =>
  getLocation(text, offset).path.join('.');

export interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'hunk';
  text: string;
}

// Line diff of two texts with a few lines of context around the changes
export const diffLines = (before: string, after: string, context = 3) => {
  const a = before.split('\n');
  const b = after.split('\n');
  // Longest common subsequence table, the files are small
  const lcs = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const all: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      all.push({ type: 'context', text: a[i] });
      i++;
      j++;
    } else if (
      i < a.length &&
      (j >= b.length || lcs[i + 1][j] >= lcs[i][j + 1])
    ) {
      all.push({ type: 'remove', text: a[i++] });
    } else {
      all.push({ type: 'add', text: b[j++] });
    }
  }

  const visible = all.map((line, index) =>
    all
      .slice(Math.max(0, index - context), index + context + 1)
      .some((near) => near.type !== 'context')
  );
  const result: DiffLine[] = [];
  all.forEach((line, index) => {
    if (!visible[index]) return;
    if (index > 0 && !visible[index - 1])
      result.push({ type: 'hunk', text: '…' });
    result.push(line);
  });
  return result;
};

// Lines of a unified diff from the GitHub api
export const patchLines = (patch: string): DiffLine[] =>
  patch.split('\n').map((line) => {
    if (line.startsWith('@@')) return { type: 'hunk', text: line };
    if (line.startsWith('+')) return { type: 'add', text: line.slice(1) };
    if (line.startsWith('-')) return { type: 'remove', text: line.slice(1) };
    return { type: 'context', text: line.slice(1) };
  });
