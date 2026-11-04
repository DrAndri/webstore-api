import { getTranslation } from '../../../../../i18n/server';
import { withAdmin } from '../../../../../utils/admin/api';
import { describeCron } from '../../../../../utils/admin/cron';

// Validates an expression while it is typed and shows when it would run, the
// errors in the language of the request
export const GET = withAdmin(async (request) =>
  describeCron(
    (request.nextUrl.searchParams.get('cron') ?? '').slice(0, 64),
    (await getTranslation('admin')).t
  )
);
