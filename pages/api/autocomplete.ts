import type { NextApiResponse } from 'next';
import { AutocompleteApiRequest, AutocompleteResponse } from '../../types';
import { escapeRegExp } from 'lodash';
import { querySolrAutocomplete } from '../../utils/solr';

export default function handler(
  req: AutocompleteApiRequest,
  res: NextApiResponse<AutocompleteResponse>
) {
  const searchSolr = async (term: string) => {
    const response = await querySolrAutocomplete('products', `*:"${term}"`);
    return response.response.docs.splice(0, 20);
  };
  const safeTerm = escapeRegExp(req.body.term);
  return new Promise<void>((resolve, reject) => {
    if (req.body.term.length === 0) {
      res.status(200).json({ products: [] });
      resolve();
    }
    searchSolr(safeTerm)
      .then((products) => {
        res.status(200).json({ products: products });
        resolve();
      })
      .catch((error) => {
        console.log(error);
        reject(new Error('Error occured when getting terms'));
      });
  });
}
