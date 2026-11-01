import { parseId, withAdmin } from '../../../../../../../utils/admin/api';
import { getConfigCommit } from '../../../../../../../utils/admin/github';

// The change a commit made to the config, and the config after it
export const GET = withAdmin<{ params: Promise<{ id: string; sha: string }> }>(
  async (request, { params }) => {
    const { id, sha } = await params;
    return getConfigCommit(parseId(id), sha);
  }
);
