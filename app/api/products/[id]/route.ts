import { apiError, withApiAccess } from '../../../../utils/apiAccess';
import { productDetails } from '../../../../utils/product';

export const GET = withApiAccess<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0)
      return apiError(400, 'products.invalidId');
    try {
      const product = await productDetails(id);
      if (!product) return apiError(404, 'products.notFound');
      return Response.json(product);
    } catch (e) {
      console.error('Loading the product failed', e);
      return apiError(500, 'products.loadFailed');
    }
  }
);
