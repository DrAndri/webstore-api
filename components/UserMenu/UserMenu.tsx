import { Avatar, Button, Flex } from 'antd';
import Text from 'antd/es/typography/Text';
import Link from 'next/link';
import { signOutUser } from '../../app/actions/auth';
import { auth } from '../../auth';
import ThemeSwitch from '../Theme/ThemeSwitch';

// Sign in and out and the theme switch for the public pages. dark is for the
// dark page header.
export default async function UserMenu({
  returnTo,
  dark = false
}: {
  returnTo: string;
  dark?: boolean;
}) {
  const session = await auth();
  if (!session?.user)
    return (
      <Flex gap={8} align="center">
        <ThemeSwitch dark={dark} />
        <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
          <Button ghost={dark}>Skrá inn</Button>
        </Link>
      </Flex>
    );
  return (
    <Flex gap={8} align="center">
      <ThemeSwitch dark={dark} />
      {session.user.image && (
        <Avatar size="small" src={session.user.image} alt="" />
      )}
      <Text style={dark ? { color: '#fff' } : undefined}>
        {session.user.name ?? session.user.email}
      </Text>
      <form action={signOutUser}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button ghost={dark} htmlType="submit">
          Skrá út
        </Button>
      </form>
    </Flex>
  );
}
