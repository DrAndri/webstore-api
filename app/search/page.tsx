import { Suspense } from 'react';
import { getTranslation } from '../../i18n/server';
import AdvancedSearch from '../../components/AdvancedSearch/AdvancedSearch';
import UserMenu from '../../components/UserMenu/UserMenu';

export async function generateMetadata() {
  const { t } = await getTranslation('site');
  return { title: t('advancedSearch.title') };
}

export default function SearchPage() {
  return (
    <Suspense>
      <AdvancedSearch userMenu={<UserMenu returnTo="/search" />} />
    </Suspense>
  );
}
