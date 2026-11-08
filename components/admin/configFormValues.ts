// Converts between store configs and the values of StoreConfigForm
import {
  AttributeSelectors,
  ProductFeed,
  ProductSanitizer,
  ProductSelectors,
  StructuredDataField,
  WebshopCrawlerOptions
} from '../../utils/admin/types';

export type ConfigSection =
  | 'basics'
  | 'crawling'
  | 'structured'
  | 'selectors'
  | 'attributes'
  | 'sanitizers';

interface StructuredFieldOverride {
  field: StructuredDataField;
  mode: 'paths' | 'skip';
  paths?: string[];
}

export interface ConfigFormValues {
  type: WebshopCrawlerOptions['type'];
  startUrl: string;
  productPageIdentifier: string;
  urlWhitelist?: string[];
  urlBlacklist?: string[];
  // keepQueryParams unset, [] or a list of parameters
  queryParams: 'all' | 'none' | 'some';
  keepQueryParams?: string[];
  startUrls?: string[];
  sitemapUrls?: string[];
  productFeed?: Partial<ProductFeed>;
  scrollPagesToBottom?: boolean;
  menuClicker?: string;
  selectors: Omit<ProductSelectors, 'sku' | 'structuredData' | 'attributes'> & {
    attributes?: AttributeSelectors;
  };
  skuSource: 'css' | 'url' | 'attribute' | 'json';
  skuCss?: string;
  skuUrl?: { delimiter?: string; index?: string };
  skuAttribute?: { selector?: string; attribute?: string };
  skuJson?: { selector?: string; path?: string };
  useStructuredData: boolean;
  structuredData?: {
    source: 'jsonld' | 'nextdata';
    categorySplitter?: string;
    fields?: StructuredFieldOverride[];
  };
  useAttributes: boolean;
  skuSanitizers?: ProductSanitizer[];
}

export const toFormValues = (
  config: Partial<WebshopCrawlerOptions>
): ConfigFormValues => {
  const { sku, structuredData, attributes, ...selectors } =
    config.selectors ?? ({} as ProductSelectors);
  return {
    type: config.type ?? 'httpcrawler',
    startUrl: config.startUrl ?? '',
    productPageIdentifier: config.productPageIdentifier ?? '',
    urlWhitelist: config.urlWhitelist,
    urlBlacklist: config.urlBlacklist,
    queryParams:
      config.keepQueryParams === undefined
        ? 'all'
        : config.keepQueryParams.length === 0
          ? 'none'
          : 'some',
    keepQueryParams: config.keepQueryParams,
    startUrls: config.startUrls,
    sitemapUrls: config.sitemapUrls,
    productFeed: config.productFeed,
    scrollPagesToBottom: config.scrollPagesToBottom,
    menuClicker: config.menuClicker,
    selectors: { ...selectors, attributes },
    skuSource: typeof sku === 'object' ? sku.source : 'css',
    skuCss: typeof sku === 'string' ? sku : undefined,
    skuUrl:
      typeof sku === 'object' && sku.source === 'url'
        ? { delimiter: sku.delimiter, index: String(sku.index) }
        : undefined,
    skuAttribute:
      typeof sku === 'object' && sku.source === 'attribute'
        ? { selector: sku.selector, attribute: sku.attribute }
        : undefined,
    skuJson:
      typeof sku === 'object' && sku.source === 'json'
        ? { selector: sku.selector, path: sku.path }
        : undefined,
    useStructuredData: structuredData !== undefined,
    structuredData: structuredData && {
      source: structuredData.source,
      categorySplitter: structuredData.categorySplitter,
      fields: Object.entries(structuredData.fields ?? {}).map(
        ([field, value]) => ({
          field: field as StructuredDataField,
          mode: value === false ? 'skip' : 'paths',
          paths:
            value === false ? undefined : ([] as string[]).concat(value ?? [])
        })
      )
    },
    useAttributes: attributes !== undefined,
    skuSanitizers: config.sanitizers?.sku
  };
};

// The config for the form values, empty values are removed by pruneConfig
export const fromFormValues = (
  values: ConfigFormValues,
  storeId: number
): WebshopCrawlerOptions => {
  const { attributes, productPage, ...selectors } = values.selectors ?? {};
  const sku =
    values.skuSource === 'url'
      ? {
          source: 'url' as const,
          delimiter: values.skuUrl?.delimiter ?? '',
          index: /^-?\d+$/.test(values.skuUrl?.index ?? '')
            ? Number(values.skuUrl?.index)
            : ((values.skuUrl?.index ?? 'last') as 'first' | 'last')
        }
      : values.skuSource === 'attribute'
        ? {
            source: 'attribute' as const,
            selector: values.skuAttribute?.selector ?? '',
            attribute: values.skuAttribute?.attribute ?? ''
          }
        : values.skuSource === 'json'
          ? {
              source: 'json' as const,
              selector: values.skuJson?.selector ?? '',
              path: values.skuJson?.path ?? ''
            }
          : values.skuCss;
  const structuredData =
    values.useStructuredData && values.structuredData
      ? {
          source: values.structuredData.source,
          fields: Object.fromEntries(
            (values.structuredData.fields ?? [])
              .filter((override) => override?.field)
              .map((override) => [
                override.field,
                override.mode === 'skip'
                  ? false
                  : (override.paths ?? []).length === 1
                    ? override.paths![0]
                    : (override.paths ?? [])
              ])
          ),
          categorySplitter: values.structuredData.categorySplitter
        }
      : undefined;
  return {
    storeId,
    startUrl: values.startUrl?.trim(),
    type: values.type,
    productPageIdentifier: values.productPageIdentifier,
    urlWhitelist: values.urlWhitelist,
    urlBlacklist: values.urlBlacklist,
    keepQueryParams:
      values.queryParams === 'none'
        ? []
        : values.queryParams === 'some'
          ? values.keepQueryParams
          : undefined,
    startUrls: values.startUrls,
    sitemapUrls: values.sitemapUrls,
    productFeed: values.productFeed as ProductFeed | undefined,
    scrollPagesToBottom:
      values.type === 'crawler' && values.scrollPagesToBottom
        ? true
        : undefined,
    menuClicker: values.type === 'crawler' ? values.menuClicker : undefined,
    selectors: {
      productPage,
      ...(values.type === 'httpcrawler' ? { structuredData } : {}),
      ...selectors,
      sku,
      clickers: values.type === 'crawler' ? selectors.clickers : undefined,
      attributes: values.useAttributes ? attributes : undefined
    },
    sanitizers: values.skuSanitizers?.length
      ? { sku: values.skuSanitizers }
      : undefined
  } as WebshopCrawlerOptions;
};
