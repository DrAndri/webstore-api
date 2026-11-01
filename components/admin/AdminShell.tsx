'use client';
import {
  CalendarOutlined,
  DashboardOutlined,
  HistoryOutlined,
  KeyOutlined,
  LogoutOutlined,
  ShopOutlined
} from '@ant-design/icons';
import { App, Avatar, Button, Flex, Layout, Menu, Typography } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminUser } from '../../utils/admin/session';

const ITEMS = [
  { key: '/admin', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/admin/jobs', icon: <HistoryOutlined />, label: 'Scan history' },
  { key: '/admin/stores', icon: <ShopOutlined />, label: 'Stores' },
  { key: '/admin/schedules', icon: <CalendarOutlined />, label: 'Schedules' },
  { key: '/admin/api-users', icon: <KeyOutlined />, label: 'API users' }
];

export default function AdminShell({
  user,
  children
}: {
  user: AdminUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const selected =
    [...ITEMS]
      .reverse()
      .find(
        (item) => pathname === item.key || pathname.startsWith(item.key + '/')
      )?.key ?? '/admin';

  return (
    <App>
      <Layout style={{ minHeight: '100vh' }}>
        <Layout.Sider breakpoint="lg" collapsedWidth={0} theme="light">
          <Typography.Title
            level={5}
            style={{ padding: '16px 24px', margin: 0 }}
          >
            Scraper admin
          </Typography.Title>
          <Menu
            mode="inline"
            selectedKeys={[selected]}
            items={ITEMS.map((item) => ({
              ...item,
              label: <Link href={item.key}>{item.label}</Link>
            }))}
          />
        </Layout.Sider>
        <Layout>
          <Layout.Header
            style={{ background: 'transparent', padding: '0 24px', height: 56 }}
          >
            <Flex
              justify="end"
              align="center"
              gap={12}
              style={{ height: '100%' }}
            >
              <Avatar
                size="small"
                src={`https://avatars.githubusercontent.com/u/${user.id}?s=48`}
                alt=""
              />
              <Typography.Text>{user.name}</Typography.Text>
              <form action="/api/admin/auth/logout" method="post">
                <Button htmlType="submit" icon={<LogoutOutlined />} type="text">
                  Sign out
                </Button>
              </form>
            </Flex>
          </Layout.Header>
          <Layout.Content style={{ padding: '0 24px 24px' }}>
            {children}
          </Layout.Content>
        </Layout>
      </Layout>
    </App>
  );
}
