import { Price } from '../types';
import {
  ComparedProduct,
  compareProducts,
  summarizePriceHistory
} from './compare';
import { queryPool } from './mariadb';

export interface ProductDetails extends ComparedProduct {
  // Every price the product has had, oldest first. A price lasts from start
  // to end, the day of the last scan it was seen in.
  prices: Price[];
  salePrices: Price[];
  highestPrice: number | null;
  // The last scan the product was in
  lastSeenDate: string | null;
  // The product and the ones with the same SKU in other stores of the public
  // search, by store name. Empty when no other store has the SKU.
  sameSku: SameSkuProduct[];
}

export interface SameSkuProduct {
  id: string;
  storeId: number;
  storeName: string;
  name: string | null;
  inStock: boolean | null;
  // As in the last scan of the store, like the price of ComparedProduct
  price: number | null;
  salePrice: number | null;
}

interface SameSkuRow {
  id: number;
  storeId: number;
  storeName: string;
  name: string | null;
  inStock: number | null;
  lastScanDate: Date | null;
  price: number | null;
  priceEnd: Date | null;
  salePrice: number | null;
  saleEnd: Date | null;
}

interface PriceRow {
  price: number;
  start: Date;
  end: Date;
}

interface HistoryRow extends PriceRow {
  sale: number;
}

const toPrice = (row: PriceRow): Price => ({
  price: row.price,
  start: row.start.toISOString().slice(0, 10),
  end: row.end.toISOString().slice(0, 10)
});

const day = (date: Date) => date.toISOString().slice(0, 10);

// The products with the SKU of the product in the stores of the public search,
// the product included. The unique index on (storeId, sku) finds them store by
// store.
const sameSkuProducts = async (id: number): Promise<SameSkuProduct[]> => {
  const rows = await queryPool<SameSkuRow[]>(
    `SELECT p.id, p.storeId, s.name AS storeName, p.name, p.inStock, s.lastScanDate,
       pr.price, pr.end AS priceEnd, sp.price AS salePrice, sp.end AS saleEnd
     FROM stores s JOIN products p ON p.storeId = s.id
       AND p.sku = (SELECT sku FROM products WHERE id = ?)
     LEFT JOIN prices pr ON pr.productId = p.id
       AND pr.start = (SELECT MAX(start) FROM prices WHERE productId = p.id)
     LEFT JOIN salePrices sp ON sp.productId = p.id
       AND sp.start = (SELECT MAX(start) FROM salePrices WHERE productId = p.id)
     WHERE s.apiEnabled = true
     ORDER BY s.name`,
    [id]
  );
  if (rows.length < 2) return [];
  return rows.map((row) => {
    const lastScan = row.lastScanDate ? day(row.lastScanDate) : null;
    // Prices are extended to the date of each scan they are seen in
    const current = (price: number | null, end: Date | null) =>
      price !== null && end && (!lastScan || day(end) >= lastScan)
        ? price
        : null;
    return {
      id: String(row.id),
      storeId: Number(row.storeId),
      storeName: row.storeName,
      name: row.name,
      inStock: row.inStock === null ? null : !!row.inStock,
      price: current(row.price, row.priceEnd),
      salePrice: current(row.salePrice, row.saleEnd)
    };
  });
};

// A product of a store in the public search with its whole price history. The
// current and lowest prices come from the history, so the product, its history
// and the products with the same SKU are all read at the same time.
export const productDetails = async (
  id: number
): Promise<ProductDetails | undefined> => {
  const history = queryPool<HistoryRow[]>(
    `SELECT 0 AS sale, price, start, end FROM prices WHERE productId = ?
     UNION ALL
     SELECT 1 AS sale, price, start, end FROM salePrices WHERE productId = ?
     ORDER BY start`,
    [id, id]
  ).then((rows) => ({
    prices: rows.filter((row) => !Number(row.sale)),
    salePrices: rows.filter((row) => Number(row.sale))
  }));
  const [{ prices, salePrices }, [product], sameSku] = await Promise.all([
    history,
    compareProducts(
      [id],
      history.then(
        ({ prices, salePrices }) =>
          new Map([[id, summarizePriceHistory(prices, salePrices)]])
      )
    ),
    sameSkuProducts(id)
  ]);
  if (!product) return undefined;
  const ends = [...prices, ...salePrices].map((row) => toPrice(row).end);
  return {
    ...product,
    prices: prices.map(toPrice),
    salePrices: salePrices.map(toPrice),
    highestPrice: prices.length
      ? Math.max(...prices.map((row) => row.price))
      : null,
    lastSeenDate: ends.sort().at(-1) ?? null,
    sameSku
  };
};
