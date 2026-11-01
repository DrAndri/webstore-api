import { withAdmin } from '../../../../utils/admin/api';
import { getOverview } from '../../../../utils/admin/overview';

export const GET = withAdmin(() => getOverview());
