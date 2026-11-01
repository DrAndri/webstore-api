import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LoginCard from '../../../components/admin/LoginCard';
import {
  isAdminConfigured,
  sessionCookieName,
  verifySession
} from '../../../utils/admin/session';
import { safeReturnTo } from '../../api/admin/auth/returnTo';

export const metadata = {
  title: 'Sign in · Scraper admin',
  robots: { index: false, follow: false }
};

const ERRORS: Record<string, string> = {
  'not-configured':
    'The admin interface is not configured. Set the ADMIN_* and GITHUB_OAUTH_* environment variables.',
  state: 'The sign in expired or was started in another tab. Try again.',
  github: 'GitHub did not accept the sign in. Try again.',
  forbidden: 'Your GitHub account does not have access to the admin interface.'
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{
    error?: string;
    returnTo?: string;
    signedOut?: string;
  }>;
}) {
  const { error, returnTo, signedOut } = await searchParams;
  const user = await verifySession(
    (await cookies()).get(sessionCookieName())?.value
  );
  if (user) redirect(safeReturnTo(returnTo));
  const message = !isAdminConfigured()
    ? ERRORS['not-configured']
    : error
      ? (ERRORS[error] ?? 'Signing in failed.')
      : undefined;

  return (
    <LoginCard
      error={message}
      signedOut={!!signedOut}
      loginUrl={`/api/admin/auth/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`}
      disabled={!isAdminConfigured()}
    />
  );
}
