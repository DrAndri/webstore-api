import { Suspense } from 'react';
import AdvancedSearch from '../../components/AdvancedSearch/AdvancedSearch';

export const metadata = { title: 'Ítarleg leit' };

export default function SearchPage() {
  return (
    <Suspense>
      <AdvancedSearch />
    </Suspense>
  );
}
