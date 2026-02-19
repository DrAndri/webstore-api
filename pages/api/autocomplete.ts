import type { NextApiResponse } from 'next';
import {
  AutocompleteApiRequest,
  AutocompleteResponse,
  MongodbProductMetadata
} from '../../types';
import getMongoDb from '../../utils/mongodb';
import { ObjectId } from 'mongodb';
import { escapeRegExp } from 'lodash';

export default function handler(
  req: AutocompleteApiRequest,
  res: NextApiResponse<AutocompleteResponse>
) {
  const mongoDb = getMongoDb();

  const getTerms = async () => {
    const safeTerm = escapeRegExp(req.body.term);
    const filter = {
      sku: { $regex: new RegExp(safeTerm) },
      store_id: {
        $in: req.body.stores.map((store_id) => new ObjectId(store_id))
      }
    };
    const distinctSkus = await mongoDb
      .collection<MongodbProductMetadata>('productMetadata')
      .distinct('sku', filter, {
        collation: { locale: 'is', numericOrdering: true }
      });
    return distinctSkus.splice(0, 20);
  };

  return new Promise<void>((resolve, reject) => {
    if (req.body.term.length === 0) {
      res.status(200).json({ terms: [] });
      resolve();
    }
    getTerms()
      .then((terms) => {
        res.status(200).json({ terms: terms });
        resolve();
      })
      .catch((error) => {
        console.log(error);
        reject(new Error('Error occured when getting terms'));
      });
  });
}
