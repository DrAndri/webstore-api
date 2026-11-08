import { queryPool } from './mariadb';
import { getLookups } from './search';
import { productPageUrls } from './storeUrls';

export { MAX_COMPARED } from './compareLimits';

export interface ComparedProduct {
  id: string;
  storeId: number;
  storeName: string;
  sku: string;
  name: string | null;
  ean: string | null;
  image: string | null;
  description: string | null;
  // The page of the product in the store
  url: string | null;
  inStock: boolean | null;
  manufacturer: string | null;
  category: string | null;
  firstSeenDate: string;
  lastChangeDate: string;
  // The price in the last scan of the store, and the sale price if it is active
  price: number | null;
  salePrice: number | null;
  lowestPrice: number | null;
  lowestPriceDate: string | null;
  attributes: { group: string | null; name: string; value: string }[];
}

interface ProductRow {
  id: number;
  storeId: number;
  storeName: string;
  sku: string;
  name: string | null;
  ean: string | null;
  image: string | null;
  description: string | null;
  url: string | null;
  inStock: number | null;
  manufacturer: string | null;
  categoryId: number | null;
  firstSeenDate: Date;
  lastChangeDate: Date;
  lastScanDate: Date | null;
}

interface PriceRow {
  productId: number;
  price: number;
  start: Date;
  end: Date;
}

export type PricePeriod = Pick<PriceRow, 'price' | 'start' | 'end'>;

// The latest price, the latest sale price and the latest of the lowest prices
// of a product
export interface PriceSummary {
  price?: PricePeriod;
  sale?: PricePeriod;
  lowest?: PricePeriod;
}

// The price summary of each of the products, by id
const priceSummaries = async (
  ids: number[]
): Promise<Map<number, PriceSummary>> => {
  const [prices, salePrices, lowest] = await Promise.all([
    queryPool<PriceRow[]>(
      `SELECT productId, price, start, end FROM prices p
       WHERE productId IN (?) AND start = (SELECT MAX(start) FROM prices WHERE productId = p.productId)`,
      [ids]
    ),
    queryPool<PriceRow[]>(
      `SELECT productId, price, start, end FROM salePrices p
       WHERE productId IN (?) AND start = (SELECT MAX(start) FROM salePrices WHERE productId = p.productId)`,
      [ids]
    ),
    queryPool<PriceRow[]>(
      `SELECT productId, price, start, end FROM prices p
       WHERE productId IN (?) AND price = (SELECT MIN(price) FROM prices WHERE productId = p.productId)
       ORDER BY start DESC`,
      [ids]
    )
  ]);
  const summaries = new Map<number, PriceSummary>();
  const add = (rows: PriceRow[], key: keyof PriceSummary) => {
    for (const row of rows) {
      const id = Number(row.productId);
      const summary = summaries.get(id) ?? {};
      // The first row of a product is the latest
      summary[key] ??= row;
      summaries.set(id, summary);
    }
  };
  add(prices, 'price');
  add(salePrices, 'sale');
  add(lowest, 'lowest');
  return summaries;
};

// The price summary from the whole price history of a product, oldest first
export const summarizePriceHistory = (
  prices: PricePeriod[],
  salePrices: PricePeriod[]
): PriceSummary => ({
  price: prices.at(-1),
  sale: salePrices.at(-1),
  lowest: prices.reduce<PricePeriod | undefined>(
    (lowest, row) =>
      !lowest ||
      row.price < lowest.price ||
      (row.price === lowest.price && row.start >= lowest.start)
        ? row
        : lowest,
    undefined
  )
});

const day = (date: Date | null) =>
  date ? date.toISOString().slice(0, 10) : null;

// Products of stores in the public search, in the order of ids. The price
// summaries are read from the database unless they are given, as a promise so
// they can be read at the same time as the products.
export const compareProducts = async (
  ids: number[],
  knownSummaries?: Promise<Map<number, PriceSummary>>
): Promise<ComparedProduct[]> => {
  if (ids.length === 0) return [];
  const [products, summaries, attributes, { categories }] = await Promise.all([
    queryPool<ProductRow[]>(
      `SELECT p.id, p.storeId, s.name AS storeName, p.sku, p.name, p.ean, p.image, p.description,
           p.url, p.inStock, m.name AS manufacturer, p.categoryId, p.firstSeenDate, p.lastChangeDate, s.lastScanDate
         FROM products p JOIN stores s ON s.id = p.storeId LEFT JOIN manufacturers m ON m.id = p.manufacturerId
         WHERE p.id IN (?) AND s.apiEnabled = true`,
      [ids]
    ),
    knownSummaries ?? priceSummaries(ids),
    queryPool<
      {
        productId: number;
        groupName: string | null;
        name: string;
        value: string;
      }[]
    >(
      `SELECT ap.productId, g.name AS groupName, a.name, ap.value
         FROM attributeToProducts ap JOIN attributes a ON a.id = ap.attributeId
         LEFT JOIN attributeGroups g ON g.id = a.groupId
         WHERE ap.productId IN (?) ORDER BY g.name, a.name`,
      [ids]
    ),
    getLookups()
  ]);

  const urls = await productPageUrls(
    products.map((product) => ({
      storeId: Number(product.storeId),
      url: product.url
    }))
  );

  const result = products.map((product, index) => {
    const id = Number(product.id);
    const { price, sale, lowest } = summaries.get(id) ?? {};
    const lastScan = day(product.lastScanDate);
    // Prices are extended to the date of each scan they are seen in
    const current = (row: PricePeriod | undefined) =>
      row && (!lastScan || day(row.end)! >= lastScan) ? row.price : null;
    return {
      id: String(id),
      storeId: Number(product.storeId),
      storeName: product.storeName,
      sku: product.sku,
      name: product.name,
      ean: product.ean,
      image: product.image?.startsWith('http') ? product.image : null,
      description: product.description,
      url: urls[index],
      inStock: product.inStock === null ? null : !!product.inStock,
      manufacturer: product.manufacturer,
      category: product.categoryId
        ? (categories.get(Number(product.categoryId)) ?? null)
        : null,
      firstSeenDate: day(product.firstSeenDate)!,
      lastChangeDate: day(product.lastChangeDate)!,
      price: current(price),
      salePrice: current(sale),
      lowestPrice: lowest?.price ?? null,
      lowestPriceDate: day(lowest?.start ?? null),
      attributes: attributes
        .filter((attribute) => Number(attribute.productId) === id)
        .map(({ groupName, name, value }) => ({
          group: groupName,
          name,
          value
        }))
    };
  });
  return ids
    .map((id) => result.find((product) => product.id === String(id)))
    .filter((product): product is ComparedProduct => product !== undefined);
};
