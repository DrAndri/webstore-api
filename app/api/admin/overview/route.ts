import { getTranslation } from '../../../../i18n/server';
import { withAdmin } from '../../../../utils/admin/api';
import { getOverview } from '../../../../utils/admin/overview';

// The health reasons are in the language of the request
export const GET = withAdmin(async () =>
  getOverview((await getTranslation('admin')).t)
);
