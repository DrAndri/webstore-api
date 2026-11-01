import { Button, Flex, Layout } from 'antd';
import Link from 'next/link';
import { Header, Content } from 'antd/es/layout/layout';
import { getPublicStores } from '../utils/stores';
import PriceChart from '../components/PriceChart/PriceChart';
import Search from '../components/Search/Search';
import UserMenu from '../components/UserMenu/UserMenu';

// Rendered on each request, the stores come from a cache in memory, so the
// build does not need the database
export const dynamic = 'force-dynamic';

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
            <Search stores={stores} />
            <Link href="/search">
              <Button ghost>Ítarleg leit</Button>
            </Link>
            <UserMenu returnTo="/" dark />
          </Flex>
        </Header>
        <Layout style={{ height: '100vh' }}>
          <Content>
            <Flex
              justify="space-between"
              align="center"
              style={{ height: '100%' }}
            >
              <PriceChart stores={stores} />
            </Flex>
          </Content>
        </Layout>
      </Layout>
    </div>
  );
}
