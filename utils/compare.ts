import { queryPool } from './mariadb';
import { getLookups } from './search';

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

const day = (date: Date | null) =>
  date ? date.toISOString().slice(0, 10) : null;

// Products of stores in the public search, in the order of ids
export const compareProducts = async (
  ids: number[]
): Promise<ComparedProduct[]> => {
  if (ids.length === 0) return [];
  const [products, prices, salePrices, lowest, attributes, { categories }] =
    await Promise.all([
      queryPool<ProductRow[]>(
        `SELECT p.id, p.storeId, s.name AS storeName, p.sku, p.name, p.ean, p.image, p.description,
           p.inStock, m.name AS manufacturer, p.categoryId, p.firstSeenDate, p.lastChangeDate, s.lastScanDate
         FROM products p JOIN stores s ON s.id = p.storeId LEFT JOIN manufacturers m ON m.id = p.manufacturerId
         WHERE p.id IN (?) AND s.apiEnabled = true`,
        [ids]
      ),
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
      ),
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

  const byProduct = <T extends { productId: number }>(rows: T[]) => {
    const map = new Map<number, T>();
    for (const row of rows)
      if (!map.has(Number(row.productId))) map.set(Number(row.productId), row);
    return map;
  };
  const priceMap = byProduct(prices);
  const saleMap = byProduct(salePrices);
  const lowestMap = byProduct(lowest);

  const result = products.map((product) => {
    const id = Number(product.id);
    const price = priceMap.get(id);
    const sale = saleMap.get(id);
    const lastScan = day(product.lastScanDate);
    // Prices are extended to the date of each scan they are seen in
    const current = (row: PriceRow | undefined) =>
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
      inStock: product.inStock === null ? null : !!product.inStock,
      manufacturer: product.manufacturer,
      category: product.categoryId
        ? (categories.get(Number(product.categoryId)) ?? null)
        : null,
      firstSeenDate: day(product.firstSeenDate)!,
      lastChangeDate: day(product.lastChangeDate)!,
      price: current(price),
      salePrice: current(sale),
      lowestPrice: lowestMap.get(id)?.price ?? null,
      lowestPriceDate: day(lowestMap.get(id)?.start ?? null),
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
