import { withAdmin } from '../../../../../utils/admin/api';
import { appLabelCounts, scanPages } from '../../../../../utils/admin/loki';
import { resolveLogSource } from '../../../../../utils/admin/logs';

const MAX_PAGES = 100;

// The labels to filter a log by: the modules in the app log with their line
// counts, or the pages in the log of a scan matching q
export const GET = withAdmin(
  async (request): Promise<{ value: string; count?: number }[]> => {
    const params = request.nextUrl.searchParams;
    const { from, start, end, notStarted } = await resolveLogSource(params);
    if (notStarted) return [];
    if (from.source === 'app') return appLabelCounts(start, end);

    const q = (params.get('q') ?? '').trim().toLowerCase();
    const pages = await scanPages(from, start, end);
    return (
      pages
        .filter((page) => page.toLowerCase().includes(q))
        // The summary of the scan first
        .sort((a, b) => Number(b === 'Scan log') - Number(a === 'Scan log'))
        .slice(0, MAX_PAGES)
        .map((value) => ({ value }))
    );
  }
);
