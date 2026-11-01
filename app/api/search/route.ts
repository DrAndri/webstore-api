import { withApiAccess } from '../../../utils/apiAccess';
import { search, SearchError } from '../../../utils/search';
import { SearchRequest } from '../../../utils/searchFields';

export const POST = withApiAccess(async (request: Request) => {
  let body: SearchRequest;
  try {
    body = (await request.json()) as SearchRequest;
  } catch {
    return Response.json({ error: 'Ógild fyrirspurn' }, { status: 400 });
  }
  try {
    return Response.json(await search(body));
  } catch (e) {
    if (e instanceof SearchError)
      return Response.json({ error: e.message }, { status: 400 });
    console.error('Search failed', e);
    return Response.json({ error: 'Leitin mistókst' }, { status: 500 });
  }
});
