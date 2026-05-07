import type { NextApiResponse } from 'next';
import {
  PricesResponse,
  ProductPrices,
  PricesApiRequest,
  DbId,
  ProductMap
} from '../../types';
import { queryPool } from '../../utils/mariadb';

interface PriceResult {
  productId: DbId;
  price: number;
  start: Date;
  end: Date;
}
type Value = DbId[] | Date;

export default function handler(
  req: PricesApiRequest,
  res: NextApiResponse<PricesResponse>
) {
  const getProductPricesFromMap = (
    productMap: ProductMap,
    id: string
  ): ProductPrices => {
    let productPrices = productMap.get(id);

    if (productPrices === undefined) {
      productPrices = {
        lastPrice: undefined,
        lastSalePrice: undefined,
        prices: [],
        salePrices: []
      };
    }
    return productPrices;
  };
  const getPriceChanges = async (
    productIds: string[],
    startDate: Date | undefined,
    endDate: Date | undefined
  ): Promise<PricesResponse> => {
    const productMap: ProductMap = new Map<string, ProductPrices>();

    const values: Value[] = [];

    values.push(productIds.map((id) => parseInt(id)));
    const parameters = '';
    if (startDate) {
      parameters.concat(' AND end >= ?');
      values.push(startDate);
    }
    if (endDate) {
      parameters.concat(' AND start <= ?');
      values.push(endDate);
    }

    parameters.concat(' ORDER BY start ASC');

    const query =
      'SELECT productId, price, start, end FROM %TABLE% WHERE productId IN (?)';

    const priceQuery = query.replace('%TABLE%', 'prices');
    const salePriceQuery = query.replace('%TABLE%', 'salePrices');

    const priceChangesPromise = queryPool<PriceResult[]>(
      priceQuery + parameters,
      values
    ).then((results) => {
      for (const row of results) {
        const productPrices = getProductPricesFromMap(
          productMap,
          row.productId.toString()
        );
        const entry = {
          start: row.start,
          end: row.end,
          price: row.price
        };
        productPrices.prices.push(entry);
        productPrices.lastPrice = entry;
        productMap.set(row.productId.toString(), productPrices);
      }
    });

    const salePriceChangesPromise = queryPool<PriceResult[]>(
      salePriceQuery + parameters,
      values
    ).then((results) => {
      for (const row of results) {
        const productPrices = getProductPricesFromMap(
          productMap,
          row.productId.toString()
        );
        const entry = {
          start: row.start,
          end: row.end,
          price: row.price
        };

        productPrices.salePrices.push(entry);
        productPrices.lastSalePrice = entry;
        productMap.set(row.productId.toString(), productPrices);
      }
    });

    await Promise.all([priceChangesPromise, salePriceChangesPromise]);

    const response: PricesResponse = Array.from(productMap.entries()).map(
      ([id, productPrices]) => {
        return {
          id: id,
          prices: productPrices.prices,
          salePrices: productPrices.salePrices
        };
      }
    );
    return response;
  };

  //TODO: config for max products?
  const productIds: string[] | undefined = req.body.productIds?.splice(0, 20);
  const start: string | undefined = req.body.start;
  const end: string | undefined = req.body.end;

  return new Promise<void>((resolve, reject) => {
    if (!productIds || productIds.length == 0) {
      res.status(200);
      resolve();
    } else {
      const startDate = start ? new Date(start) : undefined;
      const endDate = end ? new Date(end) : undefined;
      getPriceChanges(productIds, startDate, endDate)
        .then((body) => {
          if (body && body.length > 0) {
            res.status(200).json(body);
          } else {
            res.status(404).json(body);
          }
          resolve();
        })
        .catch((error) => {
          console.log(error);
          reject(new Error('Error occured when getting prices'));
        });
    }
  });
}
