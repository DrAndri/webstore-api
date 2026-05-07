import { ObjectId } from 'mongodb';

export interface AutocompleteApiRequest extends NextApiRequest {
  body: AutocompleteApiRequestBody;
}
export interface AutocompleteApiRequestBody {
  stores: string[];
  term: string;
}
export interface PricesApiRequest extends NextApiRequest {
  body: PricesApiRequestBody;
}
export interface PricesApiRequestBody {
  productIds?: string[];
  start?: string;
  end?: string;
}
export interface AutocompleteResponse {
  products: SolrProduct[];
}
export type PricesResponse = ProductPricesResponse[];

export interface ProductPricesResponse {
  id: string;
  prices: Price[];
  salePrices?: Price[];
}

export interface Price {
  start: Date;
  end: Date;
  price: number;
}

export interface RechartFormat {
  timestamp: number;
  [key: string]: number;
}

export interface PriceChartProps {
  prices: RechartFormat[];
}

export interface SelectValue {
  key: string;
  label: ReactNode;
  value: string;
}

export type ProductMap = Map<string, ProductPrices>;

export interface ProductPrices {
  prices: Price[];
  salePrices: Price[];
  lastPrice?: Price;
  lastSalePrice?: Price;
}

export interface SolrProduct {
  id: string;
  storeId: DbId;
  manufacturerId?: DbId;
  categoryId?: DbId;
  sku: string;
  name?: string;
  image?: string;
  ean?: string;
  description?: string;
  url?: string;
  inStock?: boolean;
  firstSeenDate: Date;
  lastChangeDate: Date;
}

//Mariadb types

export interface StoreConfig {
  id: DbId;
  name: string;
}

export type DbId = number | bigint;

export interface IdLookup {
  id: DbId;
}

export interface Store {
  id: DbId;
  name: string;
  createdDate: Date;
  lastScanDate: Date;
  scraperEnabled: boolean;
  apiEnabled: boolean;
}

export interface ProductPrice {
  productId: DbId;
  price: number;
  start: Date;
  end: Date;
}

export interface Category {
  id: DbId;
  parentId?: DbId;
  name: string;
}

export interface Manufacturer {
  id: DbId;
  name: string;
}

export interface AttributeGroup {
  id: DbId;
  name: string;
}

export interface Attribute {
  id: DbId;
  groupId: DbId;
  name: string;
}

export interface AttributeToProduct {
  attributeId: DbId;
  productId: DbId;
  value: string;
}

//END Mariadb types
