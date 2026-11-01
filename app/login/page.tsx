import { Alert, Button, Card, Flex } from 'antd';
import Text from 'antd/es/typography/Text';
import Title from 'antd/es/typography/Title';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { safeRedirect } from '../../auth';
import { getSession } from '../../utils/session';
import { signInWithGoogle } from '../actions/auth';

// Reads the session and returnTo, so it waits for the request
export const instant = false;

export const metadata = {
  title: 'Innskráning',
  robots: { index: false, follow: false }
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const { returnTo, error } = await searchParams;
  const target = safeRedirect(returnTo);
  const session = await getSession();
  if (session?.user) redirect(target);

  return (
    <Flex
      justify="center"
      align="center"
      style={{ minHeight: '100vh', padding: 16 }}
    >
      <Card style={{ width: 400, maxWidth: '100%' }}>
        <Flex vertical gap={16}>
          <Title level={4} style={{ margin: 0 }}>
            Innskráning
          </Title>
          {error && (
            <Alert
              type="error"
              showIcon
              title="Innskráning tókst ekki. Netfangið þarf að vera staðfest hjá Google."
            />
          )}
          <Text type="secondary">
            Ef netfangið þitt er skráð sem notandi vefþjónustunnar gilda þín
            mörk á fjölda fyrirspurna, annars sömu mörk og fyrir aðra gesti.
          </Text>
          <form action={signInWithGoogle}>
            <input type="hidden" name="returnTo" value={target} />
            <Button type="primary" size="large" htmlType="submit" block>
              Skrá inn með Google
            </Button>
          </form>
          <Link href={target}>Til baka</Link>
        </Flex>
      </Card>
    </Flex>
  );
}
