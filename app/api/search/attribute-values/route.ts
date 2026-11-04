import { apiError, withApiAccess } from '../../../../utils/apiAccess';
import { NextRequest } from 'next/server';
import { attributeValues } from '../../../../utils/search';

// The most common values of an attribute, optionally containing q
export const GET = withApiAccess(async (request: NextRequest) => {
  const id = Number(request.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 0)
    return apiError(400, 'search.invalidAttribute');
  try {
    return Response.json(
      await attributeValues(id, request.nextUrl.searchParams.get('q') ?? '')
    );
  } catch (e) {
    console.error('Attribute values failed', e);
    return apiError(500, 'search.failed');
  }
});
