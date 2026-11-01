import { withApiAccess } from '../../../utils/apiAccess';
import { compareProducts, MAX_COMPARED } from '../../../utils/compare';

export const POST = withApiAccess(async (request: Request) => {
  const body = (await request.json().catch(() => ({}))) as {
    productIds?: unknown;
  };
  const ids = Array.isArray(body.productIds)
    ? body.productIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  try {
    return Response.json(
      await compareProducts([...new Set(ids)].slice(0, MAX_COMPARED))
    );
  } catch (e) {
    console.error('Compare failed', e);
    return Response.json({ error: 'Samanburðurinn mistókst' }, { status: 500 });
  }
});
