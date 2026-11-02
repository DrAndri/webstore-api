import { withApiAccess } from '../../../../utils/apiAccess';
import { productDetails } from '../../../../utils/product';

export const GET = withApiAccess<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0)
      return Response.json({ error: 'Ógilt vörunúmer' }, { status: 400 });
    try {
      const product = await productDetails(id);
      if (!product)
        return Response.json({ error: 'Varan fannst ekki' }, { status: 404 });
      return Response.json(product);
    } catch (e) {
      console.error('Loading the product failed', e);
      return Response.json(
        { error: 'Ekki tókst að sækja vöruna' },
        { status: 500 }
      );
    }
  }
);
