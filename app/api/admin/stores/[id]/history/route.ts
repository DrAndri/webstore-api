import { parseId, withAdmin } from '../../../../../../utils/admin/api';
import { getConfigHistory } from '../../../../../../utils/admin/github';

export const GET = withAdmin<{ params: Promise<{ id: string }> }>(
  async (request, { params }) => getConfigHistory(parseId((await params).id))
);
