import { Flex, Layout } from 'antd';
import { Header, Content } from 'antd/es/layout/layout';
import { StoreConfig } from '../types';
import { queryPool } from '../utils/mariadb';
import PriceChart from '../components/PriceChart/PriceChart';
import Search from '../components/Search/Search';
export default async function Page() {
  const stores = await queryPool<StoreConfig[]>(
    'SELECT id, name FROM stores WHERE apiEnabled = true'
  );

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
