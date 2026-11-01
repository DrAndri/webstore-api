import { Button, Card, Flex } from 'antd';
import Text from 'antd/es/typography/Text';
import Title from 'antd/es/typography/Title';
import Link from 'next/link';
import { signOutUser } from '../../app/actions/auth';
import { auth } from '../../auth';

export default async function NoAdminAccess() {
  const session = await auth();
  return (
    <Flex
      justify="center"
      align="center"
      style={{ minHeight: '100vh', padding: 16 }}
    >
      <Card style={{ width: 420, maxWidth: '100%' }}>
        <Flex vertical gap={16}>
          <Title level={4} style={{ margin: 0 }}>
            No access
          </Title>
          <Text>
            {session?.user?.email} is not an admin. An admin can give you access
            under API users.
          </Text>
          <Flex gap={8}>
            <form action={signOutUser}>
              <input
                type="hidden"
                name="returnTo"
                value="/login?returnTo=/admin"
              />
              <Button htmlType="submit">Sign in with another account</Button>
            </form>
            <Link href="/">
              <Button type="link">To the website</Button>
            </Link>
          </Flex>
        </Flex>
      </Card>
    </Flex>
  );
}
