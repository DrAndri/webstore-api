import { Flex } from 'antd';
import Title from 'antd/es/typography/Title';
import Link from 'next/link';
import { Suspense } from 'react';
import Compare from '../../components/Compare/Compare';
import UserMenu from '../../components/UserMenu/UserMenu';
import { getPublicStores } from '../../utils/stores';

export const metadata = { title: 'Samanburður' };

export default async function ComparePage() {
  const stores = await getPublicStores();
  return (
    <Flex vertical gap={16} style={{ padding: 24 }}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Title level={3} style={{ margin: 0 }}>
          Samanburður
        </Title>
        <Flex gap={16} align="center" wrap>
          <Link href="/search">Til baka í leit</Link>
          <Suspense>
            <UserMenu returnTo="/compare" />
          </Suspense>
        </Flex>
      </Flex>
      <Suspense>
        <Compare stores={stores} />
      </Suspense>
    </Flex>
  );
}
