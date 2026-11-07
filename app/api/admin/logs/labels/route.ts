import { withAdmin } from '../../../../../utils/admin/api';
import { appLabelCounts } from '../../../../../utils/admin/loki';
import { resolveLogSource } from '../../../../../utils/admin/logs';

// The module labels to filter the app log by, with their line counts. The log
// of a scan has none, its pages are found with the search.
export const GET = withAdmin(
  async (request): Promise<{ value: string; count: number }[]> => {
    const { from, start, end, notStarted } = await resolveLogSource(
      request.nextUrl.searchParams
    );
    if (notStarted || from.source !== 'app') return [];
    return appLabelCounts(start, end);
  }
);
