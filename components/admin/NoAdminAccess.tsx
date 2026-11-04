import { Button, Card, Flex } from 'antd';
import Text from 'antd/es/typography/Text';
import Title from 'antd/es/typography/Title';
import Link from 'next/link';
import { signOutUser } from '../../app/actions/auth';
import { auth } from '../../auth';
import { getTranslation } from '../../i18n/server';

export default async function NoAdminAccess() {
  const [session, { t }] = await Promise.all([auth(), getTranslation('admin')]);
  return (
    <Flex
      justify="center"
      align="center"
      style={{ minHeight: '100vh', padding: 16 }}
    >
      <Card style={{ width: 420, maxWidth: '100%' }}>
        <Flex vertical gap={16}>
          <Title level={4} style={{ margin: 0 }}>
            {t('noAccess.title')}
          </Title>
          <Text>
            {t('noAccess.text', { email: session?.user?.email ?? '' })}
          </Text>
          <Flex gap={8}>
            <form action={signOutUser}>
              <input
                type="hidden"
                name="returnTo"
                value="/login?returnTo=/admin"
              />
              <Button htmlType="submit">{t('noAccess.switchAccount')}</Button>
            </form>
            <Link href="/">
              <Button type="link">{t('noAccess.toWebsite')}</Button>
            </Link>
          </Flex>
        </Flex>
      </Card>
    </Flex>
  );
}
