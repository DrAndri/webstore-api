import { Alert, Button, Card, Flex } from 'antd';
import Text from 'antd/es/typography/Text';
import Title from 'antd/es/typography/Title';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, safeRedirect } from '../../auth';
import LanguageSwitch from '../../components/I18n/LanguageSwitch';
import { getTranslation } from '../../i18n/server';
import { signInWithGoogle } from '../actions/auth';

export async function generateMetadata() {
  const { t } = await getTranslation('site');
  return {
    title: t('login.title'),
    robots: { index: false, follow: false }
  };
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const { returnTo, error } = await searchParams;
  const target = safeRedirect(returnTo);
  const session = await auth();
  if (session?.user) redirect(target);
  const { t } = await getTranslation('site');

  return (
    <Flex
      justify="center"
      align="center"
      style={{ minHeight: '100vh', padding: 16 }}
    >
      <Card style={{ width: 400, maxWidth: '100%' }}>
        <Flex vertical gap={16}>
          <Flex justify="space-between" align="center" gap={8}>
            <Title level={4} style={{ margin: 0 }}>
              {t('login.title')}
            </Title>
            <LanguageSwitch type="text" />
          </Flex>
          {error && <Alert type="error" showIcon title={t('login.failed')} />}
          <Text type="secondary">{t('login.limits')}</Text>
          <form action={signInWithGoogle}>
            <input type="hidden" name="returnTo" value={target} />
            <Button type="primary" size="large" htmlType="submit" block>
              {t('login.withGoogle')}
            </Button>
          </form>
          <Link href={target}>{t('login.back')}</Link>
        </Flex>
      </Card>
    </Flex>
  );
}
