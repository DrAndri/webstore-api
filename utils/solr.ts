import { SolrProduct } from '../types';

interface SolrResponse<T> {
  responseHeader: {
    zkConnected: boolean;
    status: number;
    QTime: number;
  };
  response: {
    numFound: number;
    start: number;
    numFoundExact: boolean;
    docs: T[];
  };
}

export const querySolrAutocomplete = async (
  collection: string,
  query: string
) => {
  const params = {
    q: query,
    //TODO: remove when I've updated the core
    fl: 'id,storeId,name,sku,image'
  };
  const queryString = new URLSearchParams(params).toString();
  const response = await fetch(
    `${process.env.SOLR_URL}${collection}/autocomplete?${queryString}`
  );
  return response.json() as Promise<SolrResponse<SolrProduct>>;
};
