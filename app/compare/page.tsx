import { Flex } from 'antd';
import Title from 'antd/es/typography/Title';
import Link from 'next/link';
import { Suspense } from 'react';
import { getTranslation } from '../../i18n/server';
import Compare from '../../components/Compare/Compare';
import UserMenu from '../../components/UserMenu/UserMenu';
import { getPublicStores } from '../../utils/stores';

export async function generateMetadata() {
  const { t } = await getTranslation('site');
  return { title: t('compare.title') };
}

export const dynamic = 'force-dynamic';

export default async function ComparePage() {
  const stores = await getPublicStores();
  const { t } = await getTranslation('site');
  return (
    <Flex vertical gap={16} style={{ padding: 24 }}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Title level={3} style={{ margin: 0 }}>
          {t('compare.title')}
        </Title>
        <Flex gap={16} align="center" wrap>
          <Link href="/search">{t('compare.backToSearch')}</Link>
          <UserMenu returnTo="/compare" />
        </Flex>
      </Flex>
      <Suspense>
        <Compare stores={stores} />
      </Suspense>
    </Flex>
  );
}
