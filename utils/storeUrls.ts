// The scraper saves the url of a product relative to the start url in the
// config of its store, the rest of the url after it: /vara/x for
// https://s4s.is/premium-outlet/vara/x with the start url
// https://s4s.is/premium-outlet. A page outside the start url is saved as its
// absolute url. The same as crawler/ProductUrl.ts in webstore-scraper.
import { parse } from 'jsonc-parser';
import { getConfigFile } from './admin/github';

const TTL_MS = 60 * 60 * 1000;
// A config that could not be read is tried again sooner
const FAILED_TTL_MS = 60 * 1000;

declare global {
  // Pages and route handlers are bundled separately, the cache is shared
  // through globalThis
  var storeStartUrls:
    | Map<number, { at: number; ttl: number; value: Promise<string | null> }>
    | undefined;
}

const loadStartUrl = async (storeId: number): Promise<string | null> => {
  const file = await getConfigFile(storeId);
  if (!file) return null;
  const config: unknown = parse(file.text, [], { allowTrailingComma: true });
  const startUrl =
    config && typeof config === 'object' && 'startUrl' in config
      ? config.startUrl
      : undefined;
  return typeof startUrl === 'string' && URL.canParse(startUrl)
    ? startUrl
    : null;
};

const getStartUrl = (storeId: number): Promise<string | null> => {
  const cache = (global.storeStartUrls ??= new Map());
  const cached = cache.get(storeId);
  if (cached && Date.now() - cached.at < cached.ttl) return cached.value;
  const entry = { at: Date.now(), ttl: TTL_MS, value: loadStartUrl(storeId) };
  entry.value = entry.value.catch((e) => {
    console.error(`Reading the start url of store ${storeId} failed`, e);
    entry.ttl = FAILED_TTL_MS;
    return null;
  });
  cache.set(storeId, entry);
  return entry.value;
};

// The urls of products as absolute links to their pages in the stores, null
// when the site of the store is not known
export const productPageUrls = async (
  products: { storeId: number; url: string | null }[]
): Promise<(string | null)[]> => {
  const storeIds = [
    ...new Set(
      products
        .filter((product) => product.url && !/^https?:\/\//.test(product.url))
        .map((product) => product.storeId)
    )
  ];
  const startUrls = new Map(
    await Promise.all(
      storeIds.map(async (id) => [id, await getStartUrl(id)] as const)
    )
  );
  return products.map(({ storeId, url }) => {
    if (!url) return null;
    if (/^https?:\/\//.test(url)) return url;
    const startUrl = startUrls.get(storeId);
    if (!startUrl) return null;
    // Joined, not resolved, which would drop the path of the start url
    const start = new URL(startUrl);
    return start.origin + start.pathname.replace(/\/$/, '') + url;
  });
};
