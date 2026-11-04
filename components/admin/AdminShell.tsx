'use client';
import {
  CalendarOutlined,
  DashboardOutlined,
  FileTextOutlined,
  HistoryOutlined,
  KeyOutlined,
  LogoutOutlined,
  ShopOutlined
} from '@ant-design/icons';
import { App, Avatar, Button, Flex, Layout, Menu, Typography } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { signOutUser } from '../../app/actions/auth';
import type { AdminUser } from '../../utils/admin/auth';
import LanguageSwitch from '../I18n/LanguageSwitch';
import ThemeSwitch from '../Theme/ThemeSwitch';

const ITEMS = [
  { key: '/admin', icon: <DashboardOutlined />, label: 'nav.dashboard' },
  { key: '/admin/jobs', icon: <HistoryOutlined />, label: 'nav.jobs' },
  { key: '/admin/logs', icon: <FileTextOutlined />, label: 'nav.logs' },
  { key: '/admin/stores', icon: <ShopOutlined />, label: 'nav.stores' },
  {
    key: '/admin/schedules',
    icon: <CalendarOutlined />,
    label: 'nav.schedules'
  },
  { key: '/admin/api-users', icon: <KeyOutlined />, label: 'nav.apiUsers' }
] as const;

export default function AdminShell({
  user,
  children
}: {
  user: AdminUser;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('common');
  const { t: tAdmin } = useTranslation('admin');
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
            {tAdmin('title')}
          </Typography.Title>
          <Menu
            mode="inline"
            selectedKeys={[selected]}
            items={ITEMS.map((item) => ({
              ...item,
              label: <Link href={item.key}>{tAdmin(item.label)}</Link>
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
              <LanguageSwitch type="text" />
              <ThemeSwitch type="text" />
              {user.image && <Avatar size="small" src={user.image} alt="" />}
              <Typography.Text>{user.name}</Typography.Text>
              <form action={signOutUser}>
                <input type="hidden" name="returnTo" value="/" />
                <Button htmlType="submit" icon={<LogoutOutlined />} type="text">
                  {t('signOut')}
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
