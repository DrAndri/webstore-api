import { Suspense } from 'react';
import AdvancedSearch from '../../components/AdvancedSearch/AdvancedSearch';
import UserMenu from '../../components/UserMenu/UserMenu';

export const metadata = { title: 'Ítarleg leit' };

export default function SearchPage() {
  return (
    <Suspense>
      <AdvancedSearch userMenu={<UserMenu returnTo="/search" />} />
    </Suspense>
  );
}
