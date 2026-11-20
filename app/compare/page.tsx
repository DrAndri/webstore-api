import { Flex } from 'antd';
import { Suspense } from 'react';
import { getTranslation } from '../../i18n/server';
import Compare from '../../components/Compare/Compare';
import SiteHeader from '../../components/SiteHeader/SiteHeader';
import UserMenu from '../../components/UserMenu/UserMenu';
import { getPublicStores } from '../../utils/stores';

export async function generateMetadata() {
  const { t } = await getTranslation('site');
  return { title: t('compare.title') };
}

export const dynamic = 'force-dynamic';

export default async function ComparePage() {
  const stores = await getPublicStores();
  return (
    <Suspense>
      <Flex vertical gap={16} style={{ padding: 24 }}>
        <SiteHeader
          page="compare"
          userMenu={<UserMenu returnTo="/compare" />}
        />
        <Compare stores={stores} />
      </Flex>
    </Suspense>
  );
}
