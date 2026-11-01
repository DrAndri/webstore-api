import { redirect } from 'next/navigation';
import AdminShell from '../../../components/admin/AdminShell';
import NoAdminAccess from '../../../components/admin/NoAdminAccess';
import { getAdmin } from '../../../utils/admin/auth';

// Checks the admin before rendering anything, so it waits for the request
export const instant = false;

export const metadata = {
  title: 'Scraper admin',
  robots: { index: false, follow: false }
};

export default async function ConsoleLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { signedIn, admin } = await getAdmin();
  if (!signedIn) redirect('/login?returnTo=/admin');
  if (!admin) return <NoAdminAccess />;
  return <AdminShell user={admin}>{children}</AdminShell>;
}
