import { getTranslation } from '../../../i18n/server';
import { apiError, withApiAccess } from '../../../utils/apiAccess';
import { search, SearchError } from '../../../utils/search';
import { SearchRequest } from '../../../utils/searchFields';

export const POST = withApiAccess(async (request: Request) => {
  let body: SearchRequest;
  try {
    body = (await request.json()) as SearchRequest;
  } catch {
    return apiError(400, 'search.invalidRequest');
  }
  try {
    // Facet labels in the language of the request, Icelandic by default
    return Response.json(await search(body, await getTranslation('site')));
  } catch (e) {
    if (e instanceof SearchError) return apiError(400, e);
    console.error('Search failed', e);
    return apiError(500, 'search.failed');
  }
});
