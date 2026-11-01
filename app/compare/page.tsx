import { Flex, Typography } from 'antd';
import Link from 'next/link';
import { Suspense } from 'react';
import Compare from '../../components/Compare/Compare';
import { StoreConfig } from '../../types';
import { queryPool } from '../../utils/mariadb';

export const metadata = { title: 'Samanburður' };
export const dynamic = 'force-dynamic';

export default async function ComparePage() {
  const stores = await queryPool<StoreConfig[]>(
    'SELECT id, name FROM stores WHERE apiEnabled = true'
  );
  return (
    <Flex vertical gap={16} style={{ padding: 24 }}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Samanburður
        </Typography.Title>
        <Link href="/search">Til baka í leit</Link>
      </Flex>
      <Suspense>
        <Compare stores={stores} />
      </Suspense>
    </Flex>
  );
}
