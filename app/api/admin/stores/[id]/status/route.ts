import { getTranslation } from '../../../../../../i18n/server';
import {
  HttpError,
  parseId,
  withAdmin
} from '../../../../../../utils/admin/api';
import { getOverview } from '../../../../../../utils/admin/overview';
import { StoreStatus } from '../../../../../../utils/admin/types';

// The status of one store as in the overview, without the jobs and schedules
// of the other stores. The health reasons are in the language of the request.
export const GET = withAdmin<{ params: Promise<{ id: string }> }>(
  async (request, { params }): Promise<StoreStatus> => {
    const id = parseId((await params).id);
    const {
      stores: [status]
    } = await getOverview((await getTranslation('admin')).t, id);
    if (!status) throw new HttpError(404, { key: 'stores.notFound' });
    return status;
  }
);
