import { Button, Flex, Layout } from 'antd';
import Link from 'next/link';
import { Header, Content } from 'antd/es/layout/layout';
import PriceChart from '../components/PriceChart/PriceChart';
import Search from '../components/Search/Search';
import UserMenu from '../components/UserMenu/UserMenu';
import { Suspense } from 'react';
import { getPublicStores } from '../utils/stores';

// Prerendered with the stores from the database, the parts that depend on the
// url or the session stream in at request time
export default async function Page() {
  const stores = await getPublicStores();

  return (
    <div>
      <Layout style={{ height: '100vh' }}>
        <Header
          style={{ minHeight: 64, height: 'unset', padding: '20px 50px' }}
        >
          <Flex
            justify="space-between"
            align="center"
            gap={10}
            style={{ height: '100%', width: '100%' }}
            wrap="wrap"
          >
            <Suspense>
              <Search stores={stores} />
            </Suspense>
            <Link href="/search">
              <Button ghost>Ítarleg leit</Button>
            </Link>
            <Suspense>
              <UserMenu returnTo="/" dark />
            </Suspense>
          </Flex>
        </Header>
        <Layout style={{ height: '100vh' }}>
          <Content>
            <Flex
              justify="space-between"
              align="center"
              style={{ height: '100%' }}
            >
              <Suspense>
                <PriceChart stores={stores} />
              </Suspense>
            </Flex>
          </Content>
        </Layout>
      </Layout>
    </div>
  );
}
