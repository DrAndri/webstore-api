import { withApiAccess } from '../../../../utils/apiAccess';
import { NextRequest } from 'next/server';
import { findAttributes } from '../../../../utils/search';

// Attributes whose name contains q, for the condition editor
export const GET = withApiAccess(async (request: NextRequest) => {
  const q = request.nextUrl.searchParams.get('q')?.slice(0, 100) ?? '';
  if (q.trim().length < 2) return Response.json([]);
  try {
    return Response.json(await findAttributes(q));
  } catch (e) {
    console.error('Attribute lookup failed', e);
    return Response.json({ error: 'Leitin mistókst' }, { status: 500 });
  }
});
