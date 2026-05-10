import { escapeRegExp } from 'lodash';
import { querySolrAutocomplete } from '../../../utils/solr';

export async function POST(request: Request) {
  const searchSolr = async (term: string) => {
    const response = await querySolrAutocomplete('products', `*:"${term}"`);
    return response.response.docs.splice(0, 20);
  };

  const { term } = await request.json();
  const safeTerm = escapeRegExp(term);

  if (!safeTerm) {
    return Response.json({ results: [] });
  }
  return searchSolr(safeTerm)
    .then((products) => {
      return Response.json({ results: products });
    })
    .catch((error) => {
      console.log(error);
      return Response.error();
    });
}
