import {
  PricesResponse,
  ProductPrices,
  DbId,
  ProductMap,
  Price
} from '../../../types';
import { queryPool } from '../../../utils/mariadb';

interface PriceResult {
  productId: DbId;
  price: number;
  start: Date;
  end: Date;
  sku: string;
  storeId: DbId;
}
type Value = DbId[] | string;

interface ProductInfo {
  id: string;
  sku: string;
  storeId: DbId;
}

export async function POST(request: Request) {
  const getProductPricesFromMap = (
    productMap: ProductMap,
    id: string
  ): Price[] => {
    let productPrices = productMap.get(id);

    if (productPrices === undefined) {
      productPrices = [];
    }
    return productPrices;
  };
  const getPriceChanges = async (
    productIds: string[],
    startDate: string | undefined,
    endDate: string | undefined
  ): Promise<PricesResponse> => {
    const pricesMap: ProductMap = new Map<string, Price[]>();
    const salePricesMap: ProductMap = new Map<string, Price[]>();
    const productInfoMap: Map<string, ProductInfo> = new Map<
      string,
      ProductInfo
    >();
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
          pricesMap,
          row.productId.toString()
        );
        const entry = {
          start: row.start.toISOString().split('T')[0],
          end: row.end.toISOString().split('T')[0],
          price: row.price
        };
        productPrices.push(entry);
        pricesMap.set(row.productId.toString(), productPrices);
      }
    });

    const salePriceChangesPromise = queryPool<PriceResult[]>(
      salePriceQuery + parameters,
      values
    ).then((results) => {
      for (const row of results) {
        const productPrices = getProductPricesFromMap(
          salePricesMap,
          row.productId.toString()
        );
        const entry = {
          start: row.start.toISOString().split('T')[0],
          end: row.end.toISOString().split('T')[0],
          price: row.price
        };

        productPrices.push(entry);
        salePricesMap.set(row.productId.toString(), productPrices);
      }
    });

    const productInfoPromise = queryPool<ProductInfo[]>(
      'SELECT id, sku, storeId FROM products WHERE id IN (?)',
      [productIds.map((id) => parseInt(id))]
    ).then((results) => {
      for (const row of results) {
        productInfoMap.set(row.id.toString(), row);
      }
    });

    await Promise.all([
      priceChangesPromise,
      salePriceChangesPromise,
      productInfoPromise
    ]);

    const response: PricesResponse = await Promise.all(
      Array.from(pricesMap.entries()).map(async ([id, productPrices]) => {
        const result = productInfoMap.get(id);
        const salePriceProductPrices = salePricesMap.get(id);
        return {
          id: id,
          sku: result?.sku ?? '',
          storeId: result?.storeId.toString() ?? '',
          prices: productPrices,
          salePrices: salePriceProductPrices ?? []
        };
      })
    );
    return response;
  };

  const { productIds, start, end } = await request.json();

  if (!productIds || productIds.length == 0) {
    return Response.json([]);
  } else {
    //TODO: validate input
    //TODO: config for max products?
    return getPriceChanges(productIds.slice(0, 20), start, end)
      .then((body) => {
        if (body && body.length > 0) {
          return Response.json(body);
        } else {
          return Response.json([]);
        }
      })
      .catch((error) => {
        console.log(error);
        return Response.error();
      });
  }
}
