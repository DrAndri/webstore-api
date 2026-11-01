import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminShell from '../../../components/admin/AdminShell';
import { sessionCookieName, verifySession } from '../../../utils/admin/session';

export const metadata = {
  title: 'Scraper admin',
  robots: { index: false, follow: false }
};

export default async function ConsoleLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession(
    (await cookies()).get(sessionCookieName())?.value
  );
  if (!user) redirect('/admin/login');
  return <AdminShell user={user}>{children}</AdminShell>;
}
