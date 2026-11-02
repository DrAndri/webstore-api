import { Price } from '../types';
import { ComparedProduct, compareProducts } from './compare';
import { queryPool } from './mariadb';

export interface ProductDetails extends ComparedProduct {
  // Every price the product has had, oldest first. A price lasts from start
  // to end, the day of the last scan it was seen in.
  prices: Price[];
  salePrices: Price[];
  highestPrice: number | null;
  // The last scan the product was in
  lastSeenDate: string | null;
}

interface PriceRow {
  price: number;
  start: Date;
  end: Date;
}

const toPrice = (row: PriceRow): Price => ({
  price: row.price,
  start: row.start.toISOString().slice(0, 10),
  end: row.end.toISOString().slice(0, 10)
});

// A product of a store in the public search with its whole price history
export const productDetails = async (
  id: number
): Promise<ProductDetails | undefined> => {
  const [[product], prices, salePrices] = await Promise.all([
    compareProducts([id]),
    queryPool<PriceRow[]>(
      'SELECT price, start, end FROM prices WHERE productId = ? ORDER BY start',
      [id]
    ),
    queryPool<PriceRow[]>(
      'SELECT price, start, end FROM salePrices WHERE productId = ? ORDER BY start',
      [id]
    )
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
    lastSeenDate: ends.sort().at(-1) ?? null
  };
};
