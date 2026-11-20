import { Suspense } from 'react';
import { getTranslation } from '../../i18n/server';
import { getPublicStores } from '../../utils/stores';
import PriceView from '../../components/PriceView/PriceView';
import UserMenu from '../../components/UserMenu/UserMenu';

export async function generateMetadata() {
  const { t } = await getTranslation('site');
  return { title: t('prices.title') };
}

// Rendered on each request, the stores come from a cache in memory, so the
// build does not need the database
export const dynamic = 'force-dynamic';

export default async function PricesPage() {
  const stores = await getPublicStores();
  return (
    <Suspense>
      <PriceView stores={stores} userMenu={<UserMenu returnTo="/prices" />} />
    </Suspense>
  );
}
