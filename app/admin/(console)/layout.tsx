import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AdminShell from '../../../components/admin/AdminShell';
import NoAdminAccess from '../../../components/admin/NoAdminAccess';
import { getTranslation } from '../../../i18n/server';
import { getAdmin } from '../../../utils/admin/auth';

export const generateMetadata = async (): Promise<Metadata> => {
  const { t } = await getTranslation('admin');
  return { title: t('title'), robots: { index: false, follow: false } };
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
